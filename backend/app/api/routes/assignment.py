from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import date, datetime
from app.api.deps import get_supabase
from app.services.geocode import address_to_coords, fallback_coords_from_address
from app.services.clustering import assign_stations
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assignments", tags=["배분"])


class AssignmentPreviewRequest(BaseModel):
    start_date: date
    end_date: date
    employee_ids: list[str]
    file_id: str | None = None


class AssignmentItem(BaseModel):
    station_id: str
    employee_id: str
    scheduled_date: date
    sort_order: int = 0


class AssignmentConfirmRequest(BaseModel):
    items: list[AssignmentItem]


class ReassignRequest(BaseModel):
    station_id: str
    new_employee_id: str
    scheduled_date: date


@router.post("/preview")
async def preview_assignment(req: AssignmentPreviewRequest):
    """배분 미리보기 - 클러스터링 + 날짜 배정"""
    if req.start_date > req.end_date:
        raise HTTPException(400, "시작일이 종료일보다 늦습니다.")
    if not req.employee_ids:
        raise HTTPException(400, "직원을 선택해주세요.")

    db = get_supabase()

    # 직원 정보 가져오기
    emp_result = db.table("employees").select("*").in_("id", req.employee_ids).execute()
    employees = emp_result.data
    if not employees:
        raise HTTPException(404, "선택한 직원을 찾을 수 없습니다.")

    # 직원별 근무불가일
    unavailable_map: dict[str, set[date]] = {}
    for emp in employees:
        ua_result = (
            db.table("employee_unavailable_dates")
            .select("unavailable_date")
            .eq("employee_id", emp["id"])
            .gte("unavailable_date", req.start_date.isoformat())
            .lte("unavailable_date", req.end_date.isoformat())
            .execute()
        )
        if ua_result.data:
            unavailable_map[emp["id"]] = {
                date.fromisoformat(d["unavailable_date"]) for d in ua_result.data
            }

    # 미배정 기지국 가져오기 (status = pending)
    query = db.table("stations").select("*").eq("status", "pending")
    if req.file_id:
        query = query.eq("file_id", req.file_id)
    station_result = query.execute()
    stations = station_result.data

    if not stations:
        raise HTTPException(404, "배분할 기지국이 없습니다. (status=pending인 기지국이 없습니다)")

    # 좌표 없는 기지국 지오코딩
    geocoded = 0
    fallback_count = 0
    for s in stations:
        if not s.get("lat") or not s.get("lng"):
            addr = s.get("address")
            if addr:
                try:
                    coords = await address_to_coords(addr)
                    if coords:
                        s["lat"], s["lng"] = coords
                        # DB에도 저장
                        db.table("stations").update(
                            {"lat": coords[0], "lng": coords[1]}
                        ).eq("id", s["id"]).execute()
                        geocoded += 1
                except Exception as e:
                    logger.warning(f"지오코딩 실패 ({addr}): {e}")
                    # fallback 좌표라도 사용
                    fb = fallback_coords_from_address(addr)
                    if fb:
                        s["lat"], s["lng"] = fb
                        fallback_count += 1
            else:
                # 주소 없으면 station_name에서 지역 추측
                fb = fallback_coords_from_address(s.get("station_name", ""))
                if fb:
                    s["lat"], s["lng"] = fb
                    fallback_count += 1

    # 클러스터링 + 배분
    result = assign_stations(
        stations=stations,
        employees=employees,
        start_date=req.start_date,
        end_date=req.end_date,
        unavailable_map=unavailable_map,
    )
    result["geocoded_count"] = geocoded
    result["fallback_count"] = fallback_count

    return result


@router.post("/confirm")
async def confirm_assignment(req: AssignmentConfirmRequest):
    """배분 확정 - schedules 테이블에 저장"""
    if not req.items:
        raise HTTPException(400, "배분할 항목이 없습니다.")

    db = get_supabase()
    success = 0
    errors = []

    for item in req.items:
        try:
            # 일정 생성
            schedule_data = {
                "station_id": item.station_id,
                "employee_id": item.employee_id,
                "scheduled_date": item.scheduled_date.isoformat(),
                "sort_order": item.sort_order,
            }
            result = db.table("schedules").insert(schedule_data).execute()

            # 체크리스트 자동 생성
            if result.data:
                db.table("checklists").insert({
                    "schedule_id": result.data[0]["id"],
                }).execute()

            # 기지국 상태 업데이트
            db.table("stations").update(
                {"status": "assigned"}
            ).eq("id", item.station_id).execute()

            success += 1
        except Exception as e:
            errors.append({"station_id": item.station_id, "error": str(e)[:100]})

    return {
        "message": f"{success}건 배분 완료",
        "success": success,
        "failed": len(errors),
        "errors": errors,
    }


