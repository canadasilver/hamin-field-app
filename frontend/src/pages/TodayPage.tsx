import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/common/Header'
import ReassignModal from '../components/schedule/ReassignModal'
import { scheduleApi, assignmentApi, stationApi, employeeApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { ChevronLeft, ChevronRight, MapPin, Navigation, CheckCircle2, Clock, Loader2, RefreshCw, LocateFixed } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Schedule } from '../types'

declare global {
  interface Window { kakao: any }
}

const adjustDate = (dateStr: string, days: number) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  in_progress: '#1976D2',
  pending: '#1976D2',
  postponed: '#f59e0b',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '대기중',
  in_progress: '진행중',
  completed: '완료',
  postponed: '연기',
}

const FALLBACK_COORDS = new Set([
  '37.5665,126.978', '37.4563,126.7052', '37.4138,127.5183',
  '37.8228,128.1555', '36.6357,127.4912', '36.6588,126.6728',
  '36.3504,127.3845', '36.48,127.26', '35.8203,127.1088',
  '34.8679,126.991', '35.1595,126.8526', '36.4919,128.8889',
  '35.4606,128.2132', '35.8714,128.6014', '35.5384,129.3114',
  '35.1796,129.0756', '33.489,126.4983',
])

function isFallbackCoord(lat: number, lng: number): boolean {
  return FALLBACK_COORDS.has(`${lat},${lng}`)
}

