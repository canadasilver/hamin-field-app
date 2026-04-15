from fastapi import APIRouter, UploadFile, File, HTTPException, Query, BackgroundTasks
from app.api.deps import get_supabase
from app.services.geocode import address_to_coords, REGION_FALLBACK_COORDS
import httpx
from app.core.config import settings
import pandas as pd
import json
import io
import logging
from datetime import date as _date, timedelta

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stations", tags=["기지국"])

# 주소 컬럼 (합쳐서 하나로)
ADDRESS_COLS = ["시/도", "시/군/구", "읍/면/동(리)", "번지"]


def _safe_str(val) -> str:
    """값을 문자열로 안전하게 변환 (NaN, None → 빈문자열)"""
    if pd.isna(val) or val is None:
        return ""
    return str(val).strip()


def _excel_serial_to_date_str(val: str) -> str | None:
    """엑셀 날짜 시리얼 숫자 문자열 → YYYY-MM-DD.
    예) "45951" or "45951.0" → "2025-10-22"
    공식: 1900-01-01 기준, serial 1 = 1900-01-01
    """
    try:
        serial = float(val.strip())
        if serial > 1000:  # 합리적인 날짜 범위 (1902년 이후)
            return (_date(1900, 1, 1) + timedelta(days=int(serial) - 1)).isoformat()
    except (ValueError, TypeError, OverflowError):
        pass
    return None


def _extract_date_str(val: str) -> str | None:
    """점검일자 문자열에서 YYYY-MM-DD 형식 추출.
    예) "2025-10-15 00:00:00" → "2025-10-15", "2025-10" → "2025-10-01"
    엑셀 시리얼 숫자 "45951" or "45951.0" → "2025-10-22"
    """
    if not val:
        return None
    stripped = val.strip()
    # 숫자형 시리얼 처리 (엑셀 날짜가 float으로 읽힌 경우)
    try:
        float(stripped)
        return _excel_serial_to_date_str(stripped)
    except ValueError:
        pass
    date_part = stripped.split()[0].split("T")[0]
    segs = date_part.split("-")
    try:
        if len(segs) >= 3:
            return f"{int(segs[0]):04d}-{int(segs[1]):02d}-{int(segs[2]):02d}"
        elif len(segs) == 2:
            return f"{int(segs[0]):04d}-{int(segs[1]):02d}-01"
    except (ValueError, IndexError):
        pass
    return None


# 국소명 컬럼으로 인식할 이름들
STATION_NAME_ALIASES = {"국소명", "기지국명", "국소 명"}

# 헤더 행을 판별하는 보조 컬럼들 (이 컬럼들이 함께 있으면 헤더 행으로 확신)
HEADER_INDICATOR_COLS = {"NO", "고유번호", "국소ID"}

# 시트 우선순위
PREFERRED_SHEETS = ["작업명단", "국소별결과", "냉방기", "검증대상"]


def _is_header_row(columns) -> str | None:
    """컬럼 목록이 데이터 헤더인지 판별. 국소명 컬럼명을 반환하거나 None."""
    col_strs = {str(c).strip() for c in columns}

    # 1) 국소명/기지국명/국소 명 이 있으면 헤더
    for alias in STATION_NAME_ALIASES:
        if alias in col_strs:
            return alias

    # 2) NO + 고유번호 + 국소ID 가 모두 있으면 헤더 (국소명이 약간 다른 이름일 수 있음)
    if HEADER_INDICATOR_COLS.issubset(col_strs):
        return None  # 헤더는 맞지만 국소명 컬럼이 없으므로 None

    return None


