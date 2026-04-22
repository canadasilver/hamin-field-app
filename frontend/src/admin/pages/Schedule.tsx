import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { scheduleApi, employeeApi } from '../../services/api'
import type { Schedule, Employee } from '../../types'
import { format, addDays, subDays, startOfWeek, endOfWeek } from 'date-fns'
import { ko } from 'date-fns/locale'

const BRAND = '#215288'

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '대기', color: '#92400e', bg: '#fef3c7' },
  in_progress: { label: '진행중', color: '#1e40af', bg: '#dbeafe' },
  completed: { label: '완료', color: '#065f46', bg: '#d1fae5' },
  postponed: { label: '미루기', color: '#7c2d12', bg: '#fee2e2' },
}

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailModal, setDetailModal] = useState<Schedule | null>(null)

  const dateStr = format(currentDate, 'yyyy-MM-dd')

  useEffect(() => {
    employeeApi.list(true).then(res => setEmployees(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const params: Record<string, string> = { scheduled_date: dateStr }
        if (selectedEmployee) params.employee_id = selectedEmployee
        if (selectedStatus) params.status = selectedStatus
        const res = await scheduleApi.list(params)
        setSchedules(res.data)
      } catch {
        setError('일정을 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [dateStr, selectedEmployee, selectedStatus])

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const grouped = employees.reduce<Record<string, Schedule[]>>((acc, emp) => {
    acc[emp.id] = schedules.filter(s => s.employee_id === emp.id)
    return acc
  }, {})

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await scheduleApi.update(id, { status })
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, status: status as Schedule['status'] } : s))
    } catch {
      setError('상태 변경에 실패했습니다.')
    }
  }

  return (
    <div>
      {/* Date Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NavBtn onClick={() => setCurrentDate(d => subDays(d, 1))}><ChevronLeft size={16} /></NavBtn>
          <input
            type="date"
            value={dateStr}
            onChange={e => setCurrentDate(new Date(e.target.value))}
            style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none' }}
          />
          <NavBtn onClick={() => setCurrentDate(d => addDays(d, 1))}><ChevronRight size={16} /></NavBtn>
          <button
            onClick={() => setCurrentDate(new Date())}
            style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }}
          >
            오늘
          </button>
        </div>

        <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)} style={selectStyle}>
          <option value="">전체 직원</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>

        <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} style={selectStyle}>
          <option value="">전체 상태</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {error && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>{error}</div>}

      {/* Week Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {weekDays.map(d => {
          const ds = format(d, 'yyyy-MM-dd')
          const isToday = ds === format(new Date(), 'yyyy-MM-dd')
          const isSelected = ds === dateStr
          return (
            <button
              key={ds}
              onClick={() => setCurrentDate(d)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', minWidth: 64, flexShrink: 0,
                background: isSelected ? BRAND : isToday ? '#e0e7ff' : '#f3f4f6',
                color: isSelected ? '#fff' : isToday ? '#3730a3' : '#374151',
                fontWeight: isSelected || isToday ? 700 : 400, fontSize: 12
              }}
            >
              <div>{format(d, 'EEE', { locale: ko })}</div>
              <div style={{ fontSize: 14 }}>{format(d, 'd')}</div>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
      ) : schedules.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          {dateStr} 일정이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {employees.filter(e => (grouped[e.id] ?? []).length > 0).map(emp => (
            <div key={emp.id} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{emp.name}</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{grouped[emp.id].length}건</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      {['순서', '기지국', '주소', '상태', '시작', '완료', ''].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#9ca3af', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[emp.id].sort((a, b) => a.sort_order - b.sort_order).map(s => {
                      const st = STATUS_MAP[s.status] ?? STATUS_MAP.pending
                      return (
                        <tr key={s.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: '#9ca3af' }}>{s.sort_order}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 500 }}>{s.stations?.station_name ?? '-'}</td>
                          <td style={{ padding: '8px 12px', color: '#6b7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.stations?.address ?? '-'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <select
                              value={s.status}
                              onChange={e => handleStatusChange(s.id, e.target.value)}
                              style={{ padding: '3px 6px', borderRadius: 6, border: `1px solid ${st.color}`, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                            >
                              {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 12 }}>{s.started_at ? new Date(s.started_at).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                          <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 12 }}>{s.completed_at ? new Date(s.completed_at).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <button onClick={() => setDetailModal(s)} style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#6b7280' }}>상세</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 440, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>일정 상세</h3>
              <button onClick={() => setDetailModal(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px 12px', fontSize: 13 }}>
              {[
                ['기지국', detailModal.stations?.station_name ?? '-'],
                ['주소', detailModal.stations?.address ?? '-'],
                ['예정일', detailModal.scheduled_date],
                ['상태', STATUS_MAP[detailModal.status]?.label ?? detailModal.status],
                ['시작시간', detailModal.started_at ? new Date(detailModal.started_at).toLocaleString('ko') : '-'],
                ['완료시간', detailModal.completed_at ? new Date(detailModal.completed_at).toLocaleString('ko') : '-'],
                ['미루기→', detailModal.postponed_to ?? '-'],
              ].map(([k, v]) => (
                <>
                  <dt key={`dt-${k}`} style={{ color: '#6b7280', fontWeight: 600 }}>{k}</dt>
                  <dd key={`dd-${k}`} style={{ margin: 0 }}>{v}</dd>
                </>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}

function NavBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#374151' }}>
      {children}
    </button>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer'
}
