import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Header from '../components/common/Header'
import ReassignModal from '../components/schedule/ReassignModal'
import { assignmentApi, employeeApi, scheduleApi, stationApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { geocodeWithKakaoJs, loadKakaoMapSdk } from '../lib/kakao'
import type { Schedule } from '../types'

const FALLBACK_COORDS = new Set([
  '37.5665,126.978',
  '37.4563,126.7052',
  '37.4138,127.5183',
  '37.8228,128.1555',
  '36.6357,127.4912',
  '36.6588,126.6728',
  '36.3504,127.3845',
  '36.48,127.26',
  '35.8203,127.1088',
  '34.8679,126.991',
  '35.1595,126.8526',
  '36.4919,128.8889',
  '35.4606,128.2132',
  '35.8714,128.6014',
  '35.5384,129.3114',
  '35.1796,129.0756',
  '33.489,126.4983',
])

const STATUS_COLORS: Record<string, string> = {
  pending: '#1976D2',
  in_progress: '#1976D2',
  completed: '#22c55e',
  postponed: '#f59e0b',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '대기중',
  in_progress: '진행중',
  completed: '완료',
  postponed: '연기',
}

function adjustDate(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const date = new Date(year, month - 1, day)
  return `${month}월 ${day}일 (${days[date.getDay()]})`
}

function formatTime(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function isFallbackCoord(lat: number, lng: number) {
  return FALLBACK_COORDS.has(`${lat},${lng}`)
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusKm = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function TodayPage() {
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [geocoding, setGeocoding] = useState(false)
  const [kakaoReady, setKakaoReady] = useState(false)
  const [reassignTarget, setReassignTarget] = useState<Schedule | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [currentLoc, setCurrentLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [isOptimized, setIsOptimized] = useState(false)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [postponingId, setPostponingId] = useState<string | null>(null)
  const [yearlyStats, setYearlyStats] = useState<{ total_assigned: number; total_completed: number } | null>(null)
  const [managerInfo, setManagerInfo] = useState<{ name: string | null; phone: string | null } | null>(null)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)
  const infoWindowRef = useRef<any>(null)
  const currentLocOverlayRef = useRef<any>(null)

  useEffect(() => {
    let mounted = true

    loadKakaoMapSdk()
      .then(() => {
        if (mounted) setKakaoReady(true)
      })
      .catch(() => {
        toast.error('카카오 지도를 불러오지 못했습니다.')
      })

    stationApi.geocodeMissing().catch(() => {})

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!user?.employee_id) return

    const year = new Date().getFullYear()
    employeeApi.yearlyStats(user.employee_id, year).then((res) => setYearlyStats(res.data)).catch(() => {})
    employeeApi.getManager(user.employee_id).then((res) => setManagerInfo(res.data)).catch(() => {})
  }, [user?.employee_id])

  useEffect(() => {
    if (!kakaoReady || !mapContainerRef.current || mapInstanceRef.current) return

    const kakao = window.kakao
    mapInstanceRef.current = new kakao.maps.Map(mapContainerRef.current, {
      center: new kakao.maps.LatLng(36.5, 127.5),
      level: 13,
    })
  }, [kakaoReady])

  const geocodeStations = useCallback(async (items: Schedule[]) => {
    const needFix = items.filter((schedule) => {
      const station = schedule.stations
      if (!station) return false
      if (!station.lat || !station.lng) return true
      return isFallbackCoord(station.lat, station.lng)
    })

    if (needFix.length === 0) return items

    setGeocoding(true)
    const updated = [...items]
    const updates: { station_id: string; lat: number; lng: number }[] = []

    for (let index = 0; index < needFix.length; index += 1) {
      const schedule = needFix[index]
      const station = schedule.stations
      const query = station?.address || station?.station_name || ''
      if (!query) continue

      const coords = await geocodeWithKakaoJs(query)
      if (!coords) continue

      const itemIndex = updated.findIndex((item) => item.id === schedule.id)
      if (itemIndex >= 0 && updated[itemIndex].stations) {
        updated[itemIndex] = {
          ...updated[itemIndex],
          stations: {
            ...updated[itemIndex].stations!,
            lat: coords.lat,
            lng: coords.lng,
          },
        }
      }

      updates.push({
        station_id: schedule.station_id,
        lat: coords.lat,
        lng: coords.lng,
      })

      if (index % 5 === 4) {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }

    if (updates.length > 0) {
      try {
        await assignmentApi.updateCoords(updates)
        toast.success(`${updates.length}건의 좌표를 보정했습니다.`)
      } catch {
        toast.error('좌표 저장 중 일부 오류가 발생했습니다.')
      }
    }

    setGeocoding(false)
    return updated
  }, [])

  const loadSchedules = useCallback(async () => {
    if (!user?.employee_id) {
      setLoading(false)
      return
    }

    setLoading(true)
    setIsOptimized(false)

    try {
      const res = await scheduleApi.list({
        employee_id: user.employee_id,
        scheduled_date: selectedDate,
      })

      const sorted = [...(res.data ?? [])].sort((a: Schedule, b: Schedule) => a.sort_order - b.sort_order)
      const geocoded = await geocodeStations(sorted)
      setSchedules(geocoded)
    } catch {
      toast.error('일정 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [geocodeStations, selectedDate, user?.employee_id])

  useEffect(() => {
    loadSchedules()
  }, [loadSchedules])

  useEffect(() => {
    if (!kakaoReady || !mapInstanceRef.current || schedules.length === 0) return

    const kakao = window.kakao
    const map = mapInstanceRef.current

    overlaysRef.current.forEach((overlay) => overlay.setMap(null))
    overlaysRef.current = []

    if (polylineRef.current) {
      polylineRef.current.setMap(null)
      polylineRef.current = null
    }

    if (infoWindowRef.current) {
      infoWindowRef.current.close()
      infoWindowRef.current = null
    }

    if (currentLocOverlayRef.current) {
      currentLocOverlayRef.current.setMap(null)
      currentLocOverlayRef.current = null
    }

    const bounds = new kakao.maps.LatLngBounds()
    const path: any[] = []
    let hasValidCoords = false

    schedules.forEach((schedule, index) => {
      const station = schedule.stations
      if (!station?.lat || !station?.lng) return

      hasValidCoords = true
      const position = new kakao.maps.LatLng(station.lat, station.lng)
      bounds.extend(position)
      path.push(position)

      const color = STATUS_COLORS[schedule.status] ?? '#1976D2'
      const statusLabel = STATUS_LABELS[schedule.status] ?? schedule.status

      const marker = document.createElement('div')
      marker.innerHTML = `
        <div style="
          width:32px;height:32px;border-radius:50%;
          background:${color};color:white;font-weight:bold;
          display:flex;align-items:center;justify-content:center;
          font-size:14px;border:3px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;
        ">
          ${schedule.status === 'completed' ? '✓' : index + 1}
        </div>
      `

      marker.onclick = () => {
        if (infoWindowRef.current) infoWindowRef.current.close()

        const infoWindow = new kakao.maps.InfoWindow({
          position,
          content: `
            <div style="padding:10px 14px;font-size:13px;min-width:180px;line-height:1.6;">
              <strong>${station.station_name}</strong><br/>
              <span style="color:#666;font-size:12px;">${station.address || '주소 없음'}</span><br/>
              <span style="
                display:inline-block;margin-top:4px;padding:2px 8px;border-radius:10px;
                font-size:11px;font-weight:bold;color:white;background:${color};
              ">${statusLabel}</span>
            </div>
          `,
        })

        infoWindow.open(map)
        infoWindowRef.current = infoWindow
      }

      const overlay = new kakao.maps.CustomOverlay({
        position,
        content: marker,
        yAnchor: 1,
      })

      overlay.setMap(map)
      overlaysRef.current.push(overlay)
    })

    if (currentLoc) {
      const currentPosition = new kakao.maps.LatLng(currentLoc.lat, currentLoc.lng)
      bounds.extend(currentPosition)

      const marker = document.createElement('div')
      marker.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="
            width:16px;height:16px;border-radius:50%;
            background:#2563EB;border:3px solid white;
            box-shadow:0 0 0 3px rgba(37,99,235,0.3);
          "></div>
          <span style="
            font-size:10px;font-weight:bold;color:#2563EB;
            background:white;padding:1px 5px;border-radius:8px;
            box-shadow:0 1px 4px rgba(0,0,0,0.2);white-space:nowrap;
          ">현재 위치</span>
        </div>
      `

      const overlay = new kakao.maps.CustomOverlay({
        position: currentPosition,
        content: marker,
        yAnchor: 1,
      })

      overlay.setMap(map)
      currentLocOverlayRef.current = overlay
    }

    if (!hasValidCoords) return

    if (path.length > 1) {
      const polyline = new kakao.maps.Polyline({
        path,
        strokeWeight: 3,
        strokeColor: '#E53935',
        strokeOpacity: 0.8,
        strokeStyle: 'solid',
      })

      polyline.setMap(map)
      polylineRef.current = polyline
      map.setBounds(bounds)
    } else if (path.length === 1) {
      map.setCenter(path[0])
      map.setLevel(5)
    }

    kakao.maps.event.addListener(map, 'click', () => {
      if (infoWindowRef.current) {
        infoWindowRef.current.close()
        infoWindowRef.current = null
      }
    })
  }, [currentLoc, kakaoReady, schedules])

  const handleOptimizeByGps = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('브라우저가 위치 서비스를 지원하지 않습니다.')
      return
    }

    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        setCurrentLoc({ lat, lng })

        try {
          const withCoords = schedules.filter((item) => item.stations?.lat && item.stations?.lng)
          const withoutCoords = schedules.filter((item) => !item.stations?.lat || !item.stations?.lng)

          const sorted = [...withCoords].sort((a, b) => {
            return (
              haversineDistance(lat, lng, a.stations!.lat!, a.stations!.lng!) -
              haversineDistance(lat, lng, b.stations!.lat!, b.stations!.lng!)
            )
          })

          const newOrder = [...sorted, ...withoutCoords]
          await Promise.all(newOrder.map((schedule, index) => scheduleApi.update(schedule.id, { sort_order: index })))
          setSchedules(newOrder.map((schedule, index) => ({ ...schedule, sort_order: index })))
          setIsOptimized(true)
          toast.success('현재 위치 기준으로 동선을 다시 정렬했습니다.')
        } catch {
          toast.error('동선 최적화에 실패했습니다.')
        } finally {
          setGpsLoading(false)
        }
      },
      (error) => {
        setGpsLoading(false)

        if (error.code === error.PERMISSION_DENIED) {
          toast.error('위치 권한을 허용해 주세요.')
          return
        }

        toast.error('현재 위치를 가져오지 못했습니다.')
      },
      { timeout: 10000, maximumAge: 60000 },
    )
  }, [schedules])

  const openNavigation = (schedule: Schedule, isFirst: boolean) => {
    const station = schedule.stations
    if (!station) {
      toast.error('기지국 정보가 없습니다.')
      return
    }

    if (station.lat && station.lng && !isFallbackCoord(station.lat, station.lng)) {
      if (isFirst && currentLoc) {
        window.open(
          `https://map.kakao.com/link/from/현재위치,${currentLoc.lat},${currentLoc.lng}/to/${encodeURIComponent(
            station.station_name,
          )},${station.lat},${station.lng}`,
          '_blank',
        )
        return
      }

      window.open(
        `https://map.kakao.com/link/to/${encodeURIComponent(station.station_name)},${station.lat},${station.lng}`,
        '_blank',
      )
      return
    }

    if (station.address) {
      window.open(`https://map.kakao.com/link/search/${encodeURIComponent(station.address)}`, '_blank')
      return
    }

    toast.error('주소 또는 좌표가 없습니다.')
  }

  const handleComplete = async (scheduleId: string) => {
    if (completingId) return

    setCompletingId(scheduleId)
    try {
      await scheduleApi.update(scheduleId, { status: 'completed' })
      setSchedules((prev) => prev.map((item) => (item.id === scheduleId ? { ...item, status: 'completed' } : item)))
      toast.success('작업을 완료 처리했습니다.')
    } catch {
      toast.error('완료 처리에 실패했습니다.')
    } finally {
      setCompletingId(null)
    }
  }

  const handlePostpone = async (event: React.MouseEvent, scheduleId: string) => {
    event.stopPropagation()
    if (postponingId) return
    if (!window.confirm('이 일정을 내일로 미루시겠습니까?')) return

    setPostponingId(scheduleId)
    try {
      await scheduleApi.postpone(scheduleId)
      setSchedules((prev) => prev.filter((item) => item.id !== scheduleId))
      toast.success('일정을 내일로 미뤘습니다.')
    } catch {
      toast.error('일정 연기에 실패했습니다.')
    } finally {
      setPostponingId(null)
    }
  }

  const completedCount = schedules.filter((schedule) => schedule.status === 'completed').length

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header title={`${user?.name ?? ''}님의 동선`} />

      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <div className="mx-auto max-w-lg space-y-3">
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => setSelectedDate((prev) => adjustDate(prev, -1))} className="p-1.5 text-gray-400 hover:text-gray-700">
              <ChevronLeft size={22} />
            </button>
            <span className="min-w-[130px] text-center text-sm font-semibold text-gray-800">{formatDate(selectedDate)}</span>
            <button onClick={() => setSelectedDate((prev) => adjustDate(prev, 1))} className="p-1.5 text-gray-400 hover:text-gray-700">
              <ChevronRight size={22} />
            </button>
          </div>

          <button
            onClick={handleOptimizeByGps}
            disabled={gpsLoading || loading}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
              isOptimized ? 'bg-green-600 hover:bg-green-700' : 'bg-[#215288] hover:bg-[#1a4070]'
            }`}
          >
            {gpsLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                위치 확인 중...
              </>
            ) : isOptimized ? (
              <>
                <LocateFixed size={16} />
                최적화 완료, 다시 계산하기
              </>
            ) : (
              <>
                <LocateFixed size={16} />
                현재 위치 기준 동선 최적화
              </>
            )}
          </button>

          {yearlyStats && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-blue-50 p-2.5 text-center">
                <p className="text-xl font-bold text-[#215288]">{yearlyStats.total_assigned}</p>
                <p className="text-[11px] text-gray-500">올해 총 배정</p>
              </div>
              <div className="rounded-xl bg-green-50 p-2.5 text-center">
                <p className="text-xl font-bold text-green-600">{yearlyStats.total_completed}</p>
                <p className="text-[11px] text-gray-500">올해 완료</p>
              </div>
            </div>
          )}

          {managerInfo?.name && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              관리자: <span className="font-medium text-gray-800">{managerInfo.name}</span>
              {managerInfo.phone ? <span className="ml-2">{managerInfo.phone}</span> : null}
            </div>
          )}

          {!loading && schedules.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-gray-50 p-2.5 text-center">
                <p className="text-xl font-bold text-gray-900">{schedules.length}</p>
                <p className="text-[11px] text-gray-500">전체</p>
              </div>
              <div className="rounded-xl bg-green-50 p-2.5 text-center">
                <p className="text-xl font-bold text-green-600">{completedCount}</p>
                <p className="text-[11px] text-gray-500">완료</p>
              </div>
              <div className="rounded-xl bg-orange-50 p-2.5 text-center">
                <p className="text-xl font-bold text-orange-600">{schedules.length - completedCount}</p>
                <p className="text-[11px] text-gray-500">남은 작업</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {geocoding && (
        <div className="border-b border-blue-100 bg-blue-50 px-4 py-2">
          <div className="mx-auto flex max-w-lg items-center gap-2 text-sm text-blue-700">
            <Loader2 size={14} className="animate-spin" />
            좌표 보정 중...
          </div>
        </div>
      )}

      <div ref={mapContainerRef} style={{ width: '100%', height: '350px', background: '#e8e8e8' }} />

      {schedules.length > 0 && (
        <div className="border-b border-gray-100 bg-white px-4 py-2">
          <div className="mx-auto flex max-w-lg justify-center gap-4">
            {[
              { color: '#1976D2', label: '대기중' },
              { color: '#22c55e', label: '완료' },
              { color: '#f59e0b', label: '연기' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full" style={{ background: item.color }} />
                <span className="text-xs text-gray-600">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-lg space-y-2 px-4 pb-4 pt-3">
        {loading ? (
          <div className="py-12 text-center text-gray-400">
            <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
            불러오는 중...
          </div>
        ) : !user?.employee_id ? (
          <div className="py-12 text-center text-gray-400">
            <p className="mb-1 text-lg">직원 정보가 연결되어 있지 않습니다.</p>
            <p className="text-sm">관리자에게 문의해 주세요.</p>
          </div>
        ) : schedules.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <MapPin size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">배정된 일정이 없습니다.</p>
          </div>
        ) : (
          schedules.map((schedule, index) => {
            const station = schedule.stations
            const color = STATUS_COLORS[schedule.status] ?? '#1976D2'
            const statusLabel = STATUS_LABELS[schedule.status] ?? schedule.status

            return (
              <div
                key={schedule.id}
                onClick={() => navigate(`/schedule/${schedule.id}`)}
                className="cursor-pointer rounded-xl border border-gray-100 bg-white p-4 shadow-sm active:bg-gray-50"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: color }}
                    >
                      {schedule.status === 'completed' ? <CheckCircle2 size={16} /> : index + 1}
                    </span>
                    <p className={`text-sm font-bold ${schedule.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {station?.station_name || '기지국'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {schedule.status !== 'in_progress' && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                        style={{ background: color }}
                      >
                        {statusLabel}
                      </span>
                    )}
                    {isAdmin && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          setReassignTarget(schedule)
                        }}
                        className="flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-200"
                      >
                        <RefreshCw size={10} />
                        재배정
                      </button>
                    )}
                  </div>
                </div>

                <div className="mb-3 ml-10 space-y-0.5">
                  <p className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin size={11} />
                    {station?.address || '주소 없음'}
                  </p>
                  {schedule.started_at && (
                    <p className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock size={11} />
                      시작: {formatTime(schedule.started_at)}
                    </p>
                  )}
                </div>

                <div className="ml-10 flex items-center gap-2">
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      openNavigation(schedule, index === 0)
                    }}
                    className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600"
                  >
                    <Navigation size={14} />
                    길찾기
                  </button>

                  {schedule.status !== 'completed' && schedule.status !== 'postponed' && (
                    <button
                      onClick={(event) => handlePostpone(event, schedule.id)}
                      disabled={postponingId === schedule.id}
                      className="flex items-center gap-1 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-600 disabled:opacity-50"
                    >
                      {postponingId === schedule.id ? <Loader2 size={14} className="animate-spin" /> : <CalendarX2 size={14} />}
                      내일로
                    </button>
                  )}

                  {schedule.status === 'pending' && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        handleComplete(schedule.id)
                      }}
                      disabled={completingId === schedule.id}
                      className="flex items-center gap-1 rounded-lg bg-[#215288] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {completingId === schedule.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      작업완료
                    </button>
                  )}

                  <div className="flex-1" />
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
