from fastapi import APIRouter, Query
from app.api.deps import get_supabase
from datetime import date, timedelta, datetime
from typing import Optional

router = APIRouter(prefix="/dashboard", tags=["대시보드"])


def _month_range(month: str):
    year, mon = month.split("-")
    start_date = f"{year}-{mon}-01"
    if int(mon) == 12:
        end_date = f"{int(year) + 1}-01-01"
    else:
        end_date = f"{year}-{int(mon) + 1:02d}-01"
    return start_date, end_date


def _fetch_month_schedules(db, start_date: str, end_date: str):
    """해당 기간 스케줄 전체 조회.
    scheduled_date 기준 + 완료된 스케줄은 completed_at 기준도 병합 (페이징 처리)"""
    _select = "id, station_id, employee_id, scheduled_date, status, completed_at"
    _size = 1000

    def _paged_sched():
        data, offset = [], 0
        while True:
            res = (
                db.table("schedules").select(_select)
                .gte("scheduled_date", start_date).lt("scheduled_date", end_date)
                .range(offset, offset + _size - 1).execute()
            )
            data.extend(res.data)
            if len(res.data) < _size:
                break
            offset += _size
        return data

    def _paged_completed():
        data, offset = [], 0
        while True:
            res = (
                db.table("schedules").select(_select)
                .eq("status", "completed")
                .gte("completed_at", start_date).lt("completed_at", end_date)
                .range(offset, offset + _size - 1).execute()
            )
            data.extend(res.data)
            if len(res.data) < _size:
                break
            offset += _size
        return data

    merged: dict = {}
    for item in _paged_sched():
        merged[item["id"]] = item
    for item in _paged_completed():
        merged[item["id"]] = item
    return list(merged.values())


def _dedupe_stations(schedules: list[dict]) -> dict[str, dict]:
    """station_id별 최종 상태 결정 (STATUS_PRIORITY 기준).
    completed/in_progress > pending > postponed, 같은 레벨이면 최신 날짜 우선.
    """
    STATUS_PRIORITY = {"completed": 10, "in_progress": 9, "pending": 2, "postponed": 1}
    station_best: dict[str, dict] = {}

    for s in schedules:
        sid = s["station_id"]
        s_date = s["scheduled_date"]
        s_priority = STATUS_PRIORITY.get(s["status"], 0)

        if sid not in station_best:
            station_best[sid] = s
        else:
            cur = station_best[sid]
            cur_priority = STATUS_PRIORITY.get(cur["status"], 0)

            if s_priority >= 9 and cur_priority < 9:
                station_best[sid] = s
            elif s_priority >= 9 and cur_priority >= 9:
                if s_priority > cur_priority:
                    station_best[sid] = s
            elif cur_priority < 9:
                if s_date > cur["scheduled_date"]:
                    station_best[sid] = s
                elif s_date == cur["scheduled_date"] and s_priority > cur_priority:
                    station_best[sid] = s

    return station_best


def _effective_date(s: dict) -> str:
    """완료된 스케줄은 completed_at 날짜, 그 외는 scheduled_date 기준으로 집계 날짜 반환"""
    if s.get("status") == "completed" and s.get("completed_at"):
        return str(s["completed_at"])[:10]
    return s["scheduled_date"]


