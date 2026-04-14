"""K-means 클러스터링 기반 기지국 자동 배분"""
import math
import random
from datetime import date, timedelta
from app.services.route_optimizer import haversine, optimize_route


def _kmeans(coords: list[tuple[float, float]], k: int, max_iter: int = 50) -> list[int]:
    """간단한 K-means 구현. 각 좌표의 클러스터 번호 리스트 반환."""
    n = len(coords)
    if n <= k:
        return list(range(n))

    # K-means++ 초기화: 더 균등한 초기 중심 선택
    centroids = [coords[random.randint(0, n - 1)]]
    for _ in range(1, k):
        dists = []
        for lat, lng in coords:
            min_d = min(haversine(lat, lng, c[0], c[1]) for c in centroids)
            dists.append(min_d ** 2)
        total = sum(dists)
        if total == 0:
            centroids.append(coords[random.randint(0, n - 1)])
            continue
        probs = [d / total for d in dists]
        r = random.random()
        cumsum = 0
        for i, p in enumerate(probs):
            cumsum += p
            if cumsum >= r:
                centroids.append(coords[i])
                break

    labels = [0] * n

    for _ in range(max_iter):
        # 가장 가까운 중심에 할당
        new_labels = []
        for lat, lng in coords:
            dists = [haversine(lat, lng, c[0], c[1]) for c in centroids]
            new_labels.append(dists.index(min(dists)))

        if new_labels == labels:
            break
        labels = new_labels

        # 중심 업데이트
        for i in range(k):
            members = [(coords[j][0], coords[j][1]) for j in range(n) if labels[j] == i]
            if members:
                centroids[i] = (
                    sum(m[0] for m in members) / len(members),
                    sum(m[1] for m in members) / len(members),
                )

    return labels


def _get_workdays(start: date, end: date, unavailable: set[date] | None = None) -> list[date]:
    """근무일 리스트 (주말 제외, 근무불가일 제외)"""
    days = []
    current = start
    unavailable = unavailable or set()
    while current <= end:
        if current.weekday() < 5 and current not in unavailable:  # 월~금
            days.append(current)
        current += timedelta(days=1)
    return days