def _read_excel(content: bytes) -> tuple[pd.DataFrame, dict]:
    """엑셀 파일을 읽어 (DataFrame, 메타정보) 반환. 시트명·헤더 위치 자동 감지."""
    try:
        xls = pd.ExcelFile(io.BytesIO(content))
    except Exception:
        raise HTTPException(400, "엑셀 파일을 읽을 수 없습니다.")

    # 시트 시도 순서: 우선순위 시트 → 나머지 시트
    sheets_to_try = []
    for name in PREFERRED_SHEETS:
        if name in xls.sheet_names:
            sheets_to_try.append(name)
    for name in xls.sheet_names:
        if name not in sheets_to_try:
            sheets_to_try.append(name)

    # 각 시트에서 헤더 행 0~19 스캔
    for sheet_name in sheets_to_try:
        for header_row in range(20):
            try:
                df = pd.read_excel(io.BytesIO(content), sheet_name=sheet_name, header=header_row)
                col_strs = {str(c).strip() for c in df.columns}

                # 국소명 계열 컬럼 찾기
                found_col = None
                for alias in STATION_NAME_ALIASES:
                    if alias in col_strs:
                        found_col = alias
                        break

                if not found_col:
                    # NO + 고유번호 + 국소ID 가 모두 있으면 헤더행은 맞음
                    # → 국소명과 유사한 컬럼을 추가 탐색
                    if HEADER_INDICATOR_COLS.issubset(col_strs):
                        for c in col_strs:
                            if "국소" in c and "ID" not in c:
                                found_col = c
                                break
                    if not found_col:
                        continue

                # 컬럼명 통일 → '국소명'
                if found_col != "국소명":
                    df = df.rename(columns={found_col: "국소명"})

                # 실제 데이터가 있는지 확인 (빈 시트 방지)
                test_df = df.dropna(subset=["국소명"])
                if len(test_df) == 0:
                    continue

                meta = {
                    "sheet_used": sheet_name,
                    "header_row": header_row + 1,
                    "total_sheets": xls.sheet_names,
                }
                logger.info(
                    f"헤더 행: {header_row + 1}, 시트: {sheet_name}, "
                    f"컬럼수: {len(df.columns)}, 데이터행: {len(test_df)}"
                )
                return df, meta
            except Exception:
                continue

    raise HTTPException(
        400,
        f"'국소명' 또는 '기지국명' 컬럼을 찾을 수 없습니다. "
        f"확인된 시트: {xls.sheet_names}. 각 시트의 1~20행을 스캔했습니다."
    )