@router.get("/summary")
async def get_summary(month: str | None = None):
    """작업 현황 요약 (월별 필터) - 고유 station_id 기준"""
    db = get_supabase()

    if not month:
        month = date.today().strftime("%Y-%m")

    start_date, end_date = _month_range(month)

    schedules = _fetch_month_schedules(db, start_date, end_date)

    # 고유 station_id별로 최종 상태 결정
    # completed/in_progress가 있으면 무조건 해당 상태 (작업이 이미 시작/완료된 것)
    # 나머지는 최신 날짜 기준, 같은 날짜면 pending > postponed
    station_best: dict[str, dict] = {}  # station_id -> {date, status}
    STATUS_PRIORITY = {"completed": 10, "in_progress": 9, "pending": 2, "postponed": 1}

    for s in schedules:
        sid = s["station_id"]
        s_date = s["scheduled_date"]
        s_status = s["status"]
        s_priority = STATUS_PRIORITY.get(s_status, 0)
        if sid not in station_best:
            station_best[sid] = {"date": s_date, "status": s_status, "priority": s_priority}
        else:
            cur = station_best[sid]
            # completed/in_progress는 최우선
            if s_priority >= 9 and cur["priority"] < 9:
                station_best[sid] = {"date": s_date, "status": s_status, "priority": s_priority}
            elif s_priority >= 9 and cur["priority"] >= 9:
                # 둘 다 높은 우선순위면 더 높은 것
                if s_priority > cur["priority"]:
                    station_best[sid] = {"date": s_date, "status": s_status, "priority": s_priority}
            elif cur["priority"] < 9:
                # 둘 다 낮은 우선순위(pending/postponed)면 최신 날짜, 같으면 pending 우선
                if s_date > cur["date"]:
                    station_best[sid] = {"date": s_date, "status": s_status, "priority": s_priority}
                elif s_date == cur["date"] and s_priority > cur["priority"]:
                    station_best[sid] = {"date": s_date, "status": s_status, "priority": s_priority}

    station_status_map: dict[str, str] = {sid: v["status"] for sid, v in station_best.items()}

    status_counts = {"pending": 0, "in_progress": 0, "completed": 0, "postponed": 0}
    for status in station_status_map.values():
        if status in status_counts:
            status_counts[status] += 1

    total = len(station_status_map)
    completion_rate = round(status_counts["completed"] / total * 100, 1) if total > 0 else 0

    # 오늘 현황
    today_str = date.today().isoformat()
    today_schedules = (
        db.table("schedules")
        .select("status")
        .eq("scheduled_date", today_str)
        .execute()
    )
    today_counts = {"pending": 0, "in_progress": 0, "completed": 0, "postponed": 0}
    for s in today_schedules.data:
        status = s["status"]
        if status in today_counts:
            today_counts[status] += 1

    # 기지국 현황
    stations = db.table("stations").select("status", count="exact").execute()
    station_status = {"pending": 0, "assigned": 0, "completed": 0}
    for s in stations.data:
        status = s["status"]
        if status in station_status:
            station_status[status] += 1

    return {
        "month": month,
        "tasks": status_counts,
        "total": total,
        "completion_rate": completion_rate,
        "today": today_str,
        "today_tasks": today_counts,
        "today_total": len(today_schedules.data),
        "stations": station_status,
        "stations_total": stations.count,
    }


@router.get("/task-list")
async def get_task_list(
    month: str | None = None,
    status: Optional[str] = Query(None, description="필터: all, completed, in_progress, pending, postponed"),
):
    """월간 작업 상세 리스트 (고유 station 기준, 기지국/직원 정보 포함)"""
    db = get_supabase()

    if not month:
        month = date.today().strftime("%Y-%m")

    start_date, end_date = _month_range(month)

    # 스케줄 + 기지국 + 직원 조인 조회
    _tlsel = "id, station_id, employee_id, scheduled_date, status, completed_at, stations(station_name, address), employees(name)"
    _tlsize = 1000
    all_data_map: dict[str, dict] = {}

    # 1) scheduled_date 기준
    offset = 0
    while True:
        res = (
            db.table("schedules").select(_tlsel)
            .gte("scheduled_date", start_date).lt("scheduled_date", end_date)
            .range(offset, offset + _tlsize - 1).execute()
        )
        for item in res.data:
            all_data_map[item["id"]] = item
        if len(res.data) < _tlsize:
            break
        offset += _tlsize

    # 2) 완료 스케줄 중 completed_at이 해당 월인 것
    offset = 0
    while True:
        res = (
            db.table("schedules").select(_tlsel)
            .eq("status", "completed")
            .gte("completed_at", start_date).lt("completed_at", end_date)
            .range(offset, offset + _tlsize - 1).execute()
        )
        for item in res.data:
            all_data_map[item["id"]] = item
        if len(res.data) < _tlsize:
            break
        offset += _tlsize

    all_data = list(all_data_map.values())

    # 고유 station_id별 최종 상태 및 정보 결정 (summary와 동일 로직)
    STATUS_PRIORITY = {"completed": 10, "in_progress": 9, "pending": 2, "postponed": 1}
    station_map: dict[str, dict] = {}

    for s in all_data:
        sid = s["station_id"]
        s_date = s["scheduled_date"]
        s_status = s["status"]
        s_priority = STATUS_PRIORITY.get(s_status, 0)
        if sid not in station_map:
            station_map[sid] = s
        else:
            cur = station_map[sid]
            cur_priority = STATUS_PRIORITY.get(cur["status"], 0)
            if s_priority >= 9 and cur_priority < 9:
                station_map[sid] = s
            elif s_priority >= 9 and cur_priority >= 9:
                if s_priority > cur_priority:
                    station_map[sid] = s
            elif cur_priority < 9:
                if s_date > cur["scheduled_date"]:
                    station_map[sid] = s
                elif s_date == cur["scheduled_date"] and s_priority > cur_priority:
                    station_map[sid] = s

    result = []
    for sid, s in station_map.items():
        station_info = s.get("stations") or {}
        employee_info = s.get("employees") or {}
        item = {
            "schedule_id": s["id"],
            "station_id": sid,
            "station_name": station_info.get("station_name", ""),
            "address": station_info.get("address", ""),
            "employee_name": employee_info.get("name", ""),
            "scheduled_date": s["scheduled_date"],
            "effective_date": _effective_date(s),
            "status": s["status"],
        }
        if status and status != "all":
            if item["status"] == status:
                result.append(item)
        else:
            result.append(item)

    result.sort(key=lambda x: x["effective_date"])
    return result