def _balanced_kmeans(
    coords: list[tuple[float, float]],
    capacities: list[int],
    max_iter: int = 100,
) -> list[int]:
    """
    수용량 비율을 고려한 균형 K-means.
    각 클러스터의 크기가 capacities 비율에 맞도록 조정.
    """
    n = len(coords)
    k = len(capacities)

    if n <= k:
        return list(range(n))

    # 먼저 일반 K-means로 초기 클러스터링
    labels = _kmeans(coords, k)

    # 중심 계산
    centroids = []
    for i in range(k):
        members = [coords[j] for j in range(n) if labels[j] == i]
        if members:
            centroids.append((
                sum(m[0] for m in members) / len(members),
                sum(m[1] for m in members) / len(members),
            ))
        else:
            centroids.append(coords[random.randint(0, n - 1)])

    # 목표 크기 계산 (수용량 비율에 따라)
    total_capacity = sum(capacities)
    target_sizes = []
    remaining_stations = n
    for i, cap in enumerate(capacities):
        if i == len(capacities) - 1:
            target_sizes.append(remaining_stations)
        else:
            size = round(n * cap / total_capacity)
            size = max(1, min(size, remaining_stations - (k - i - 1)))
            target_sizes.append(size)
            remaining_stations -= size

    # 균형 재배분: 각 기지국을 가장 가까운 중심에 배정하되 목표 크기 존중
    for _ in range(max_iter):
        # 각 기지국과 각 중심 간 거리 계산
        distances = []
        for j in range(n):
            row = []
            for i in range(k):
                d = haversine(coords[j][0], coords[j][1], centroids[i][0], centroids[i][1])
                row.append(d)
            distances.append(row)

        # 거리 기준으로 정렬하여 가까운 것부터 배정
        assignments = [[] for _ in range(k)]
        assigned = [False] * n

        # 각 기지국에 대해 선호 클러스터 순서 계산
        preferences = []
        for j in range(n):
            pref = sorted(range(k), key=lambda c: distances[j][c])
            preferences.append(pref)

        # 라운드 로빈 방식: 아직 다 안 찬 클러스터 순서로 가장 가까운 미배정 기지국을 가져감
        cluster_counts = [0] * k
        while any(not a for a in assigned):
            progress = False
            for c in range(k):
                if cluster_counts[c] >= target_sizes[c]:
                    continue
                # 이 클러스터에 가장 가까운 미배정 기지국 찾기
                best_j = -1
                best_d = float("inf")
                for j in range(n):
                    if not assigned[j] and distances[j][c] < best_d:
                        best_d = distances[j][c]
                        best_j = j
                if best_j >= 0:
                    assignments[c].append(best_j)
                    assigned[best_j] = True
                    cluster_counts[c] += 1
                    progress = True

            if not progress:
                # 모든 클러스터가 꽉 찼지만 미배정 기지국이 있으면 가장 여유 있는 곳에 배정
                for j in range(n):
                    if not assigned[j]:
                        # 가장 가까운 클러스터에 배정
                        c = min(range(k), key=lambda c: distances[j][c])
                        assignments[c].append(j)
                        assigned[j] = True

        new_labels = [0] * n
        for c in range(k):
            for j in assignments[c]:
                new_labels[j] = c

        if new_labels == labels:
            break
        labels = new_labels

        # 중심 업데이트
        for i in range(k):
            members = [coords[j] for j in range(n) if labels[j] == i]
            if members:
                centroids[i] = (
                    sum(m[0] for m in members) / len(members),
                    sum(m[1] for m in members) / len(members),
                )

    return labels


