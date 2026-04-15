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


class WorkHistoryCreate(BaseModel):
    station_id: str
    schedule_id: str | None = None
    content: str
    date: str | None = None


class WorkHistoryUpdate(BaseModel):
    content: str
    date: str | None = None


@router.get("/")
async def list_work_history(station_id: str):
    """기지국 작업 이력 조회 (최신순)"""
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
