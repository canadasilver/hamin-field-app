from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.api.deps import get_supabase
from app.schemas.schedule import ScheduleCreate, ScheduleUpdate, ScheduleResponse
from app.services.route_optimizer import optimize_route
from datetime import date

router = APIRouter(prefix="/schedules", tags=["일정"])


@router.get("/", response_model=list[dict])
async def list_schedules(
    employee_id: str | None = None,
    scheduled_date: str | None = None,
    status: str | None = None,
):
    """일정 목록 조회 (기지국 정보 포함)"""
    db = get_supabase()
    query = (
        db.table("schedules")
        .select("*, stations(*)")
        .order("sort_order")
    )
    if employee_id:
        query = query.eq("employee_id", employee_id)
    if scheduled_date:
        query = query.eq("scheduled_date", scheduled_date)
    if status:
        query = query.eq("status", status)
    result = query.execute()
    return result.data


@router.post("/", response_model=ScheduleResponse)
async def create_schedule(schedule: ScheduleCreate):
    """일정 생성"""
    db = get_supabase()
    result = (
        db.table("schedules")
        .insert({
            "station_id": str(schedule.station_id),
            "employee_id": str(schedule.employee_id),
            "scheduled_date": schedule.scheduled_date.isoformat(),
            "sort_order": schedule.sort_order,
        })
        .execute()
    )

    # 체크리스트 자동 생성
    db.table("checklists").insert({
        "schedule_id": result.data[0]["id"],
    }).execute()

    return result.data[0]


