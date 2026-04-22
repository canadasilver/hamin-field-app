import { useState, useEffect } from 'react'
import { employeeApi, scheduleApi } from '../../services/api'
import type { Employee, Schedule } from '../../types'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

const BRAND = '#215288'

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#f3f4f6', color: '#6b7280', label: '대기' },
  in_progress: { bg: '#eff6ff', color: BRAND, label: '진행중' },
  completed: { bg: '#d1fae5', color: '#065f46', label: '완료' },
  postponed: { bg: '#fef3c7', color: '#92400e', label: '미루기' },
}

function formatDate(d: string) {
  const date = new Date(d)
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`
}

export default function ScheduleView() {
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all')
  const [selectedEmpId, setSelectedEmpId] = useState<string>('')

  // all 뷰: 직원별 스케줄 맵
  const [scheduleMap, setScheduleMap] = useState<Record<string, Schedule[]>>({})
  // single 뷰: 선택 직원 스케줄
  const [schedules, setSchedules] = useState<Schedule[]>([])

  useEffect(() => {
    loadInitial()
  }, [])

  useEffect(() => {
    if (viewMode === 'all') {
      loadSchedulesAll()
    } else if (selectedEmpId) {
      loadSchedulesSingle()
    }
  }, [selectedDate, viewMode, selectedEmpId])

  const loadInitial = async () => {
    try {
      setLoading(true)
      const empRes = await employeeApi.list()
      setEmployees(empRes.data)
      if (empRes.data.length > 0) {
        setSelectedEmpId(empRes.data[0].id)
      }
    } catch {
      console.error('직원 목록 로드 실패')
    } finally {
      setLoading(false)
    }
  }

  const loadSchedulesAll = async () => {
    try {
      const map: Record<string, Schedule[]> = {}
      await Promise.all(
        employees.map(async emp => {
          const res = await scheduleApi.list({ employee_id: emp.id, scheduled_date: selectedDate })
          map[emp.id] = (res.data || []).sort((a: Schedule, b: Schedule) => a.sort_order - b.sort_order)
        })
      )
      setScheduleMap(map)
    } catch {
      console.error('스케줄 로드 실패')
    }
  }

  const loadSchedulesSingle = async () => {
    try {
      const res = await scheduleApi.list({ employee_id: selectedEmpId, scheduled_date: selectedDate })
      setSchedules((res.data || []).sort((a: Schedule, b: Schedule) => a.sort_order - b.sort_order))
    } catch {
      console.error('스케줄 로드 실패')
    }
  }

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const goToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0])
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} color="#6b7280" />
      </div>
    )
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 80px)' }}>
      {/* 헤더: 날짜 + 보기모드 */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => changeDate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={20} color={BRAND} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#111827', minWidth: 140 }}>{formatDate(selectedDate)}</span>
          <button onClick={() => changeDate(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronRight size={20} color={BRAND} />
          </button>
          <button onClick={goToday} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${BRAND}`, background: '#fff', color: BRAND, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
            오늘
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setViewMode('all')}
            style={{
              padding: '6px 16px', borderRadius: 6, border: `1px solid ${viewMode === 'all' ? BRAND : '#e5e7eb'}`,
              background: viewMode === 'all' ? BRAND : '#fff', color: viewMode === 'all' ? '#fff' : '#6b7280',
              cursor: 'pointer', fontWeight: 600, fontSize: 12
            }}
          >
            전체 직원
          </button>
          <button
            onClick={() => setViewMode('single')}
            style={{
              padding: '6px 16px', borderRadius: 6, border: `1px solid ${viewMode === 'single' ? BRAND : '#e5e7eb'}`,
              background: viewMode === 'single' ? BRAND : '#fff', color: viewMode === 'single' ? '#fff' : '#6b7280',
              cursor: 'pointer', fontWeight: 600, fontSize: 12
            }}
          >
            개별 직원
          </button>
        </div>
      </div>

      {/* 전체 직원 뷰 */}
      {viewMode === 'all' && (
        <div style={{ padding: 24, overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(employees.length, 4)}, 1fr)`, gap: 16, minWidth: 'min-content' }}>
            {employees.map(emp => {
              const empSchedules = scheduleMap[emp.id] || []
              return (
                <div key={emp.id} style={{ flex: '0 0 280px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  {/* 직원 헤더 */}
                  <div style={{ padding: 12, background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#111827' }}>{emp.name}</h3>
                    <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>{empSchedules.length}건</p>
                  </div>

                  {/* 기지국 목록 */}
                  <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    {empSchedules.length === 0 ? (
                      <div style={{ padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>배분된 기지국이 없습니다.</div>
                    ) : (
                      empSchedules.map((schedule, idx) => (
                        <div
                          key={schedule.id}
                          style={{
                            padding: 12, borderBottom: idx < empSchedules.length - 1 ? '1px solid #f3f4f6' : 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div>
                              <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: '#111827' }}>#{idx + 1}</p>
                              <p style={{ fontSize: 13, fontWeight: 600, margin: '4px 0 0', color: '#111827' }}>
                                {schedule.stations?.station_name || '-'}
                              </p>
                            </div>
                            <div style={{
                              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                              background: STATUS_STYLE[schedule.status]?.bg || '#f3f4f6',
                              color: STATUS_STYLE[schedule.status]?.color || '#6b7280'
                            }}>
                              {STATUS_STYLE[schedule.status]?.label || schedule.status}
                            </div>
                          </div>
                          <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
                            {schedule.stations?.address || '-'}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 개별 직원 뷰 */}
      {viewMode === 'single' && (
        <div>
          {/* 직원 탭 */}
          <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px', display: 'flex', gap: 8, overflowX: 'auto' }}>
            {employees.map(emp => (
              <button
                key={emp.id}
                onClick={() => setSelectedEmpId(emp.id)}
                style={{
                  padding: '12px 16px', borderBottom: `3px solid ${selectedEmpId === emp.id ? BRAND : 'transparent'}`,
                  background: 'none', border: 'none', cursor: 'pointer', fontWeight: selectedEmpId === emp.id ? 600 : 500,
                  color: selectedEmpId === emp.id ? BRAND : '#6b7280', fontSize: 13, whiteSpace: 'nowrap'
                }}
              >
                {emp.name}
              </button>
            ))}
          </div>

          {/* 기지국 목록 */}
          <div style={{ padding: 24, maxWidth: 900 }}>
            {schedules.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#9ca3af' }}>배분된 기지국이 없습니다.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {schedules.map((schedule, idx) => (
                  <div
                    key={schedule.id}
                    style={{
                      padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb',
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: BRAND }}>#{idx + 1}</span>
                        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#111827' }}>
                          {schedule.stations?.station_name || '-'}
                        </h3>
                      </div>
                      <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                        {schedule.stations?.address || '-'}
                      </p>
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6,
                      background: STATUS_STYLE[schedule.status]?.bg || '#f3f4f6',
                      color: STATUS_STYLE[schedule.status]?.color || '#6b7280',
                      whiteSpace: 'nowrap'
                    }}>
                      {STATUS_STYLE[schedule.status]?.label || schedule.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
