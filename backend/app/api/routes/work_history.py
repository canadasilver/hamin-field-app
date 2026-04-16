from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from datetime import date
from app.api.deps import get_supabase
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/work-history", tags=["작업이력"])


def _get_current_user(authorization: str, db):
    """토큰으로 현재 사용자 정보 조회"""
    token = authorization.replace("Bearer ", "")
    try:
        auth_res = db.auth.get_user(token)
    except Exception:
        raise HTTPException(401, "인증 정보를 확인할 수 없습니다.")
    if not auth_res or not auth_res.user:
        raise HTTPException(401, "인증 정보를 확인할 수 없습니다.")

    user = auth_res.user
    meta = user.user_metadata or {}

    try:
        result = db.table("users").select("*").eq("id", str(user.id)).single().execute()
        if result.data:
            return result.data
    except Exception:
        pass

    return {
        "id": str(user.id),
        "role": meta.get("role", "employee"),
        "employee_id": meta.get("employee_id"),
        "name": meta.get("name", ""),
    }


class YearWorkUpdate(BaseModel):
    year: int
    content: str | None = None


class WorkHistoryCreate(BaseModel):
    station_id: str
    schedule_id: str | None = None
    content: str
    date: str | None = None


class WorkHistoryUpdate(BaseModel):
    content: str
    date: str | None = None


@router.get("/station/{station_id}")
async def get_station_history(station_id: str):
    """기지국 전체 작업 이력 통합 조회 (연도별 + work_history)"""
    db = get_supabase()

    # stations 테이블에서 work_history JSONB + 기존 컬럼 동시 조회 (하위 호환)
    station_res = (
        db.table("stations")
        .select("work_history, work_2021, work_2022, work_2023, work_2024, work_2025")
        .eq("id", station_id)
        .execute()
    )
    station_data = station_res.data[0] if station_res.data else {}

    # work_history JSONB가 있으면 우선 사용, 없으면 기존 컬럼에서 구성
    raw_json = station_data.get("work_history")
    if raw_json and isinstance(raw_json, dict) and raw_json:
        year_history = {k: v for k, v in raw_json.items() if v}
    else:
        # 기존 컬럼 fallback
        year_history = {
            k: station_data.get(f"work_{k}")
            for k in ("2021", "2022", "2023", "2024", "2025")
            if station_data.get(f"work_{k}")
        }

    # work_history 최신순 조회
    history_res = (
        db.table("work_history")
        .select("*")
        .eq("station_id", station_id)
        .order("date", desc=True)
        .order("created_at", desc=True)
        .execute()
    )

    return {
        "year_history": year_history,
        "work_history": history_res.data or [],
    }


@router.patch("/year/{station_id}")
async def update_year_work(
    station_id: str,
    data: YearWorkUpdate,
    authorization: str = Header(...),
):
    """연도별 작업 내용 수정 (관리자 전용) — work_history JSONB 업데이트"""
    db = get_supabase()
    current_user = _get_current_user(authorization, db)
    if current_user.get("role") != "admin":
        raise HTTPException(403, "관리자만 수정할 수 있습니다.")
    if data.year < 2000 or data.year > 2100:
        raise HTTPException(400, "유효하지 않은 연도입니다.")

    year_str = str(data.year)

    # 현재 work_history 조회
    station_res = db.table("stations").select("work_history").eq("id", station_id).execute()
    if not station_res.data:
        raise HTTPException(404, "기지국을 찾을 수 없습니다.")

    current_json: dict = station_res.data[0].get("work_history") or {}
    if not isinstance(current_json, dict):
        current_json = {}

    # 내용 업데이트: None이면 해당 연도 키 삭제
    if data.content is None:
        current_json.pop(year_str, None)
    else:
        current_json[year_str] = data.content

    update_payload: dict = {"work_history": current_json}
    # 하위 호환: 2021~2025 범위면 개별 컬럼도 동기화
    if 2021 <= data.year <= 2025:
        update_payload[f"work_{data.year}"] = data.content

    result = db.table("stations").update(update_payload).eq("id", station_id).execute()
    if not result.data:
        raise HTTPException(404, "기지국을 찾을 수 없습니다.")
    return result.data[0]


@router.get("/")
async def list_work_history(station_id: str):
    """기지국 work_history만 조회 (최신순)"""
    db = get_supabase()
    result = (
        db.table("work_history")
        .select("*")
        .eq("station_id", station_id)
        .order("date", desc=True)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/")
async def create_work_history(data: WorkHistoryCreate, authorization: str = Header(...)):
    """작업 이력 추가 (작성자 employee_id 저장)"""
    db = get_supabase()
    current_user = _get_current_user(authorization, db)

    today = date.today().isoformat()
    insert_data = {
        "station_id": data.station_id,
        "content": data.content,
        "date": data.date or today,
        "employee_id": current_user.get("employee_id"),
        "employee_name": current_user.get("name", ""),
    }
    if data.schedule_id:
        insert_data["schedule_id"] = data.schedule_id

    result = db.table("work_history").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(500, "저장 실패")
    return result.data[0]


@router.put("/{history_id}")
async def update_work_history(
    history_id: str, data: WorkHistoryUpdate, authorization: str = Header(...)
):
    """작업 이력 수정 (관리자 또는 본인만 가능)"""
    db = get_supabase()
    current_user = _get_current_user(authorization, db)

    existing = db.table("work_history").select("*").eq("id", history_id).execute()
    if not existing.data:
        raise HTTPException(404, "이력을 찾을 수 없습니다.")

    history = existing.data[0]
    is_admin = current_user.get("role") == "admin"
    is_author = bool(
        history.get("employee_id")
        and str(history.get("employee_id")) == str(current_user.get("employee_id") or "")
    )

    if not is_admin and not is_author:
        raise HTTPException(403, "수정 권한이 없습니다.")

    update_data: dict = {"content": data.content}
    if data.date:
        update_data["date"] = data.date

    result = db.table("work_history").update(update_data).eq("id", history_id).execute()
    return result.data[0]


@router.delete("/{history_id}")
async def delete_work_history(history_id: str, authorization: str = Header(...)):
    """작업 이력 삭제 (관리자 또는 본인만 가능)"""
    db = get_supabase()
    current_user = _get_current_user(authorization, db)

    existing = db.table("work_history").select("*").eq("id", history_id).execute()
    if not existing.data:
        raise HTTPException(404, "이력을 찾을 수 없습니다.")

    history = existing.data[0]
    is_admin = current_user.get("role") == "admin"
    is_author = bool(
        history.get("employee_id")
        and str(history.get("employee_id")) == str(current_user.get("employee_id") or "")
    )

    if not is_admin and not is_author:
        raise HTTPException(403, "삭제 권한이 없습니다.")

    db.table("work_history").delete().eq("id", history_id).execute()
    return {"message": "삭제되었습니다."}
