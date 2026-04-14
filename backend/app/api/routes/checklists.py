from fastapi import APIRouter, HTTPException
from app.api.deps import get_supabase
from app.schemas.checklist import ChecklistUpdate, ChecklistResponse

router = APIRouter(prefix="/checklists", tags=["체크리스트"])


@router.get("/{schedule_id}", response_model=ChecklistResponse)
async def get_checklist(schedule_id: str):
    """일정별 체크리스트 조회"""
    db = get_supabase()
    result = (
        db.table("checklists")
        .select("*")
        .eq("schedule_id", schedule_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "체크리스트를 찾을 수 없습니다.")
    return result.data[0]


@router.patch("/{schedule_id}", response_model=ChecklistResponse)
async def update_checklist(schedule_id: str, data: ChecklistUpdate):
    """체크리스트 수정"""
    db = get_supabase()
    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(400, "수정할 항목이 없습니다.")

    result = (
        db.table("checklists")
        .update(update_data)
        .eq("schedule_id", schedule_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "체크리스트를 찾을 수 없습니다.")
    return result.data[0]
