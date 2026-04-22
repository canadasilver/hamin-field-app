import { useEffect, useState } from 'react'
import { CheckSquare, Square, X } from 'lucide-react'
import { scheduleApi, employeeApi, checklistApi } from '../../services/api'
import type { Schedule, Employee, Checklist } from '../../types'

const BRAND = '#215288'

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '대기', color: '#92400e', bg: '#fef3c7' },
  in_progress: { label: '진행중', color: '#1e40af', bg: '#dbeafe' },
  completed: { label: '완료', color: '#065f46', bg: '#d1fae5' },
  postponed: { label: '미루기', color: '#7c2d12', bg: '#fee2e2' },
}

export default function ASChecklist() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailSchedule, setDetailSchedule] = useState<Schedule | null>(null)
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)

  useEffect(() => {
    employeeApi.list(false).then(res => setEmployees(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const params: Record<string, string> = {}
        if (filterEmployee) params.employee_id = filterEmployee
        if (filterStatus) params.status = filterStatus
        if (dateFrom) params.scheduled_date = dateFrom
        const res = await scheduleApi.list(params)
        setSchedules(res.data)
      } catch {
        setError('체크리스트를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filterEmployee, filterStatus, dateFrom])

  const openDetail = async (s: Schedule) => {
    setDetailSchedule(s)
    setChecklist(null)
    setChecklistLoading(true)
    try {
      const res = await checklistApi.get(s.id)
      setChecklist(res.data)
    } catch {
      setChecklist(null)
    } finally {
      setChecklistLoading(false)
    }
  }

  const empName = (id: string) => employees.find(e => e.id === id)?.name ?? id

  const completionRate = (cl: Checklist) => {
    const items = [cl.item_1, cl.item_2, cl.item_3, cl.item_4, cl.item_5]
    const done = items.filter(Boolean).length
    return Math.round((done / 5) * 100)
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} style={selectStyle}>
          <option value="">전체 직원</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">전체 상태</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }}
        />
        {(filterEmployee || filterStatus || dateFrom) && (
          <button
            onClick={() => { setFilterEmployee(''); setFilterStatus(''); setDateFrom('') }}
            style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#6b7280' }}
          >
            초기화
          </button>
        )}
      </div>

      {error && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>{error}</div>}

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280' }}>
          총 {schedules.length}건
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['예정일', '기지국', '담당자', '상태', '시작', '완료', '체크리스트'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>데이터가 없습니다.</td></tr>
                ) : schedules.map(s => {
                  const st = STATUS_MAP[s.status] ?? STATUS_MAP.pending
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{s.scheduled_date}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>{s.stations?.station_name ?? '-'}</td>
                      <td style={{ padding: '10px 14px' }}>{empName(s.employee_id)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>
                        {s.started_at ? new Date(s.started_at).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>
                        {s.completed_at ? new Date(s.completed_at).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button onClick={() => openDetail(s)} style={{ fontSize: 11, padding: '3px 10px', border: `1px solid ${BRAND}`, borderRadius: 6, background: '#fff', cursor: 'pointer', color: BRAND }}>
                          조회
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Checklist Detail Modal */}
      {detailSchedule && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 480, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>A/S 체크리스트</h3>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{detailSchedule.stations?.station_name} · {detailSchedule.scheduled_date}</p>
              </div>
              <button onClick={() => setDetailSchedule(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
            </div>

            {checklistLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
            ) : !checklist ? (
              <div style={{ padding: 20, background: '#f9fafb', borderRadius: 8, color: '#9ca3af', textAlign: 'center', fontSize: 14 }}>
                작성된 체크리스트가 없습니다.
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>완료율</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#15803d' }}>{completionRate(checklist)}%</span>
                </div>

                {([
                  [checklist.item_1, checklist.item_1_label],
                  [checklist.item_2, checklist.item_2_label],
                  [checklist.item_3, checklist.item_3_label],
                  [checklist.item_4, checklist.item_4_label],
                  [checklist.item_5, checklist.item_5_label],
                ] as [boolean, string][]).map(([checked, label], i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < 4 ? '1px solid #f3f4f6' : 'none' }}>
                    {checked ? <CheckSquare size={18} color="#10b981" /> : <Square size={18} color="#d1d5db" />}
                    <span style={{ fontSize: 14, color: checked ? '#111827' : '#9ca3af' }}>{label}</span>
                  </div>
                ))}

                {checklist.notes && (
                  <div style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>특이사항</div>
                    <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>{checklist.notes}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer'
}