@router.post("/reassign")
async def reassign_station(req: ReassignRequest):
    """기지국 재배정 (미리보기 상태에서 직원 변경)"""
    # 이미 확정된 일정이 있으면 업데이트
    db = get_supabase()
    existing = (
        db.table("schedules")
        .select("id")
        .eq("station_id", req.station_id)
        .eq("status", "pending")
        .execute()
    )

    if existing.data:
        db.table("schedules").update({
            "employee_id": req.new_employee_id,
            "scheduled_date": req.scheduled_date.isoformat(),
        }).eq("id", existing.data[0]["id"]).execute()
        return {"message": "재배정 완료"}

    return {"message": "미리보기 상태 - 확정 시 반영됩니다."}


class CoordsUpdateItem(BaseModel):
    station_id: str
    lat: float
    lng: float


class CoordsUpdateRequest(BaseModel):
    items: list[CoordsUpdateItem]


@router.post("/update-coords")
async def batch_update_coords(req: CoordsUpdateRequest):
    """기지국 좌표 일괄 업데이트 (프론트엔드 지오코딩 결과 저장)"""
    db = get_supabase()
    updated = 0
    for item in req.items:
        try:
            db.table("stations").update(
                {"lat": item.lat, "lng": item.lng}
            ).eq("id", item.station_id).execute()
            updated += 1
        except Exception as e:
            logger.warning(f"좌표 업데이트 실패 ({item.station_id}): {e}")

    return {"message": f"{updated}건 좌표 업데이트 완료", "updated": updated}


