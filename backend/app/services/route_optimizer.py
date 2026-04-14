import math


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """두 좌표 간 거리 (km)"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def optimize_route(
    stations: list[dict],
    start_lat: float | None = None,
    start_lng: float | None = None,
) -> list[dict]:
    """
    Nearest-neighbor 알고리즘으로 최적 동선 계산.
    stations: [{"id": ..., "lat": ..., "lng": ..., ...}]
    start_lat/start_lng: 현재 위치 기준으로 정렬할 경우 시작 좌표
    반환: 정렬된 stations 리스트
    """
    if len(stations) <= 1:
        return stations

    remaining = list(stations)

    # 시작 좌표가 주어지면 현재 위치에서 가장 가까운 기지국부터 시작
    if start_lat is not None and start_lng is not None:
        nearest_idx = 0
        nearest_dist = float("inf")
        for i, s in enumerate(remaining):
            d = haversine(start_lat, start_lng, s["lat"], s["lng"])
            if d < nearest_dist:
                nearest_dist = d
                nearest_idx = i
        route = [remaining.pop(nearest_idx)]
    else:
        route = [remaining.pop(0)]

    while remaining:
        last = route[-1]
        nearest_idx = 0
        nearest_dist = float("inf")
        for i, s in enumerate(remaining):
            d = haversine(last["lat"], last["lng"], s["lat"], s["lng"])
            if d < nearest_dist:
                nearest_dist = d
                nearest_idx = i
        route.append(remaining.pop(nearest_idx))

    for i, s in enumerate(route):
        s["sort_order"] = i

    return route