def _parse_row(row, cols: set) -> dict | None:
    """엑셀 1행 → stations 레코드 (새 스키마)"""

    # 국소명 (필수)
    station_name = ""
    if "국소명" in cols:
        station_name = _safe_str(row.get("국소명"))
    elif "기지국명" in cols:
        station_name = _safe_str(row.get("기지국명"))

    if not station_name:
        return None

    data: dict = {"station_name": station_name}

    # 담당자 (담당자 or 담당자명)
    if "담당자" in cols:
        data["manager"] = _safe_str(row.get("담당자"))
    elif "담당자명" in cols:
        data["manager"] = _safe_str(row.get("담당자명"))

    # 연락처 (연락처 or 전화번호)
    if "연락처" in cols:
        data["contact"] = _safe_str(row.get("연락처"))
    elif "전화번호" in cols:
        data["contact"] = _safe_str(row.get("전화번호"))

    # 주소: 시/도 + 시/군/구 + 읍/면/동(리) + 번지 합치기
    addr_parts = [_safe_str(row.get(c)) for c in ADDRESS_COLS if c in cols]
    addr_parts = [p for p in addr_parts if p]
    if addr_parts:
        data["address"] = " ".join(addr_parts)
    elif "주소" in cols:
        data["address"] = _safe_str(row.get("주소"))

    # 작업내용: '25년 점검/조치내역' 우선, 없으면 '점검/조치내역', '작업내용'
    if "25년 점검/조치내역" in cols:
        data["work_2025"] = _safe_str(row.get("25년 점검/조치내역"))
    elif "점검/조치내역" in cols:
        data["work_2025"] = _safe_str(row.get("점검/조치내역"))
    elif "작업내용" in cols:
        data["work_2025"] = _safe_str(row.get("작업내용"))

    # 추가 컬럼 매핑
    simple_map = {
        "NO": "no",
        "고유번호": "unique_no",
        "네트워크단": "network_group",
        "위치코드": "location_code",
        "장비유형": "equipment_type",
        "국소ID": "station_id",
        "옥내/외구분": "indoor_outdoor",
        "바코드번호": "barcode",
        "21년 점검/조치내역": "work_2021",
        "22년 점검/조치내역": "work_2022",
        "23년 점검/조치내역": "work_2023",
        "24년 점검/조치내역": "work_2024",
        "불량사항": "defect",
        "운용팀": "operation_team",
        "건물명": "building_name",
        "예정공정": "planned_process",
        "점검자": "inspector",
        "25년 점검대상": "inspection_target",
        "점검결과": "inspection_result",
        "점검일자": "inspection_date",
        "등록 여부": "registration_status",
        "등록 일자": "registration_date",
    }
    for excel_col, db_col in simple_map.items():
        if excel_col in cols:
            val = _safe_str(row.get(excel_col))
            if val:
                data[db_col] = val

    # 점검일자 추가 별칭 ("25년 점검일자", "점검일")
    if "inspection_date" not in data:
        for alias in ("25년 점검일자", "점검일"):
            if alias in cols:
                val = _safe_str(row.get(alias))
                if val:
                    data["inspection_date"] = val
                    break

    # 날짜 컬럼 시리얼 숫자 → YYYY-MM-DD 변환
    # 엑셀이 날짜를 숫자(45951.0 등)로 저장한 경우 실제 날짜 문자열로 변환
    for date_col in ("inspection_date", "registration_date"):
        if date_col in data:
            converted = _extract_date_str(data[date_col])
            if converted:
                data[date_col] = converted

    # 운용수량 (숫자)
    if "운용수량" in cols:
        val = row.get("운용수량")
        if pd.notna(val):
            try:
                data["operation_count"] = int(float(val))
            except (ValueError, TypeError):
                pass

    # NO (숫자)
    if "no" in data:
        try:
            data["no"] = int(float(data["no"]))
        except (ValueError, TypeError):
            del data["no"]

    # 냉방기 정보 JSON
    cooling_groups = [
        ("냉방기 용량1", "냉방기 제조사1", "자산취득1"),
        ("냉방기 용량2", "냉방기 제조사2", "자산취득일자2"),
        ("냉방기 용량3", "냉방기 제조사3", "자산취득3"),
        ("냉방기 용량4", "냉방기 제조사4", "자산취득일자4"),
    ]
    cooling = []
    for cap_col, mfr_col, acq_col in cooling_groups:
        cap = _safe_str(row.get(cap_col)) if cap_col in cols else ""
        mfr = _safe_str(row.get(mfr_col)) if mfr_col in cols else ""
        acq = _safe_str(row.get(acq_col)) if acq_col in cols else ""
        if cap or mfr or acq:
            cooling.append({"capacity": cap, "manufacturer": mfr, "acquired": acq})
    if cooling:
        data["cooling_info"] = json.dumps(cooling, ensure_ascii=False)

    # 담당직원 이름 (stations 컬럼 아님 — upload_excel에서 스케줄 배분에 사용)
    for alias in ("담당직원", "작업자", "담당기사"):
        if alias in cols:
            emp_name = _safe_str(row.get(alias))
            if emp_name:
                data["_employee_name"] = emp_name
                break

    return data


# --- 파일 관리 API ---


@router.get("/files")
async def list_files():
    """업로드된 파일 목록"""
    db = get_supabase()
    # uploaded_files 테이블 먼저, 없으면 upload_history
    try:
        result = db.table("uploaded_files").select("*").order("upload_date", desc=True).execute()
        return result.data
    except Exception:
        result = db.table("upload_history").select("*").order("created_at", desc=True).execute()
        return result.data


@router.delete("/files/{file_id}")
async def delete_file(file_id: str):
    """파일 및 연결된 기지국 삭제"""
    db = get_supabase()
    # 연결된 기지국 삭제
    try:
        db.table("stations").delete().eq("file_id", file_id).execute()
    except Exception:
        pass
    # 파일 레코드 삭제
    try:
        db.table("uploaded_files").delete().eq("id", file_id).execute()
    except Exception:
        db.table("upload_history").delete().eq("id", file_id).execute()
    return {"message": "삭제되었습니다."}


# --- 엑셀 업로드 ---