@router.get("/status")
async def get_assignment_status():
    """배분 현황 조회 - 파일별 그룹화 포함"""
    db = get_supabase()

    # 모든 스케줄 조회 (stations + employees 정보 포함)
    schedules_result = (
        db.table("schedules")
        .select("*, stations(id, station_name, address, lat, lng, status, file_id, region_zone, region_detail), employees(id, name)")
        .in_("status", ["pending", "in_progress"])
        .order("sort_order")
        .execute()
    )

    schedules = schedules_result.data or []
    if not schedules:
        return {"has_assignments": False, "assignments": [], "stats": None, "file_groups": []}

    # 파일 정보 가져오기
    try:
        files_result = db.table("uploaded_files").select("id, filename").execute()
        file_map = {f["id"]: f["filename"] for f in (files_result.data or [])}
    except Exception:
        file_map = {}

    COLORS = [
        "#215288", "#3B82F6", "#22C55E", "#F59E0B",
        "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
        "#F97316", "#14B8A6", "#6366F1", "#EF4444",
    ]

    # 직원별 그룹화
    emp_groups: dict[str, dict] = {}
    color_idx = 0

    # 파일별 그룹화
    file_groups: dict[str, dict] = {}

    # 배분된 고유 station_id 및 관련 file_id 수집
    assigned_station_ids: set[str] = set()
    assigned_file_ids: set[str] = set()

    for s in schedules:
        emp_id = s["employee_id"]
        emp_data = s.get("employees") or {}
        station_data = s.get("stations") or {}
        file_id = station_data.get("file_id") or "unknown"
        station_id = station_data.get("id", "")

        # 고유 station_id, file_id 수집
        if station_id:
            assigned_station_ids.add(station_id)
        if file_id != "unknown":
            assigned_file_ids.add(file_id)

        if emp_id not in emp_groups:
            emp_groups[emp_id] = {
                "employee_id": emp_id,
                "employee_name": emp_data.get("name", "알 수 없음"),
                "color": COLORS[color_idx % len(COLORS)],
                "stations": [],
            }
            color_idx += 1

        station_entry = {
            "station_id": station_id,
            "station_name": station_data.get("station_name", ""),
            "address": station_data.get("address", ""),
            "lat": station_data.get("lat"),
            "lng": station_data.get("lng"),
            "region_zone": station_data.get("region_zone"),
            "region_detail": station_data.get("region_detail"),
            "scheduled_date": s["scheduled_date"],
            "sort_order": s.get("sort_order", 0),
            "file_id": file_id,
        }

        if station_data.get("lat") and station_data.get("lng"):
            emp_groups[emp_id]["stations"].append(station_entry)

        # 파일별 그룹
        if file_id not in file_groups:
            file_groups[file_id] = {
                "file_id": file_id,
                "filename": file_map.get(file_id, "알 수 없음"),
                "total": 0,
                "station_ids": set(),
                "employees": {},
            }
        fg = file_groups[file_id]
        fg["total"] += 1
        fg["station_ids"].add(station_id)
        if emp_id not in fg["employees"]:
            fg["employees"][emp_id] = {
                "employee_id": emp_id,
                "employee_name": emp_data.get("name", "알 수 없음"),
                "count": 0,
            }
        fg["employees"][emp_id]["count"] += 1

    # ===== 배분 현황 수량 계산 (핵심) =====
    # 전체 = 배분이 진행된 파일들의 기지국 총 수
    total_stations = 0
    if assigned_file_ids:
        for fid in assigned_file_ids:
            count_res = (
                db.table("stations")
                .select("id", count="exact")
                .eq("file_id", fid)
                .execute()
            )
            total_stations += count_res.count or 0

    # 배분됨 = 스케줄에 등록된 고유 station_id 수
    assigned_count = len(assigned_station_ids)

    # 미배분 = 전체 - 배분됨
    unassigned_count = total_stations - assigned_count

    # file_groups를 리스트로 변환
    file_groups_list = []
    for fg in file_groups.values():
        fg["employees"] = list(fg["employees"].values())
        del fg["station_ids"]  # set은 JSON 직렬화 불가
        file_groups_list.append(fg)

    assignments = list(emp_groups.values())

    # 마지막 배분 일시
    latest = (
        db.table("schedules")
        .select("created_at")
        .in_("status", ["pending", "in_progress"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    last_assigned_at = latest.data[0]["created_at"] if latest.data else None

    return {
        "has_assignments": True,
        "assignments": assignments,
        "unassigned": [],
        "stats": {
            "total": total_stations,
            "assigned": assigned_count,
            "unassigned": unassigned_count,
        },
        "last_assigned_at": last_assigned_at,
        "file_groups": file_groups_list,
    }


@router.get("/employee-existing")
async def get_employee_existing(
    employee_ids: str,
    start_date: str,
    end_date: str,
):
    """직원별 기존 배정 건수 조회 (날짜 범위)"""
    db = get_supabase()
    ids = [x.strip() for x in employee_ids.split(",") if x.strip()]
    result = []
    for eid in ids:
        count_res = (
            db.table("schedules")
            .select("id", count="exact")
            .eq("employee_id", eid)
            .gte("scheduled_date", start_date)
            .lte("scheduled_date", end_date)
            .in_("status", ["pending", "in_progress"])
            .execute()
        )
        result.append({
            "employee_id": eid,
            "existing_count": count_res.count or 0,
        })
    return result


@router.delete("/cancel")
async def cancel_assignments(file_id: str | None = None):
    """배분 취소 - file_id 지정 시 해당 파일만, 없으면 전체 취소"""
    db = get_supabase()

    if file_id:
        # 해당 파일의 기지국에 연결된 스케줄만 삭제
        station_ids_result = (
            db.table("stations")
            .select("id")
            .eq("file_id", file_id)
            .eq("status", "assigned")
            .execute()
        )
        station_ids = [s["id"] for s in (station_ids_result.data or [])]

        deleted = 0
        for sid in station_ids:
            sched_result = (
                db.table("schedules")
                .select("id")
                .eq("station_id", sid)
                .in_("status", ["pending", "in_progress"])
                .execute()
            )
            for sched in (sched_result.data or []):
                try:
                    db.table("checklists").delete().eq("schedule_id", sched["id"]).execute()
                except Exception:
                    pass
                try:
                    db.table("schedules").delete().eq("id", sched["id"]).execute()
                    deleted += 1
                except Exception as e:
                    logger.warning(f"스케줄 삭제 실패 ({sched['id']}): {e}")

        # 해당 파일의 assigned 기지국만 pending으로 복원
        try:
            db.table("stations").update(
                {"status": "pending"}
            ).eq("file_id", file_id).eq("status", "assigned").execute()
        except Exception as e:
            logger.warning(f"기지국 상태 복원 실패: {e}")

        return {"message": f"{deleted}건 배분 취소 완료 (파일별)", "deleted": deleted}

    else:
        # 전체 취소
        pending_schedules = (
            db.table("schedules")
            .select("id, station_id")
            .in_("status", ["pending", "in_progress"])
            .execute()
        )

        deleted = 0
        if pending_schedules.data:
            schedule_ids = [s["id"] for s in pending_schedules.data]

            for sid in schedule_ids:
                try:
                    db.table("checklists").delete().eq("schedule_id", sid).execute()
                except Exception:
                    pass

            for sid in schedule_ids:
                try:
                    db.table("schedules").delete().eq("id", sid).execute()
                    deleted += 1
                except Exception as e:
                    logger.warning(f"스케줄 삭제 실패 ({sid}): {e}")

        try:
            db.table("stations").update(
                {"status": "pending"}
            ).eq("status", "assigned").execute()
        except Exception as e:
            logger.warning(f"기지국 상태 복원 실패: {e}")

        return {"message": f"{deleted}건 배분 취소 완료 (전체)", "deleted": deleted}
