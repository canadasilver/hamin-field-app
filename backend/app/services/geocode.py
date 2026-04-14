import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

KAKAO_GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

# 시/도 기준 대략 좌표 (REST API 실패 시 fallback)
REGION_FALLBACK_COORDS: dict[str, tuple[float, float]] = {
    "서울": (37.5665, 126.978),
    "인천": (37.4563, 126.7052),
    "경기": (37.4138, 127.5183),
    "강원": (37.8228, 128.1555),
    "충북": (36.6357, 127.4912),
    "충남": (36.6588, 126.6728),
    "대전": (36.3504, 127.3845),
    "세종": (36.4800, 127.2600),
    "전북": (35.8203, 127.1088),
    "전남": (34.8679, 126.9910),
    "광주": (35.1595, 126.8526),
    "경북": (36.4919, 128.8889),
    "경남": (35.4606, 128.2132),
    "대구": (35.8714, 128.6014),
    "울산": (35.5384, 129.3114),
    "부산": (35.1796, 129.0756),
    "제주": (33.4890, 126.4983),
}


def fallback_coords_from_address(address: str) -> tuple[float, float] | None:
    """주소에서 시/도를 추출하여 대략적 좌표 반환"""
    if not address:
        return None
    for region, coords in REGION_FALLBACK_COORDS.items():
        if region in address:
            return coords
    return None


async def address_to_coords(address: str) -> tuple[float, float] | None:
    """카카오 API로 주소를 위도/경도로 변환 (실패 시 지역 fallback)"""
    if not address:
        return None

    headers = {"Authorization": f"KakaoAK {settings.KAKAO_REST_API_KEY}"}

    async with httpx.AsyncClient() as client:
        # 1차: 주소 검색 API
        try:
            resp = await client.get(
                KAKAO_GEOCODE_URL,
                params={"query": address},
                headers=headers,
            )
            if resp.status_code == 200:
                documents = resp.json().get("documents", [])
                if documents:
                    doc = documents[0]
                    return float(doc["y"]), float(doc["x"])
        except Exception as e:
            logger.warning(f"주소 검색 실패 ({address}): {e}")

        # 2차: 키워드 검색 API
        try:
            resp2 = await client.get(
                KAKAO_KEYWORD_URL,
                params={"query": address},
                headers=headers,
            )
            if resp2.status_code == 200:
                documents = resp2.json().get("documents", [])
                if documents:
                    return float(documents[0]["y"]), float(documents[0]["x"])
        except Exception as e:
            logger.warning(f"키워드 검색 실패 ({address}): {e}")

    # 3차: 시/도 fallback
    return fallback_coords_from_address(address)