@router.get("/{schedule_id}")
async def get_schedule(schedule_id: str):
    """단일 일정 조회 (기지국 정보 포함)"""
    db = get_supabase()
    result = (
        db.table("schedules")
        .select("*, stations(*)")
        .eq("id", schedule_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "일정을 찾을 수 없습니다.")
    return result.data


@router.patch("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(schedule_id: str, data: ScheduleUpdate):
    """일정 상태 변경"""
    db = get_supabase()
    update_data = data.model_dump(exclude_none=True)

    if "postponed_to" in update_data:
        update_data["status"] = "postponed"
        update_data["postponed_to"] = update_data["postponed_to"].isoformat()

    result = (
        db.table("schedules").update(update_data).eq("id", schedule_id).execute()
    )
    if not result.data:
        raise HTTPException(404, "일정을 찾을 수 없습니다.")
    return result.data[0]


class ReassignScheduleRequest(BaseModel):
    employee_id: str
    scheduled_date: date


@router.post("/{schedule_id}/reassign")
async def reassign_schedule(schedule_id: str, req: ReassignScheduleRequest):
    """작업 재배정 - 담당 직원/날짜 변경"""
    db = get_supabase()
    schedule = db.table("schedules").select("*").eq("id", schedule_id).execute()
    if not schedule.data:
        raise HTTPException(404, "일정을 찾을 수 없습니다.")

    # 새 직원+날짜에서의 마지막 sort_order 조회
    existing = (
        db.table("schedules")
        .select("sort_order")
        .eq("employee_id", req.employee_id)
        .eq("scheduled_date", req.scheduled_date.isoformat())
        .neq("id", schedule_id)
        .order("sort_order", desc=True)
        .limit(1)
        .execute()
    )
    next_order = (existing.data[0]["sort_order"] + 1) if existing.data else 0

    db.table("schedules").update({
        "employee_id": req.employee_id,
        "scheduled_date": req.scheduled_date.isoformat(),
        "sort_order": next_order,
    }).eq("id", schedule_id).execute()

    return {"message": "재배정 완료", "sort_order": next_order}


@router.post("/{schedule_id}/cancel-complete")
async def cancel_complete(schedule_id: str):
    """완료 취소 - 완료된 일정을 대기 상태로 되돌리기"""
    db = get_supabase()
    schedule = db.table("schedules").select("*").eq("id", schedule_id).execute()
    if not schedule.data:
        raise HTTPException(404, "일정을 찾을 수 없습니다.")

    current = schedule.data[0]
    if current["status"] != "completed":
        raise HTTPException(400, "완료 상태인 일정만 취소할 수 있습니다.")

    # 일정 상태를 pending으로, completed_at을 null로
    db.table("schedules").update({
        "status": "pending",
        "completed_at": None,
    }).eq("id", schedule_id).execute()

    # 기지국 상태도 assigned로 복원
    db.table("stations").update(
        {"status": "assigned"}
    ).eq("id", current["station_id"]).execute()

    return {"message": "완료가 취소되었습니다."}


@router.post("/{schedule_id}/postpone")
async def postpone_schedule(schedule_id: str):
    """일정을 다음날로 미루기 - 기존 레코드의 날짜를 이동 (새 레코드 생성 없음)"""
    from datetime import timedelta
    db = get_supabase()
    schedule = db.table("schedules").select("*").eq("id", schedule_id).execute()
    if not schedule.data:
        raise HTTPException(404, "일정을 찾을 수 없습니다.")

    current = schedule.data[0]
    if current["status"] == "completed":
        raise HTTPException(400, "이미 완료된 일정은 미룰 수 없습니다.")

    # 현재 scheduled_date 기준 다음날 계산 (오늘이 아닌 선택된 날짜 기준)
    current_date = date.fromisoformat(current["scheduled_date"])
    next_date = (current_date + timedelta(days=1)).isoformat()

    # 다음날 마지막 sort_order 조회 (자기 자신 제외)
    existing = (
        db.table("schedules")
        .select("sort_order")
        .eq("employee_id", current["employee_id"])
        .eq("scheduled_date", next_date)
        .neq("id", schedule_id)
        .order("sort_order", desc=True)
        .limit(1)
        .execute()
    )
    next_order = (existing.data[0]["sort_order"] + 1) if existing.data else 0

    # 기존 레코드를 다음날로 이동 — 새 레코드 생성 없이 날짜/상태만 변경
    db.table("schedules").update({
        "scheduled_date": next_date,
        "status": "pending",
        "sort_order": next_order,
        "started_at": None,
        "postponed_to": next_date,  # 미루어진 날짜 기록용
    }).eq("id", schedule_id).execute()

    return {"message": "내일로 미루었습니다.", "next_date": next_date}


@router.post("/optimize-route")
async def optimize_daily_route(
    employee_id: str,
    scheduled_date: str,
    current_lat: float | None = None,
    current_lng: float | None = None,
):
    """특정 직원의 하루 동선 최적화 (current_lat/current_lng 전달 시 현재 위치 기준)"""
    db = get_supabase()
    result = (
        db.table("schedules")
        .select("*, stations(lat, lng, station_name, address)")
        .eq("employee_id", employee_id)
        .eq("scheduled_date", scheduled_date)
        .neq("status", "postponed")
        .execute()
    )

    if not result.data:
        return {"message": "해당 일정이 없습니다.", "route": []}

    stations_for_route = []
    for s in result.data:
        station = s.get("stations", {})
        if station and station.get("lat") and station.get("lng"):
            stations_for_route.append({
                "id": s["id"],
                "station_id": s["station_id"],
                "lat": station["lat"],
                "lng": station["lng"],
                "name": station.get("station_name", ""),
                "address": station.get("address", ""),
            })

    optimized = optimize_route(stations_for_route, start_lat=current_lat, start_lng=current_lng)

    # DB에 sort_order 업데이트
    for item in optimized:
        db.table("schedules").update(
            {"sort_order": item["sort_order"]}
        ).eq("id", item["id"]).execute()

    return {"route": optimized}


@router.post("/gps-event")
async def gps_event(
    schedule_id: str,
    employee_id: str,
    lat: float,
    lng: float,
    event_type: str,
):
    """GPS 이벤트 기록 (arrival/departure)"""
    db = get_supabase()

    # GPS 로그 저장
    db.table("gps_logs").insert({
        "schedule_id": schedule_id,
        "employee_id": employee_id,
        "lat": lat,
        "lng": lng,
        "event_type": event_type,
    }).execute()

    # 일정 상태 자동 변경
    if event_type == "arrival":
        db.table("schedules").update({
            "status": "in_progress",
            "started_at": "now()",
        }).eq("id", schedule_id).execute()
    elif event_type == "departure":
        db.table("schedules").update({
            "status": "completed",
            "completed_at": "now()",
        }).eq("id", schedule_id).execute()
        # 기지국 상태도 업데이트
        schedule = db.table("schedules").select("station_id").eq("id", schedule_id).execute()
        if schedule.data:
            db.table("stations").update(
                {"status": "completed"}
            ).eq("id", schedule.data[0]["station_id"]).execute()

    return {"message": f"{event_type} 이벤트가 기록되었습니다."}