export default function TodayPage() {
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [selectedDate, setSelectedDate] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [geocoding, setGeocoding] = useState(false)
  const [kakaoReady, setKakaoReady] = useState(false)
  const [reassignTarget, setReassignTarget] = useState<Schedule | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [currentLoc, setCurrentLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [isOptimized, setIsOptimized] = useState(false)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [yearlyStats, setYearlyStats] = useState<{ total_assigned: number; total_completed: number } | null>(null)

  // 올해 누적 통계 (날짜 변경과 무관하게 1회 로드)
  useEffect(() => {
    if (!user?.employee_id) return
    const year = new Date().getFullYear()
    employeeApi.yearlyStats(user.employee_id, year)
      .then(res => setYearlyStats(res.data))
      .catch(() => {})
  }, [user?.employee_id])

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)
  const infoWindowRef = useRef<any>(null)
  const currentLocOverlayRef = useRef<any>(null)

  // 1단계: 카카오맵 SDK 로드
  useEffect(() => {
    const loadKakao = () => {
      if (window.kakao?.maps?.LatLng) {
        // 이미 완전히 로드됨
        setKakaoReady(true)
        return
      }
      if (window.kakao?.maps?.load) {
        // autoload=false: load() 호출 필요
        window.kakao.maps.load(() => setKakaoReady(true))
        return
      }
      // SDK 스크립트 자체가 아직 없으면 동적 로드
      const script = document.createElement('script')
      script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=92b199181912975f5c10cc85d977abdf&libraries=services&autoload=false'
      script.onload = () => {
        window.kakao.maps.load(() => setKakaoReady(true))
      }
      document.head.appendChild(script)
    }
    loadKakao()
    // 백엔드에서 좌표 없는 기지국 일괄 지오코딩 (백그라운드)
    stationApi.geocodeMissing().catch(() => {})
  }, [])

  // 2단계: 카카오 준비되면 지도 생성
  useEffect(() => {
    if (!kakaoReady || !mapContainerRef.current || mapInstanceRef.current) return
    const kakao = window.kakao
    mapInstanceRef.current = new kakao.maps.Map(mapContainerRef.current, {
      center: new kakao.maps.LatLng(36.5, 127.5),
      level: 13,
    })
  }, [kakaoReady])

  // 카카오 REST API 지오코딩
  const geocodeWithREST = async (query: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`,
        { headers: { Authorization: 'KakaoAK 3392c59f3960f9cc452baef07e5f222b' } }
      )
      const data = await res.json()
      if (data.documents?.length > 0) {
        return { lat: parseFloat(data.documents[0].y), lng: parseFloat(data.documents[0].x) }
      }
      // 주소 검색 실패 시 키워드 검색
      const res2 = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`,
        { headers: { Authorization: 'KakaoAK 3392c59f3960f9cc452baef07e5f222b' } }
      )
      const data2 = await res2.json()
      if (data2.documents?.length > 0) {
        return { lat: parseFloat(data2.documents[0].y), lng: parseFloat(data2.documents[0].x) }
      }
    } catch { /* ignore */ }
    return null
  }

  // 지오코딩 (좌표 없는 기지국)
  const geocodeStations = async (data: Schedule[]): Promise<Schedule[]> => {
    const needFix = data.filter(s => {
      const st = s.stations
      if (!st) return false
      if (!st.lat || !st.lng) return true
      return isFallbackCoord(st.lat, st.lng)
    })
    if (needFix.length === 0) return data

    setGeocoding(true)
    const useJSGeocoder = !!window.kakao?.maps?.services
    const geocoder = useJSGeocoder ? new window.kakao.maps.services.Geocoder() : null
    const updates: { station_id: string; lat: number; lng: number }[] = []
    const updated = [...data]

    for (let i = 0; i < needFix.length; i++) {
      const s = needFix[i]
      const address = s.stations!.address || ''
      const name = s.stations!.station_name || ''
      if (!address && !name) continue

      let coords: { lat: number; lng: number } | null = null

      // 1. 주소가 있으면 JS SDK 지오코더 시도
      if (address && geocoder) {
        coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
          geocoder.addressSearch(address, (result: any[], status: string) => {
            if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
              resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) })
            } else {
              resolve(null)
            }
          })
        })
      }

      // 2. JS SDK 실패 시 REST API 주소 검색
      if (!coords && address) {
        coords = await geocodeWithREST(address)
      }

      // 3. 주소 검색 전부 실패 시 station_name으로 키워드 검색
      if (!coords && name) {
        coords = await geocodeWithREST(name)
      }

      if (coords) {
        const idx = updated.findIndex(u => u.id === s.id)
        if (idx >= 0 && updated[idx].stations) {
          updated[idx] = {
            ...updated[idx],
            stations: { ...updated[idx].stations!, lat: coords.lat, lng: coords.lng },
          }
        }
        updates.push({ station_id: s.station_id, lat: coords.lat, lng: coords.lng })
      }
      if (i % 5 === 4) await new Promise(r => setTimeout(r, 200))
    }

    if (updates.length > 0) {
      try { await assignmentApi.updateCoords(updates) } catch { /* ignore */ }
      toast.success(`${updates.length}건 좌표 변환 완료`)
    }
    setGeocoding(false)
    return updated
  }

  // 3단계: 데이터 로드
  const loadSchedules = useCallback(async () => {
    if (!user?.employee_id) { setLoading(false); return }
    setLoading(true)
    setIsOptimized(false)
    try {
      const res = await scheduleApi.list({
        employee_id: user.employee_id,
        scheduled_date: selectedDate,
      })
      let data: Schedule[] = res.data.sort((a: Schedule, b: Schedule) => a.sort_order - b.sort_order)
      data = await geocodeStations(data)
      setSchedules(data)
    } catch {
      toast.error('일정 로딩 실패')
    } finally {
      setLoading(false)
    }
  }, [user?.employee_id, selectedDate])

  useEffect(() => {
    loadSchedules()
  }, [loadSchedules])

  // 현재 위치 기반 동선 최적화
  const handleOptimizeByGPS = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('이 브라우저는 위치 서비스를 지원하지 않습니다')
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        setCurrentLoc({ lat, lng })
        try {
          // 직선거리 계산 (Haversine)
          const calcDist = (lat1: number, lng1: number, lat2: number, lng2: number) => {
            const R = 6371
            const dLat = (lat2 - lat1) * Math.PI / 180
            const dLng = (lng2 - lng1) * Math.PI / 180
            const a = Math.sin(dLat / 2) ** 2
              + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
          }

          // 좌표 있는 것은 거리순 정렬, 없는 것은 뒤로
          const withCoords = schedules.filter(s => s.stations?.lat && s.stations?.lng)
          const withoutCoords = schedules.filter(s => !s.stations?.lat || !s.stations?.lng)
          const sorted = [...withCoords].sort((a, b) =>
            calcDist(lat, lng, a.stations!.lat!, a.stations!.lng!) -
            calcDist(lat, lng, b.stations!.lat!, b.stations!.lng!)
          )
          const newOrder = [...sorted, ...withoutCoords]

          // DB sort_order 업데이트 (병렬)
          await Promise.all(
            newOrder.map((s, i) => scheduleApi.update(s.id, { sort_order: i }))
          )

          // 로컬 상태 직접 갱신 — 재조회 없이 확정된 순서 유지
          setSchedules(newOrder)
          setIsOptimized(true)
          toast.success('현재 위치 기준으로 동선을 재계산했습니다')
        } catch {
          toast.error('동선 최적화 실패')
        } finally {
          setGpsLoading(false)
        }
      },
      (error) => {
        setGpsLoading(false)
        if (error.code === error.PERMISSION_DENIED) {
          toast.error('위치 권한을 허용해주세요')
        } else {
          toast.error('위치를 가져올 수 없습니다')
        }
      },
      { timeout: 10000, maximumAge: 60000 }
    )
  }, [schedules])

  // 4단계: 데이터 + 지도 준비되면 마커 그리기
  useEffect(() => {
    if (!kakaoReady || !mapInstanceRef.current || schedules.length === 0) return

    const kakao = window.kakao
    const map = mapInstanceRef.current

    // 기존 오버레이 정리
    overlaysRef.current.forEach(o => o.setMap(null))
    overlaysRef.current = []
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null }
    if (infoWindowRef.current) { infoWindowRef.current.close(); infoWindowRef.current = null }
    if (currentLocOverlayRef.current) { currentLocOverlayRef.current.setMap(null); currentLocOverlayRef.current = null }

    const bounds = new kakao.maps.LatLngBounds()
    const linePath: any[] = []
    let hasValid = false

    schedules.forEach((s, idx) => {
      const lat = s.stations?.lat
      const lng = s.stations?.lng
      const orderNum = idx + 1  // 전체 순서 번호 (좌표 없어도 번호 유지)

      if (!lat || !lng) return  // 좌표 없으면 마커 제외

      hasValid = true
      const position = new kakao.maps.LatLng(lat, lng)
      bounds.extend(position)
      linePath.push(position)

      const color = STATUS_COLORS[s.status] || '#1976D2'
      const statusLabel = STATUS_LABELS[s.status] || s.status

      const el = document.createElement('div')
      el.innerHTML = `
        <div style="
          width:32px; height:32px; border-radius:50%;
          background:${color}; color:white; font-weight:bold;
          display:flex; align-items:center; justify-content:center;
          font-size:14px; border:3px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,0.35); cursor:pointer;
        ">${orderNum}</div>
      `
      el.onclick = () => {
        if (infoWindowRef.current) infoWindowRef.current.close()
        const info = new kakao.maps.InfoWindow({
          position,
          content: `
            <div style="padding:10px 14px;font-size:13px;min-width:180px;line-height:1.6;">
              <strong>${orderNum}. ${s.stations!.station_name}</strong><br/>
              <span style="color:#666;font-size:12px;">${s.stations!.address || '주소 없음'}</span><br/>
              <span style="
                display:inline-block;margin-top:4px;padding:2px 8px;border-radius:10px;
                font-size:11px;font-weight:bold;color:white;background:${color};
              ">${statusLabel}</span>
            </div>
          `,
        })
        info.open(map)
        infoWindowRef.current = info
      }

      const overlay = new kakao.maps.CustomOverlay({
        position,
        content: el,
        yAnchor: 1,
      })
      overlay.setMap(map)
      overlaysRef.current.push(overlay)
    })

    // 현재 위치 마커 (파란 점)
    if (currentLoc) {
      const curPos = new kakao.maps.LatLng(currentLoc.lat, currentLoc.lng)
      bounds.extend(curPos)
      const curEl = document.createElement('div')
      curEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="
            width:16px; height:16px; border-radius:50%;
            background:#2563EB; border:3px solid white;
            box-shadow:0 0 0 3px rgba(37,99,235,0.3);
          "></div>
          <span style="
            font-size:10px; font-weight:bold; color:#2563EB;
            background:white; padding:1px 5px; border-radius:8px;
            box-shadow:0 1px 4px rgba(0,0,0,0.2); white-space:nowrap;
          ">현재 위치</span>
        </div>
      `
      const curOverlay = new kakao.maps.CustomOverlay({
        position: curPos,
        content: curEl,
        yAnchor: 1,
      })
      curOverlay.setMap(map)
      currentLocOverlayRef.current = curOverlay
    }

    if (!hasValid) return

    // 동선 연결
    if (linePath.length > 1) {
      const polyline = new kakao.maps.Polyline({
        path: linePath,
        strokeWeight: 3,
        strokeColor: '#E53935',
        strokeOpacity: 0.8,
        strokeStyle: 'solid',
      })
      polyline.setMap(map)
      polylineRef.current = polyline
    }

    // 자동 줌
    if (linePath.length > 1) {
      map.setBounds(bounds)
    } else if (linePath.length === 1) {
      map.setCenter(linePath[0])
      map.setLevel(5)
    }

    // 지도 클릭 시 인포윈도우 닫기
    kakao.maps.event.addListener(map, 'click', () => {
      if (infoWindowRef.current) { infoWindowRef.current.close(); infoWindowRef.current = null }
    })
  }, [kakaoReady, schedules, currentLoc])

  const openNavi = (s: Schedule, isFirst = false) => {
    const st = s.stations
    if (!st) return toast.error('기지국 정보 없음')
    if (st.lat && st.lng && !isFallbackCoord(st.lat, st.lng)) {
      // 첫 번째 기지국이고 현재 위치가 있으면 출발지 포함 경로
      if (isFirst && currentLoc) {
        window.open(
          `https://map.kakao.com/link/from/현재위치,${currentLoc.lat},${currentLoc.lng}/to/${encodeURIComponent(st.station_name)},${st.lat},${st.lng}`,
          '_blank'
        )
      } else {
        window.open(
          `https://map.kakao.com/link/to/${encodeURIComponent(st.station_name)},${st.lat},${st.lng}`,
          '_blank'
        )
      }
    } else if (st.address) {
      window.open(`https://map.kakao.com/link/search/${encodeURIComponent(st.address)}`, '_blank')
    } else {
      toast.error('좌표/주소 정보 없음')
    }
  }

  const handleComplete = async (scheduleId: string) => {
    if (completingId) return
    setCompletingId(scheduleId)
    try {
      await scheduleApi.update(scheduleId, { status: 'completed' })
      setSchedules(prev =>
        prev.map(item => item.id === scheduleId ? { ...item, status: 'completed' } : item)
      )
      toast.success('작업 완료 처리되었습니다')
    } catch {
      toast.error('처리 실패')
    } finally {
      setCompletingId(null)
    }
  }

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${m}월 ${d}일 (${days[date.getDay()]})`
  }

  const completedCount = schedules.filter(s => s.status === 'completed').length

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header title={`${user?.name}님의 동선`} />

      {/* 날짜 네비게이션 + 동선최적화 + 요약 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-lg mx-auto space-y-3">
          {/* 날짜 이동 */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setSelectedDate(prev => adjustDate(prev, -1))}
              className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
            >
              <ChevronLeft size={22} />
            </button>
            <span className="text-sm font-semibold text-gray-800 min-w-[130px] text-center">
              {formatDate(selectedDate)}
            </span>
            <button
              onClick={() => setSelectedDate(prev => adjustDate(prev, 1))}
              className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
            >
              <ChevronRight size={22} />
            </button>
          </div>

          {/* 동선 최적화 버튼 */}
          <button
            onClick={handleOptimizeByGPS}
            disabled={gpsLoading || loading}
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
              isOptimized
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-[#215288] hover:bg-[#1a4070] text-white'
            }`}
          >
            {gpsLoading ? (
              <><Loader2 size={16} className="animate-spin" />위치 확인 중...</>
            ) : isOptimized ? (
              <><LocateFixed size={16} />최적화 완료 · 다시 계산하기</>
            ) : (
              <><LocateFixed size={16} />현재 위치 기준 동선 최적화</>
            )}
          </button>

          {/* 올해 누적 통계 */}
          {yearlyStats && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                <p className="text-xl font-bold" style={{ color: '#215288' }}>{yearlyStats.total_assigned}</p>
                <p className="text-[11px] text-gray-500">올해 총배정</p>
              </div>
              <div className="bg-green-50 rounded-xl p-2.5 text-center">
                <p className="text-xl font-bold text-green-600">{yearlyStats.total_completed}</p>
                <p className="text-[11px] text-gray-500">올해 완료</p>
              </div>
            </div>
          )}

          {/* 선택 날짜 요약 */}
          {!loading && schedules.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                <p className="text-xl font-bold text-gray-900">{schedules.length}</p>
                <p className="text-[11px] text-gray-500">전체</p>
              </div>
              <div className="bg-green-50 rounded-xl p-2.5 text-center">
                <p className="text-xl font-bold text-green-600">{completedCount}</p>
                <p className="text-[11px] text-gray-500">완료</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-2.5 text-center">
                <p className="text-xl font-bold text-orange-600">{schedules.length - completedCount}</p>
                <p className="text-[11px] text-gray-500">남은 작업</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 지오코딩 */}
      {geocoding && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-2">
          <div className="max-w-lg mx-auto flex items-center gap-2 text-sm text-blue-700">
            <Loader2 size={14} className="animate-spin" />
            좌표 변환 중...
          </div>
        </div>
      )}

      {/* 지도 */}
      <div
        id="today-map"
        ref={mapContainerRef}
        style={{ width: '100%', height: '350px', background: '#e8e8e8' }}
      />

      {/* 범례 */}
      {schedules.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-2">
          <div className="max-w-lg mx-auto flex justify-center gap-4">
            {[
              { color: '#1976D2', label: '대기중' },
              { color: '#22c55e', label: '완료' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: item.color }} />
                <span className="text-xs text-gray-600">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 기지국 리스트 */}
      <div className="max-w-lg mx-auto px-4 pt-3 space-y-2 pb-4">
        {loading ? (
          <div className="text-center py-12 text-gray-400">
            <Loader2 size={24} className="animate-spin mx-auto mb-2" />
            로딩중...
          </div>
        ) : !user?.employee_id ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg mb-1">직원 정보가 연결되지 않았습니다</p>
            <p className="text-sm">관리자에게 문의하세요</p>
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <MapPin size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">배정된 일정이 없습니다</p>
          </div>
        ) : (
          schedules.map((s, i) => {
            const color = STATUS_COLORS[s.status] || '#1976D2'
            const statusLabel = STATUS_LABELS[s.status] || s.status
            return (
              <div
                key={s.id}
                onClick={() => navigate(`/schedule/${s.id}`)}
                className="flex items-center gap-3 bg-white rounded-xl p-3 border border-gray-100 active:bg-gray-50 cursor-pointer"
              >
                <span
                  className="flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold flex-shrink-0"
                  style={{ background: color }}
                >
                  {s.status === 'completed' ? <CheckCircle2 size={18} /> : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`font-medium text-sm truncate ${s.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {s.stations?.station_name || '기지국'}
                    </p>
                    {s.status !== 'in_progress' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: color }}>
                        {statusLabel}
                      </span>
                    )}
                    {isAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setReassignTarget(s) }}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-medium hover:bg-gray-200 flex-shrink-0"
                      >
                        <RefreshCw size={10} />
                        재배정
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                    <MapPin size={10} />{s.stations?.address || '주소 없음'}
                  </p>
                  {s.started_at && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Clock size={10} />시작: {new Date(s.started_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); openNavi(s, i === 0) }}
                    className="px-3 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold flex items-center gap-1"
                  >
                    <Navigation size={14} />
                    네비
                  </button>
                  {s.status === 'pending' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleComplete(s.id) }}
                      disabled={completingId === s.id}
                      className="px-3 py-2 bg-[#215288] text-white rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                    >
                      {completingId === s.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <CheckCircle2 size={14} />
                      }
                      완료
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {reassignTarget && (
        <ReassignModal
          scheduleId={reassignTarget.id}
          currentEmployeeId={reassignTarget.employee_id}
          currentDate={reassignTarget.scheduled_date ?? selectedDate}
          stationName={reassignTarget.stations?.station_name || '기지국'}
          onClose={() => setReassignTarget(null)}
          onDone={() => {
            setReassignTarget(null)
            loadSchedules()
          }}
        />
      )}
    </div>
  )
}