def assign_stations(
    stations: list[dict],
    employees: list[dict],
    start_date: date,
    end_date: date,
    unavailable_map: dict[str, set[date]] | None = None,
) -> dict:
    """
    기지국을 직원들에게 자동 배분.

    1. 직원별 근무일수 × 하루 최대 작업수 = 총 수용 가능 건수
    2. 수용 가능 건수 비율로 전체 기지국을 나눔
    3. K-means 클러스터링으로 가까운 기지국끼리 묶되 비율 맞춤
    4. 날짜별로 가까운 기지국끼리 같은 날 배정
    """
    unavailable_map = unavailable_map or {}

    COLORS = [
        "#E4002B", "#3B82F6", "#22C55E", "#F59E0B",
        "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
        "#F97316", "#14B8A6", "#6366F1", "#EF4444",
    ]

    # 좌표가 있는/없는 기지국 분리
    geo_stations = [s for s in stations if s.get("lat") and s.get("lng")]
    no_geo = [s for s in stations if not s.get("lat") or not s.get("lng")]

    if not geo_stations or not employees:
        return {
            "assignments": [],
            "unassigned": no_geo,
            "stats": {"total": len(stations), "assigned": 0, "no_coords": len(no_geo)},
        }

    # 1. 직원별 근무일수 및 총 수용량 계산
    emp_workdays: dict[str, list[date]] = {}
    emp_capacities: dict[str, int] = {}

    for emp in employees:
        emp_id = emp["id"]
        unavailable = unavailable_map.get(emp_id, set())
        workdays = _get_workdays(start_date, end_date, unavailable)
        max_daily = emp.get("max_daily_tasks", 5)
        emp_workdays[emp_id] = workdays
        emp_capacities[emp_id] = len(workdays) * max_daily

    total_capacity = sum(emp_capacities.values())

    # 수용량이 0이면 배분 불가
    if total_capacity == 0:
        return {
            "assignments": [{
                "employee_id": emp["id"],
                "employee_name": emp["name"],
                "color": COLORS[i % len(COLORS)],
                "stations": [],
            } for i, emp in enumerate(employees)],
            "unassigned": no_geo,
            "stats": {"total": len(stations), "assigned": 0, "no_coords": len(no_geo)},
        }

    # 2. 비율에 맞게 목표 배분 건수 계산
    n_stations = len(geo_stations)
    emp_target: dict[str, int] = {}
    remaining = n_stations
    sorted_emps = sorted(employees, key=lambda e: emp_capacities[e["id"]], reverse=True)

    for i, emp in enumerate(sorted_emps):
        if i == len(sorted_emps) - 1:
            emp_target[emp["id"]] = remaining
        else:
            target = round(n_stations * emp_capacities[emp["id"]] / total_capacity)
            target = max(0, min(target, remaining))
            emp_target[emp["id"]] = target
            remaining -= target

    # 3. K-means 클러스터링 (수용량 비율 고려)
    coords = [(s["lat"], s["lng"]) for s in geo_stations]

    # 직원을 수용량 큰 순서로 정렬하여 클러스터 매핑
    capacities_ordered = [emp_capacities[emp["id"]] for emp in sorted_emps]

    if len(geo_stations) <= len(employees):
        # 기지국 수가 직원 수 이하면 하나씩 배정
        labels = list(range(len(geo_stations)))
    else:
        labels = _balanced_kmeans(coords, capacities_ordered)

    # 클러스터 → 직원 매핑 (sorted_emps 순서)
    cluster_to_emp = {}
    for i, emp in enumerate(sorted_emps):
        cluster_to_emp[i] = emp

    # 직원별 기지국 그룹화
    emp_stations: dict[str, list[dict]] = {e["id"]: [] for e in employees}
    for i, station in enumerate(geo_stations):
        cluster = labels[i]
        emp = cluster_to_emp.get(cluster, employees[0])
        emp_stations[emp["id"]].append(station)

    # 4. 날짜별 배분 (가까운 기지국끼리 같은 날)
    assignments = []
    for idx, emp in enumerate(employees):
        emp_id = emp["id"]
        my_stations = emp_stations.get(emp_id, [])
        max_daily = emp.get("max_daily_tasks", 5)
        workdays = emp_workdays.get(emp_id, [])

        if not my_stations or not workdays:
            assignments.append({
                "employee_id": emp_id,
                "employee_name": emp["name"],
                "color": COLORS[idx % len(COLORS)],
                "stations": [],
            })
            continue

        # 동선 최적화 (nearest-neighbor로 전체 정렬)
        route_input = [
            {"id": s["id"], "lat": s["lat"], "lng": s["lng"]}
            for s in my_stations
        ]
        optimized = optimize_route(route_input)
        id_order = {item["id"]: item["sort_order"] for item in optimized}
        my_stations.sort(key=lambda s: id_order.get(s["id"], 0))

        # 날짜별 분배: 순서대로 max_daily씩 끊어서 배정
        assigned_list = []
        day_idx = 0
        daily_count = 0

        for i, station in enumerate(my_stations):
            if daily_count >= max_daily:
                day_idx += 1
                daily_count = 0

            if day_idx >= len(workdays):
                day_idx = 0  # 날짜가 부족하면 처음부터 다시
                daily_count = 0

            assigned_list.append({
                "station_id": station["id"],
                "station_name": station.get("station_name", ""),
                "address": station.get("address", ""),
                "lat": station["lat"],
                "lng": station["lng"],
                "scheduled_date": workdays[day_idx].isoformat(),
                "sort_order": daily_count,
            })
            daily_count += 1

        assignments.append({
            "employee_id": emp_id,
            "employee_name": emp["name"],
            "color": COLORS[idx % len(COLORS)],
            "stations": assigned_list,
        })

    total_assigned = sum(len(a["stations"]) for a in assignments)
    return {
        "assignments": assignments,
        "unassigned": no_geo,
        "stats": {
            "total": len(stations),
            "assigned": total_assigned,
            "no_coords": len(no_geo),
        },
    }
