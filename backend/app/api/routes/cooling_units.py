from fastapi import APIRouter, HTTPException
from app.api.deps import get_supabase

router = APIRouter(prefix="/cooling-units", tags=["냉방기"])


@router.get("/{station_id}")
async def get_cooling_units(station_id: str):
    """기지국 ID로 냉방기 목록 조회"""
    db = get_supabase()
    try:
        result = (
            db.table("cooling_units")
            .select("*")
            .eq("station_id", station_id)
            .order("unit_number")
            .execute()
        )
        return result.data
    except Exception as e:
        # 테이블 미존재 등 DB 오류 시 빈 목록 반환
        if "PGRST" in str(e) or "does not exist" in str(e):
            return []
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_cooling_unit(data: dict):
    """냉방기 추가"""
    db = get_supabase()
    required = ["station_id", "unit_number"]
    for field in required:
        if field not in data:
            raise HTTPException(status_code=400, detail=f"{field} 필드 필요")
    result = db.table("cooling_units").insert(data).execute()
    return result.data[0] if result.data else {}


@router.patch("/{unit_id}")
async def update_cooling_unit(unit_id: str, data: dict):
    """냉방기 정보 수정"""
    db = get_supabase()
    data.pop("id", None)
    result = db.table("cooling_units").update(data).eq("id", unit_id).execute()
    return result.data[0] if result.data else {}


@router.delete("/{unit_id}")
async def delete_cooling_unit(unit_id: str):
    """냉방기 삭제"""
    db = get_supabase()
    db.table("cooling_units").delete().eq("id", unit_id).execute()
    return {"ok": True}