@router.post("/upload-excel")
async def upload_excel(file: UploadFile = File(...)):
    """엑셀 파일 업로드 및 파싱"""
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.")

    content = await file.read()
    df, excel_meta = _read_excel(content)
    header_row_num = excel_meta.get("header_row", 1)  # 실제 엑셀 행 번호

    # 빈 행 제거
    df = df.dropna(subset=["국소명"])
    if len(df) == 0:
        raise HTTPException(400, "데이터가 없습니다. '국소명' 컬럼에 값이 있는 행이 없습니다.")

    db = get_supabase()
    cols = set(df.columns)

    # 직원 이름 → id 맵 (한 번만 조회)
    emp_name_map: dict[str, str] = {}
    try:
        emp_rows = db.table("employees").select("id, name").eq("is_active", True).execute()
        emp_name_map = {e["name"]: e["id"] for e in (emp_rows.data or [])}
    except Exception as e:
        logger.warning(f"직원 목록 조회 실패: {e}")

    # uploaded_files 레코드 생성
    file_id = None
    try:
        file_rec = db.table("uploaded_files").insert({
            "filename": file.filename,
            "total_count": len(df),
        }).execute()
        file_id = file_rec.data[0]["id"]
    except Exception:
        # uploaded_files 없으면 upload_history 사용
        try:
            file_rec = db.table("upload_history").insert({
                "file_name": file.filename,
                "total_rows": len(df),
                "success_rows": 0,
                "failed_rows": 0,
            }).execute()
            file_id = file_rec.data[0]["id"]
        except Exception as e:
            logger.error(f"파일 이력 저장 실패: {e}")

    success = 0
    fail = 0
    errors = []
    # (employee_id, scheduled_date) → 다음 sort_order 추적
    sort_order_counter: dict[tuple, int] = {}

    for idx, row in df.iterrows():
        try:
            record = _parse_row(row, cols)
            if not record:
                continue

            # 특수 키 추출 (stations 테이블에 저장하지 않음)
            employee_name = record.pop("_employee_name", None)
            inspection_date = record.get("inspection_date")

            if file_id:
                record["file_id"] = file_id

            # 점검일자 기준 station 상태 결정
            if inspection_date:
                record["status"] = "completed"
            elif employee_name and employee_name in emp_name_map:
                record["status"] = "assigned"
            else:
                record["status"] = "pending"

            # station 저장
            station_res = db.table("stations").insert(record).execute()
            station_id = station_res.data[0]["id"]
            success += 1

            # 담당직원 있으면 스케줄 자동 배분
            if employee_name and employee_name in emp_name_map:
                emp_id = emp_name_map[employee_name]
                # 점검일자 있으면 해당 날짜로, 없으면 오늘
                parsed_date = _extract_date_str(inspection_date) if inspection_date else None
                sched_date = parsed_date or _date.today().isoformat()
                key = (emp_id, sched_date)
                sort_order = sort_order_counter.get(key, 0)
                sort_order_counter[key] = sort_order + 1

                schedule_data: dict = {
                    "station_id": station_id,
                    "employee_id": emp_id,
                    "scheduled_date": sched_date,
                    "sort_order": sort_order,
                }
                if inspection_date:
                    schedule_data["status"] = "completed"
                    schedule_data["completed_at"] = inspection_date
                else:
                    schedule_data["status"] = "pending"

                try:
                    sched_res = db.table("schedules").insert(schedule_data).execute()
                    if sched_res.data:
                        db.table("checklists").insert({
                            "schedule_id": sched_res.data[0]["id"]
                        }).execute()
                except Exception as se:
                    logger.warning(f"스케줄 자동 배분 실패 (station {station_id}): {se}")

        except Exception as e:
            fail += 1
            if len(errors) < 10:
                # idx는 DataFrame 인덱스, 엑셀 행 = 헤더행 + 1(데이터시작) + idx
                excel_row = header_row_num + 1 + idx
                errors.append({"row": excel_row, "error": str(e)[:100]})

    # 파일 레코드 업데이트
    if file_id:
        try:
            db.table("uploaded_files").update({"total_count": success}).eq("id", file_id).execute()
        except Exception:
            try:
                db.table("upload_history").update({"success_rows": success, "failed_rows": fail}).eq("id", file_id).execute()
            except Exception:
                pass

    return {
        "file_id": file_id,
        "filename": file.filename,
        "total": len(df),
        "success": success,
        "failed": fail,
        "errors": errors,
        "sheet_used": excel_meta.get("sheet_used"),
        "header_row": excel_meta.get("header_row"),
    }


