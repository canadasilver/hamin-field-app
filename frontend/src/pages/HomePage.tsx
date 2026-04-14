import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/common/Header'
import ScheduleCard from '../components/schedule/ScheduleCard'
import { scheduleApi, employeeApi, assignmentApi } from '../services/api'
import { useStore } from '../store/useStore'
import { useAuth } from '../contexts/AuthContext'
import { ChevronLeft, ChevronRight, Route } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Schedule, Employee } from '../types'

declare global {
  interface Window { kakao: any }
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

export default function HomePage() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const { selectedDate, setSelectedDate, selectedEmployeeId, setSelectedEmployeeId } = useStore()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEmployees()
    // kakao maps load
    if (window.kakao?.maps?.load) {
      window.kakao.maps.load(() => {})
    }
  }, [])

  useEffect(() => {
    loadSchedules()
  }, [selectedDate, selectedEmployeeId])

  const loadEmployees = async () => {
    try {
      const res = await employeeApi.list()
      setEmployees(res.data)
      if (res.data.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(res.data[0].id)
      }
    } catch {
      toast.error('직원 목록 로딩 실패')
    }
  }

  const geocodeStations = async (data: Schedule[]): Promise<Schedule[]> => {
    const needFix = data.filter(s => {
      const st = s.stations
      return st?.address && st?.lat && st?.lng && isFallbackCoord(st.lat, st.lng)
    })
    if (needFix.length === 0) return data

    // kakao maps가 로드될 때까지 대기
    if (!window.kakao?.maps?.services) {
      await new Promise<void>((resolve) => {
        if (window.kakao?.maps?.load) {
          window.kakao.maps.load(() => resolve())
        } else {
          resolve()
        }
      })
    }
    if (!window.kakao?.maps?.services) return data

    const updates: { station_id: string; lat: number; lng: number }[] = []
    const updated = [...data]

    for (let i = 0; i < needFix.length; i++) {
      const s = needFix[i]
      const coords = await geocodeWithKakaoJS(s.stations!.address!)
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
    }

    return updated
  }

  const loadSchedules = async () => {
    if (!selectedEmployeeId) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await scheduleApi.list({
        employee_id: selectedEmployeeId,
        scheduled_date: selectedDate,
      })
      let data: Schedule[] = res.data
      data = await geocodeStations(data)
      setSchedules(data)
    } catch {
      toast.error('일정 로딩 실패')
    } finally {
      setLoading(false)
    }
  }

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const handleOptimize = async () => {
    if (!selectedEmployeeId) return
    try {
      await scheduleApi.optimizeRoute(selectedEmployeeId, selectedDate)
      toast.success('동선 최적화 완료')
      loadSchedules()
    } catch {
      toast.error('최적화 실패')
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header
        title="하민공조 현장관리"
        right={
          <button
            onClick={handleOptimize}
            className="flex items-center gap-1 px-3 py-1.5 bg-kt-red text-white rounded-lg text-sm font-medium"
          >
            <Route size={16} />
            동선최적화
          </button>
        }
      />

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* 날짜 선택 */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => changeDate(-1)} className="p-2 rounded-lg hover:bg-gray-200">
            <ChevronLeft size={20} />
          </button>
          <span className="font-bold text-gray-900">{formatDate(selectedDate)}</span>
          <button onClick={() => changeDate(1)} className="p-2 rounded-lg hover:bg-gray-200">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* 직원 선택 */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
          {employees.map((emp) => (
            <button
              key={emp.id}
              onClick={() => setSelectedEmployeeId(emp.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedEmployeeId === emp.id
                  ? 'bg-kt-red text-white'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {emp.name}
            </button>
          ))}
        </div>

        {/* 일정 요약 */}
        {schedules.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{schedules.length}</p>
              <p className="text-xs text-gray-500">전체</p>
            </div>
            <div className="bg-white rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-600">
                {schedules.filter(s => s.status === 'completed').length}
              </p>
              <p className="text-xs text-gray-500">완료</p>
            </div>
            <div className="bg-white rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-yellow-600">
                {schedules.filter(s => s.status === 'in_progress').length}
              </p>
              <p className="text-xs text-gray-500">진행중</p>
            </div>
          </div>
        )}

        {/* 일정 목록 */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-gray-400">로딩중...</div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg mb-1">등록된 일정이 없습니다</p>
              <p className="text-sm">기지국을 업로드하고 일정을 배정하세요</p>
            </div>
          ) : (
            schedules
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((schedule, index) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                displayOrder={index + 1}
                isAdmin={isAdmin}
                onPostpone={loadSchedules}
                onComplete={loadSchedules}
                onReassigned={(newDate) => {
                  if (newDate !== selectedDate) {
                    setSelectedDate(newDate)
                  } else {
                    loadSchedules()
                  }
                }}
                onClick={() => navigate(`/schedule/${schedule.id}`)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
