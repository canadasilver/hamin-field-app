import { useEffect, useState, useRef } from 'react'
import Header from '../components/common/Header'
import { scheduleApi, employeeApi, assignmentApi } from '../services/api'
import type { Schedule, Employee } from '../types'
import { MapPin, Navigation, CheckCircle2, Clock, Loader2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { loadKakaoMapSdk } from '../lib/kakao'

declare global {
  interface Window { kakao: any }
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  in_progress: '#E53935',
  pending: '#3B82F6',
  postponed: '#f59e0b',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '대기중',
  in_progress: '진행중',
  completed: '완료',
  postponed: '연기',
}

// fallback 좌표 (geocode.py의 시/도 대표 좌표)
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

function geocodeWithKakaoJS(address: string): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!window.kakao?.maps?.services) return resolve(null)
    const geocoder = new window.kakao.maps.services.Geocoder()
    geocoder.addressSearch(address, (result: any[], status: string) => {
      if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
        resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) })
      } else {
        resolve(null)
      }
    })
  })
}

export default function MapPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmpId, setSelectedEmpId] = useState<string>('')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [geocoding, setGeocoding] = useState(false)

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)
  const infoWindowRef = useRef<any>(null)
  const kakaoLoadedRef = useRef(false)

  useEffect(() => {
    employeeApi.list().then(res => setEmployees(res.data))

    if (kakaoLoadedRef.current) return
    loadKakaoMapSdk()
      .then(() => {
        kakaoLoadedRef.current = true
        initMap()
      })
      .catch(() => toast.error('카카오 지도를 불러오지 못했습니다'))
  }, [])

  const initMap = () => {
    if (!mapRef.current || !window.kakao?.maps) return
    if (mapInstanceRef.current) return
    const kakao = window.kakao
    const defaultCenter = new kakao.maps.LatLng(37.5665, 126.978)
    mapInstanceRef.current = new kakao.maps.Map(mapRef.current, { center: defaultCenter, level: 10 })
  }

  // 지오코딩: fallback 좌표를 실제 좌표로 변환
  const geocodeStations = async (data: Schedule[]): Promise<Schedule[]> => {
    const needFix = data.filter(s => {
      const st = s.stations
      return st?.address && st?.lat && st?.lng && isFallbackCoord(st.lat, st.lng)
    })
    if (needFix.length === 0) return data

    setGeocoding(true)
    const updates: { station_id: string; lat: number; lng: number }[] = []
    const updated = [...data]

    for (let i = 0; i < needFix.length; i++) {
      const s = needFix[i]
      const coords = await geocodeWithKakaoJS(s.stations!.address!)
      if (coords) {
        // 원본 데이터 업데이트
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

  const handleSearch = async () => {
    if (!selectedEmpId) return toast.error('직원을 선택해주세요')

    setLoading(true)
    setSearched(true)
    try {
      const res = await scheduleApi.list({
        employee_id: selectedEmpId,
        scheduled_date: selectedDate,
      })
      let data: Schedule[] = res.data.sort((a: Schedule, b: Schedule) => a.sort_order - b.sort_order)

      // 지오코딩 시도
      data = await geocodeStations(data)
      setSchedules(data)

      // 지도에 마커 그리기
      setTimeout(() => drawMarkers(data), 100)
    } catch {
      toast.error('일정 로딩 실패')
    } finally {
      setLoading(false)
    }
  }

  const drawMarkers = (data: Schedule[]) => {
    if (!mapInstanceRef.current || !window.kakao?.maps) {
      // 아직 안됐으면 retry
      if (window.kakao?.maps) {
        window.kakao.maps.load(() => {
          kakaoLoadedRef.current = true
          initMap()
          setTimeout(() => drawMarkers(data), 200)
        })
      }
      return
    }

    const kakao = window.kakao
    const map = mapInstanceRef.current

    // 기존 제거
    overlaysRef.current.forEach(o => o.setMap(null))
    overlaysRef.current = []
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null }
    if (infoWindowRef.current) { infoWindowRef.current.close(); infoWindowRef.current = null }

    const bounds = new kakao.maps.LatLngBounds()
    const linePath: any[] = []
    let hasValid = false

    data.forEach((s, idx) => {
      const lat = s.stations?.lat
      const lng = s.stations?.lng
      const orderNum = idx + 1  // 전체 순서 번호

      if (!lat || !lng) return  // 좌표 없으면 마커 제외

      hasValid = true
      const position = new kakao.maps.LatLng(lat, lng)
      bounds.extend(position)
      linePath.push(position)

      const color = STATUS_COLORS[s.status] || '#3B82F6'
      const statusLabel = STATUS_LABELS[s.status] || s.status

      // 커스텀 오버레이 마커
      const content = document.createElement('div')
      content.innerHTML = `
        <div style="
          width:32px; height:32px; border-radius:50%;
          background:${color}; color:white; font-weight:bold;
          display:flex; align-items:center; justify-content:center;
          font-size:14px; border:3px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,0.35); cursor:pointer;
        ">${orderNum}</div>
      `
      content.onclick = () => {
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
        content,
        yAnchor: 1,
      })
      overlay.setMap(map)
      overlaysRef.current.push(overlay)
    })

    if (!hasValid) return

    // 폴리라인
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

    // 인포윈도우 닫기
    kakao.maps.event.addListener(map, 'click', () => {
      if (infoWindowRef.current) { infoWindowRef.current.close(); infoWindowRef.current = null }
    })
  }

  const openNavi = (s: Schedule) => {
    const st = s.stations
    if (!st) return toast.error('기지국 정보 없음')

    if (st.lat && st.lng && !isFallbackCoord(st.lat, st.lng)) {
      window.open(
        `https://map.kakao.com/link/to/${encodeURIComponent(st.station_name)},${st.lat},${st.lng}`,
        '_blank'
      )
    } else if (st.address) {
      window.open(`https://map.kakao.com/link/search/${encodeURIComponent(st.address)}`, '_blank')
    } else {
      toast.error('좌표/주소 정보 없음')
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`
  }

  const completedCount = schedules.filter(s => s.status === 'completed').length
  const selectedEmpName = employees.find(e => e.id === selectedEmpId)?.name

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header title="오늘의 동선" />

      {/* 상단 필터 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-lg mx-auto">
          <div className="flex gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-kt-red/20 focus:border-kt-red"
            />
            <select
              value={selectedEmpId}
              onChange={e => setSelectedEmpId(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-kt-red/20 focus:border-kt-red"
            >
              <option value="">직원 선택</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-4 py-2.5 bg-kt-red text-white rounded-xl text-sm font-bold disabled:opacity-50 flex-shrink-0"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* 통계 */}
      {searched && schedules.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-2.5">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {selectedEmpName} - {formatDate(selectedDate)}
            </span>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-gray-500">전체 <strong className="text-gray-900">{schedules.length}</strong></span>
              <span className="text-green-600">완료 <strong>{completedCount}</strong></span>
              <span className="text-gray-500">남은 <strong className="text-orange-600">{schedules.length - completedCount}</strong></span>
            </div>
          </div>
        </div>
      )}

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
      <div ref={mapRef} style={{ width: '100%', height: '400px', background: '#e8e8e8' }} />

      {/* 범례 */}
      {searched && schedules.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-2">
          <div className="max-w-lg mx-auto flex justify-center gap-4">
            {[
              { color: '#3B82F6', label: '대기중' },
              { color: '#E53935', label: '진행중' },
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
        ) : !searched ? (
          <div className="text-center py-12 text-gray-400">
            <MapPin size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">직원을 선택하고 조회해주세요</p>
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">배정된 일정이 없습니다</p>
          </div>
        ) : (
          schedules.map((s, i) => {
            const color = STATUS_COLORS[s.status] || '#3B82F6'
            const statusLabel = STATUS_LABELS[s.status] || s.status
            return (
              <div key={s.id} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-gray-100">
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
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: color }}>
                      {statusLabel}
                    </span>
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
                <button
                  onClick={() => openNavi(s)}
                  className="px-3 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold flex items-center gap-1 flex-shrink-0"
                >
                  <Navigation size={14} />
                  네비
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