# --- 기지국 조회 ---


@router.get("/")
async def list_stations(
    file_id: str | None = None,
    search: str | None = None,
    region: str | None = None,
    team: str | None = None,
    status: str | None = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
):
    """기지국 목록 조회"""
    db = get_supabase()
    query = db.table("stations").select("*").order("created_at", desc=True)

    if file_id:
        query = query.eq("file_id", file_id)
    if status:
        query = query.eq("status", status)
    if region:
        query = query.ilike("address", f"{region}%")
    if team:
        query = query.eq("operation_team", team)
    if search:
        query = query.or_(
            f"station_name.ilike.%{search}%,address.ilike.%{search}%,manager.ilike.%{search}%"
        )

    query = query.range(offset, offset + limit - 1)
    result = query.execute()
    return result.data


@router.get("/filters")
async def get_filters(file_id: str | None = None):
    """필터 옵션 (시/도, 운용팀)"""
    db = get_supabase()
    query = db.table("stations").select("address, operation_team")
    if file_id:
        query = query.eq("file_id", file_id)
    result = query.execute()

    regions = set()
    teams = set()
    for row in result.data:
        addr = row.get("address") or ""
        parts = addr.split()
        if parts:
            regions.add(parts[0])
        t = row.get("operation_team")
        if t:
            teams.add(t)

    return {"regions": sorted(regions), "teams": sorted(teams)}


@router.get("/{station_id}/notes")
async def get_station_notes(station_id: str):
    """기지국별 과거 특이사항 이력 (완료된 일정의 체크리스트 notes)"""
    db = get_supabase()

    # 완료된 일정 조회 (직원 정보 포함)
    schedules_res = (
        db.table("schedules")
        .select("id, scheduled_date, employees(name)")
        .eq("station_id", station_id)
        .eq("status", "completed")
        .order("scheduled_date", desc=True)
        .execute()
    )

    if not schedules_res.data:
        return []

    schedule_map = {s["id"]: s for s in schedules_res.data}
    schedule_ids = list(schedule_map.keys())

    # 특이사항 있는 체크리스트 조회
    checklists_res = (
        db.table("checklists")
        .select("schedule_id, notes")
        .in_("schedule_id", schedule_ids)
        .not_.is_("notes", "null")
        .neq("notes", "")
        .execute()
    )

    result = []
    for cl in (checklists_res.data or []):
        note_text = (cl.get("notes") or "").strip()
        if not note_text:
            continue
        sid = cl["schedule_id"]
        sched = schedule_map.get(sid, {})
        emp = sched.get("employees") or {}
        result.append({
            "date": sched.get("scheduled_date", ""),
            "note": note_text,
            "employee": emp.get("name", "알 수 없음") if isinstance(emp, dict) else "알 수 없음",
        })

    result.sort(key=lambda x: x["date"], reverse=True)
    return result


@router.get("/{station_id}")
async def get_station(station_id: str):
    """기지국 상세"""
    db = get_supabase()
    result = db.table("stations").select("*").eq("id", station_id).execute()
    if not result.data:
        raise HTTPException(404, "기지국을 찾을 수 없습니다.")
    return result.data[0]


@router.delete("/{station_id}")
async def delete_station(station_id: str):
    """기지국 삭제"""
    db = get_supabase()
    db.table("stations").delete().eq("id", station_id).execute()
    return {"message": "삭제되었습니다."}


FALLBACK_COORDS = {(c[0], c[1]) for c in REGION_FALLBACK_COORDS.values()}


def _is_fallback(lat: float | None, lng: float | None) -> bool:
    if lat is None or lng is None:
        return False
    return (lat, lng) in FALLBACK_COORDS