@router.get("/employee-stats")
async def get_employee_stats(month: str | None = None):
    """직원별 월간 통계"""
    db = get_supabase()

    if not month:
        month = date.today().strftime("%Y-%m")

    year, mon = month.split("-")
    start_date = f"{year}-{mon}-01"
    if int(mon) == 12:
        end_date = f"{int(year)+1}-01-01"
    else:
        end_date = f"{year}-{int(mon)+1:02d}-01"

    employees = db.table("employees").select("*").eq("is_active", True).execute()
    result = []

    for emp in employees.data:
        schedules = (
            db.table("schedules")
            .select("status")
            .eq("employee_id", emp["id"])
            .gte("scheduled_date", start_date)
            .lt("scheduled_date", end_date)
            .execute()
        )

        completed = sum(1 for s in schedules.data if s["status"] == "completed")
        total = len(schedules.data)

        result.append({
            "employee_id": emp["id"],
            "name": emp["name"],
            "total_tasks": total,
            "completed_tasks": completed,
            "pending_tasks": total - completed,
            "completion_rate": round(completed / total * 100, 1) if total > 0 else 0,
            "per_task_rate": emp["per_task_rate"],
            "monthly_pay": completed * emp["per_task_rate"],
        })

    return result


@router.get("/annual")
async def get_annual_stats(year: Optional[int] = Query(None)):
    """연간 월별 통계"""
    db = get_supabase()
    if year is None:
        year = date.today().year

    start_date = f"{year}-01-01"
    end_date = f"{year + 1}-01-01"

    _asel = "id, station_id, employee_id, scheduled_date, status, completed_at"
    _asize = 1000
    all_data_map: dict[str, dict] = {}

    # 1) scheduled_date 기준
    offset = 0
    while True:
        res = (
            db.table("schedules").select(_asel)
            .gte("scheduled_date", start_date).lt("scheduled_date", end_date)
            .range(offset, offset + _asize - 1).execute()
        )
        for item in res.data:
            all_data_map[item["id"]] = item
        if len(res.data) < _asize:
            break
        offset += _asize

    # 2) 완료 스케줄 중 completed_at이 해당 연도인 것 (scheduled_date가 다른 연도일 수 있음)
    offset = 0
    while True:
        res = (
            db.table("schedules").select(_asel)
            .eq("status", "completed")
            .gte("completed_at", start_date).lt("completed_at", end_date)
            .range(offset, offset + _asize - 1).execute()
        )
        for item in res.data:
            all_data_map[item["id"]] = item
        if len(res.data) < _asize:
            break
        offset += _asize

    all_data = list(all_data_map.values())

    # 고유 station_id 기준 중복 제거
    station_best = _dedupe_stations(all_data)

    # 월별 집계 (deduped 기준)
    monthly: dict[int, dict] = {
        m: {"month": m, "total": 0, "completed": 0, "pending": 0, "postponed": 0}
        for m in range(1, 13)
    }
    emp_data: dict[str, dict] = {}

    # 유효일 기준 해당 연도 범위 내 기지국만 추출 (totals와 월별 집계 모두 동일 기준 사용)
    in_range = {
        sid: s for sid, s in station_best.items()
        if start_date <= _effective_date(s) < end_date
    }

    for sid, s in in_range.items():
        eff = _effective_date(s)
        month_num = int(eff.split("-")[1])
        status = s["status"]
        monthly[month_num]["total"] += 1
        if status in ("completed", "pending", "postponed"):
            monthly[month_num][status] += 1

        emp_id = s.get("employee_id")
        if emp_id:
            if emp_id not in emp_data:
                emp_data[emp_id] = {"total": 0, "completed": 0}
            emp_data[emp_id]["total"] += 1
            if status == "completed":
                emp_data[emp_id]["completed"] += 1

    # 직원별 통계
    employees = (
        db.table("employees")
        .select("id, name, per_task_rate")
        .eq("is_active", True)
        .execute()
    )
    emp_stats = []
    for emp in employees.data:
        d = emp_data.get(emp["id"], {"total": 0, "completed": 0})
        if d["total"] == 0:
            continue
        emp_stats.append({
            "name": emp["name"],
            "total": d["total"],
            "completed": d["completed"],
            "completion_rate": round(d["completed"] / d["total"] * 100, 1),
            "annual_pay": d["completed"] * emp["per_task_rate"],
        })

    total_all = len(in_range)
    total_completed = sum(1 for s in in_range.values() if s["status"] == "completed")
    total_pending = sum(1 for s in in_range.values() if s["status"] == "pending")
    total_postponed = sum(1 for s in in_range.values() if s["status"] == "postponed")

    return {
        "year": year,
        "monthly": list(monthly.values()),
        "totals": {
            "total": total_all,
            "completed": total_completed,
            "pending": total_pending,
            "postponed": total_postponed,
            "completion_rate": round(total_completed / total_all * 100, 1) if total_all > 0 else 0,
        },
        "employees": emp_stats,
    }


