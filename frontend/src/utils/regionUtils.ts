export type RegionZone = 'north' | 'south'

export interface RegionResult {
  zone: RegionZone | null
  detail: string | null
}

export const NORTH_REGIONS = ['서울', '인천', '경기', '강원'] as const
export const SOUTH_REGIONS = ['대전', '세종', '충남', '충북', '전북', '전남', '광주', '경북', '경남', '대구', '부산', '울산', '제주'] as const

type NorthRegion = typeof NORTH_REGIONS[number]
type SouthRegion = typeof SOUTH_REGIONS[number]

const NORTH_MAP: [string[], NorthRegion][] = [
  [['서울특별시', '서울'], '서울'],
  [['인천광역시', '인천'], '인천'],
  [['경기도', '경기'], '경기'],
  [['강원특별자치도', '강원도', '강원'], '강원'],
]

const SOUTH_MAP: [string[], SouthRegion][] = [
  [['대전광역시', '대전'], '대전'],
  [['세종특별자치시', '세종'], '세종'],
  [['충청남도', '충청남', '충남'], '충남'],
  [['충청북도', '충청북', '충북'], '충북'],
  [['전북특별자치도', '전라북도', '전라북', '전북'], '전북'],
  [['전라남도', '전라남', '전남'], '전남'],
  [['광주광역시', '광주'], '광주'],
  [['경상북도', '경상북', '경북'], '경북'],
  [['경상남도', '경상남', '경남'], '경남'],
  [['대구광역시', '대구'], '대구'],
  [['부산광역시', '부산'], '부산'],
  [['울산광역시', '울산'], '울산'],
  [['제주특별자치도', '제주'], '제주'],
]

export function getRegionFromAddress(address: string): RegionResult {
  for (const [keywords, detail] of NORTH_MAP) {
    if (keywords.some(k => address.includes(k))) {
      return { zone: 'north', detail }
    }
  }
  for (const [keywords, detail] of SOUTH_MAP) {
    if (keywords.some(k => address.includes(k))) {
      return { zone: 'south', detail }
    }
  }
  return { zone: null, detail: null }
}