async def _precise_geocode(address: str, name: str) -> tuple[float, float] | None:
    """카카오 REST API로 정확한 좌표 변환 (fallback 좌표 제외)"""
    headers = {"Authorization": f"KakaoAK {settings.KAKAO_REST_API_KEY}"}

    async with httpx.AsyncClient() as client:
        # 1. 주소 검색
        if address:
            try:
                resp = await client.get(
                    "https://dapi.kakao.com/v2/local/search/address.json",
                    params={"query": address}, headers=headers,
                )
                if resp.status_code == 200:
                    docs = resp.json().get("documents", [])
                    if docs:
                        lat, lng = float(docs[0]["y"]), float(docs[0]["x"])
                        if not _is_fallback(lat, lng):
                            return lat, lng
            except Exception:
                pass

        # 2. 주소로 키워드 검색
        if address:
            try:
                resp = await client.get(
                    "https://dapi.kakao.com/v2/local/search/keyword.json",
                    params={"query": address}, headers=headers,
                )
                if resp.status_code == 200:
                    docs = resp.json().get("documents", [])
                    if docs:
                        lat, lng = float(docs[0]["y"]), float(docs[0]["x"])
                        if not _is_fallback(lat, lng):
                            return lat, lng
            except Exception:
                pass

        # 3. station_name으로 키워드 검색
        if name and name != address:
            try:
                resp = await client.get(
                    "https://dapi.kakao.com/v2/local/search/keyword.json",
                    params={"query": name}, headers=headers,
                )
                if resp.status_code == 200:
                    docs = resp.json().get("documents", [])
                    if docs:
                        lat, lng = float(docs[0]["y"]), float(docs[0]["x"])
                        if not _is_fallback(lat, lng):
                            return lat, lng
            except Exception:
                pass

        # 4. 주소에서 번지 제거 후 재시도
        if address:
            parts = address.rsplit(" ", 1)
            if len(parts) == 2:
                try:
                    resp = await client.get(
                        "https://dapi.kakao.com/v2/local/search/address.json",
                        params={"query": parts[0]}, headers=headers,
                    )
                    if resp.status_code == 200:
                        docs = resp.json().get("documents", [])
                        if docs:
                            lat, lng = float(docs[0]["y"]), float(docs[0]["x"])
                            if not _is_fallback(lat, lng):
                                return lat, lng
                except Exception:
                    pass

    return None


async def _geocode_missing_stations():
    """좌표 없거나 fallback인 기지국 일괄 지오코딩 (백그라운드)"""
    db = get_supabase()

    # 1. lat이 null인 기지국
    null_result = db.table("stations").select("id, station_name, address, lat, lng").is_("lat", "null").limit(500).execute()
    stations = null_result.data or []

    # 2. fallback 좌표를 가진 기지국 추가
    all_result = db.table("stations").select("id, station_name, address, lat, lng").not_.is_("lat", "null").limit(2000).execute()
    for s in (all_result.data or []):
        if _is_fallback(s.get("lat"), s.get("lng")):
            stations.append(s)

    updated = 0
    for s in stations:
        address = s.get("address") or ""
        name = s.get("station_name") or ""
        if not address and not name:
            continue

        coords = await _precise_geocode(address, name)
        if coords:
            lat, lng = coords
            try:
                db.table("stations").update({"lat": lat, "lng": lng}).eq("id", s["id"]).execute()
                updated += 1
            except Exception as e:
                logger.warning(f"좌표 저장 실패 ({s['id']}): {e}")

    logger.info(f"일괄 지오코딩 완료: {updated}/{len(stations)}건 업데이트")


@router.post("/geocode-missing")
async def geocode_missing(background_tasks: BackgroundTasks):
    """좌표 없거나 fallback인 기지국 일괄 지오코딩 (백그라운드 실행)"""
    db = get_supabase()

    null_count = (db.table("stations").select("id", count="exact").is_("lat", "null").execute()).count or 0

    all_result = db.table("stations").select("lat, lng").not_.is_("lat", "null").limit(2000).execute()
    fb_count = sum(1 for s in (all_result.data or []) if _is_fallback(s.get("lat"), s.get("lng")))

    total = null_count + fb_count
    if total == 0:
        return {"message": "지오코딩 필요한 기지국이 없습니다.", "missing": 0, "fallback": 0}

    background_tasks.add_task(_geocode_missing_stations)
    return {"message": f"{total}건 지오코딩 시작 (백그라운드)", "missing": null_count, "fallback": fb_count}