@router.get("/monthly")
async def get_monthly_detail(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
):
    """월간 주차별 통계"""
    db = get_supabase()
    today = date.today()
    if year is None:
        year = today.year
    if month is None:
        month = today.month

    start_date = f"{year}-{month:02d}-01"
    end_date = f"{year + 1}-01-01" if month == 12 else f"{year}-{month + 1:02d}-01"

    _msel = (
        "id, station_id, employee_id, scheduled_date, status, completed_at,"
        " stations(station_name), employees(name)"
    )
    _msize = 1000
    all_data_map: dict[str, dict] = {}

    # 1) scheduled_date 기준
    offset = 0
    while True:
        res = (
            db.table("schedules").select(_msel)
            .gte("scheduled_date", start_date).lt("scheduled_date", end_date)
            .range(offset, offset + _msize - 1).execute()
        )
        for item in res.data:
            all_data_map[item["id"]] = item
        if len(res.data) < _msize:
            break
        offset += _msize

    # 2) 완료 스케줄 중 completed_at이 해당 월인 것
    offset = 0
    while True:
        res = (
            db.table("schedules").select(_msel)
            .eq("status", "completed")
            .gte("completed_at", start_date).lt("completed_at", end_date)
            .range(offset, offset + _msize - 1).execute()
        )
        for item in res.data:
            all_data_map[item["id"]] = item
        if len(res.data) < _msize:
            break
        offset += _msize

    all_data = list(all_data_map.values())

    # 고유 station_id 기준 중복 제거
    station_best = _dedupe_stations(all_data)

    # 주차별 집계 (1주:1~7일, 2주:8~14일, 3주:15~21일, 4주:22~28일, 5주:29~말일)
    weekly: dict[int, dict] = {
        i: {"week": i, "total": 0, "completed": 0, "pending": 0, "postponed": 0}
        for i in range(1, 6)
    }
    emp_data: dict[str, dict] = {}
    station_list = []

    # 유효일 기준 해당 월 범위 내 기지국만 추출 (totals와 주차 집계 모두 동일 기준 사용)
    in_range = {
        sid: s for sid, s in station_best.items()
        if start_date <= _effective_date(s) < end_date
    }

    for sid, s in in_range.items():
        eff = _effective_date(s)
        day_num = int(eff.split("-")[2])
        week_num = min(5, (day_num - 1) // 7 + 1)
        status = s["status"]

        weekly[week_num]["total"] += 1
        if status in ("completed", "pending", "postponed"):
            weekly[week_num][status] += 1

        emp_id = s.get("employee_id")
        emp_name = (s.get("employees") or {}).get("name", "")
        if emp_id:
            if emp_id not in emp_data:
                emp_data[emp_id] = {"name": emp_name, "total": 0, "completed": 0, "postponed": 0}
            emp_data[emp_id]["total"] += 1
            if status == "completed":
                emp_data[emp_id]["completed"] += 1
            elif status == "postponed":
                emp_data[emp_id]["postponed"] += 1

        station_info = s.get("stations") or {}
        raw_completed = s.get("completed_at") or ""
        station_list.append({
            "station_name": station_info.get("station_name", ""),
            "employee_name": emp_name,
            "status": status,
            "completed_at": raw_completed[:10] if raw_completed else "",
        })

    employees = (
        db.table("employees")
        .select("id, name, per_task_rate")
        .eq("is_active", True)
        .execute()
    )
    emp_stats = []
    for emp in employees.data:
        d = emp_data.get(emp["id"])
        if not d or d["total"] == 0:
            continue
        emp_stats.append({
            "name": emp["name"],
            "total": d["total"],
            "completed": d["completed"],
            "postponed": d["postponed"],
            "completion_rate": round(d["completed"] / d["total"] * 100, 1),
            "monthly_pay": d["completed"] * emp["per_task_rate"],
        })

    total_all = len(in_range)
    total_completed = sum(1 for s in in_range.values() if s["status"] == "completed")
    total_pending = sum(1 for s in in_range.values() if s["status"] == "pending")
    total_postponed = sum(1 for s in in_range.values() if s["status"] == "postponed")

    return {
        "year": year,
        "month": month,
        "weekly": list(weekly.values()),
        "totals": {
            "total": total_all,
            "completed": total_completed,
            "pending": total_pending,
            "postponed": total_postponed,
            "completion_rate": round(total_completed / total_all * 100, 1) if total_all > 0 else 0,
        },
        "employees": emp_stats,
        "stations": station_list,
    }


@router.get("/daily")
async def get_daily_stats(target_date: str = Query(None, alias="date")):
    """일별 작업 통계"""
    db = get_supabase()
    if not target_date:
        target_date = date.today().isoformat()

    res = (
        db.table("schedules")
        .select(
            "id, employee_id, status, sort_order, started_at, completed_at,"
            " stations(station_name), employees(name)"
        )
        .eq("scheduled_date", target_date)
        .order("employee_id")
        .order("sort_order")
        .execute()
    )
    all_data = res.data

    def fmt_time(raw: str) -> str:
        if not raw or len(raw) < 16:
            return ""
        return raw[11:16]  # HH:MM

    summary = {"total": len(all_data), "completed": 0, "in_progress": 0, "pending": 0, "postponed": 0}
    emp_data: dict[str, dict] = {}
    task_list = []

    for i, s in enumerate(all_data):
        status = s["status"]
        if status in summary:
            summary[status] += 1

        emp_id = s.get("employee_id")
        emp_name = (s.get("employees") or {}).get("name", "")
        if emp_id:
            if emp_id not in emp_data:
                emp_data[emp_id] = {"name": emp_name, "total": 0, "completed": 0}
            emp_data[emp_id]["total"] += 1
            if status == "completed":
                emp_data[emp_id]["completed"] += 1

        station_info = s.get("stations") or {}
        started_raw = s.get("started_at") or ""
        completed_raw = s.get("completed_at") or ""

        duration: int | None = None
        if started_raw and completed_raw:
            try:
                st = datetime.fromisoformat(started_raw.replace("Z", "+00:00"))
                ct = datetime.fromisoformat(completed_raw.replace("Z", "+00:00"))
                duration = round((ct - st).total_seconds() / 60)
            except Exception:
                pass

        task_list.append({
            "sort_order": s.get("sort_order", i + 1),
            "station_name": station_info.get("station_name", ""),
            "employee_name": emp_name,
            "status": status,
            "started_at": fmt_time(started_raw),
            "completed_at": fmt_time(completed_raw),
            "duration_minutes": duration,
        })

    emp_stats = [
        {
            "name": d["name"],
            "total": d["total"],
            "completed": d["completed"],
            "incomplete": d["total"] - d["completed"],
        }
        for d in emp_data.values()
        if d["total"] > 0
    ]

    return {
        "date": target_date,
        "summary": summary,
        "employees": emp_stats,
        "tasks": task_list,
    }


@router.get("/tasks")
async def get_task_items(
    year: Optional[int] = Query(None),
    month: Optional[str] = Query(None, description="YYYY-MM"),
    target_date: Optional[str] = Query(None, alias="date"),
    status: Optional[str] = Query(None),
):
    """연간/월간/일별 작업 목록 조회 (상태 필터 지원)
    annual stats와 동일하게 scheduled_date + completed_at 양쪽 기준으로 조회하여 집계 수치와 일치."""
    db = get_supabase()

    # 날짜 범위 결정
    use_eq = False
    if target_date:
        start_date = target_date
        end_date = target_date
        use_eq = True
    elif month:
        y_str, m_str = month.split("-")
        mon_i = int(m_str)
        start_date = f"{y_str}-{mon_i:02d}-01"
        end_date = f"{y_str}-{mon_i + 1:02d}-01" if mon_i < 12 else f"{int(y_str) + 1}-01-01"
    elif year:
        start_date = f"{year}-01-01"
        end_date = f"{year + 1}-01-01"
    else:
        today = date.today()
        start_date = f"{today.year}-{today.month:02d}-01"
        end_date = f"{today.year}-{today.month + 1:02d}-01" if today.month < 12 else f"{today.year + 1}-01-01"

    _sel = (
        "id, station_id, employee_id, scheduled_date, status, completed_at,"
        " stations(station_name, address), employees(name)"
    )
    page_size = 1000
    all_data_map: dict[str, dict] = {}

    # 1) scheduled_date 기준 조회
    offset = 0
    while True:
        if use_eq:
            q = db.table("schedules").select(_sel).eq("scheduled_date", start_date)
        else:
            q = (
                db.table("schedules").select(_sel)
                .gte("scheduled_date", start_date).lt("scheduled_date", end_date)
            )
        res = q.range(offset, offset + page_size - 1).execute()
        for item in res.data:
            all_data_map[item["id"]] = item
        if len(res.data) < page_size:
            break
        offset += page_size

    # 2) 완료 스케줄 중 completed_at(UTC)이 해당 기간인 것 병합
    #    annual stats와 동일 기준 — scheduled_date가 다른 연도여도 포함
    if not use_eq:
        offset = 0
        while True:
            res = (
                db.table("schedules").select(_sel)
                .eq("status", "completed")
                .gte("completed_at", start_date).lt("completed_at", end_date)
                .range(offset, offset + page_size - 1).execute()
            )
            for item in res.data:
                all_data_map[item["id"]] = item
            if len(res.data) < page_size:
                break
            offset += page_size

    all_data = list(all_data_map.values())

    # 고유 station_id 기준 중복 제거
    station_best = _dedupe_stations(all_data)

    # 연/월 뷰: _effective_date(완료 시 completed_at, 그 외 scheduled_date) 기준으로 범위 필터
    # → annual/monthly stats 집계 기준과 동일하게 맞춤
    if not use_eq:
        station_best = {
            sid: s for sid, s in station_best.items()
            if start_date <= _effective_date(s) < end_date
        }

    result = []
    for sid, s in station_best.items():
        item_status = s["status"]
        if status and status not in ("all", "") and item_status != status:
            continue
        result.append({
            "id": s["id"],
            "station_name": (s.get("stations") or {}).get("station_name", ""),
            "address": (s.get("stations") or {}).get("address", ""),
            "employee_name": (s.get("employees") or {}).get("name", ""),
            "scheduled_date": s["scheduled_date"],
            "status": item_status,
        })

    result.sort(key=lambda x: x["scheduled_date"])
    return result


@router.get("/weekly-chart")
async def get_weekly_chart():
    """최근 7일 작업 추이"""
    db = get_supabase()
    today = date.today()
    result = []

    for i in range(6, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        schedules = (
            db.table("schedules")
            .select("status")
            .eq("scheduled_date", d)
            .execute()
        )
        completed = sum(1 for s in schedules.data if s["status"] == "completed")
        result.append({
            "date": d,
            "total": len(schedules.data),
            "completed": completed,
        })

    return result
