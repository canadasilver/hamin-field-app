import { useEffect, useState, useCallback, Dispatch, SetStateAction } from 'react'
import * as XLSX from 'xlsx'
import { dashboardApi, employeeApi } from '../../services/api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  RefreshCw, Download, Printer, ChevronLeft, ChevronRight, X,
  Building2, Users, CalendarCheck, CheckCircle, Clock,
} from 'lucide-react'

const BRAND = '#215288'

// ===== Types =====
interface Totals {
  total: number
  completed: number
  pending: number
  postponed: number
  completion_rate: number
}
interface AnnualEmp { name: string; total: number; completed: number; completion_rate: number; annual_pay: number }
interface AnnualStats {
  year: number
  monthly: { month: number; total: number; completed: number; pending: number; postponed: number }[]
  totals: Totals
  employees: AnnualEmp[]
}
interface MonthlyEmp { name: string; total: number; completed: number; postponed: number; completion_rate: number; monthly_pay: number }
interface StationRow { station_name: string; employee_name: string; status: string; completed_at: string }
interface MonthlyStats {
  year: number
  month: number
  weekly: { week: number; total: number; completed: number; pending: number; postponed: number }[]
  totals: Totals
  employees: MonthlyEmp[]
  stations: StationRow[]
}
interface DailyEmp { name: string; total: number; completed: number; incomplete: number }
interface TaskRow {
  sort_order: number
  station_name: string
  employee_name: string
  status: string
  started_at: string
  completed_at: string
  duration_minutes: number | null
}
interface DailyStats {
  date: string
  summary: { total: number; completed: number; in_progress: number; pending: number; postponed: number }
  employees: DailyEmp[]
  tasks: TaskRow[]
}
interface TaskListItem {
  id: string
  station_name: string
  address: string
  employee_name: string
  scheduled_date: string
  status: string
}
interface SummaryStats {
  totalEmployees: number
  todayTotal: number
  todayCompleted: number
  todayIncomplete: number
}

type Tab = 'annual' | 'monthly' | 'daily'

// ===== Constants =====
const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
const STATUS_LABEL: Record<string, string> = {
  completed: '완료', in_progress: '진행중', pending: '대기', postponed: '미루기',
}
const STATUS_BADGE: Record<string, React.CSSProperties> = {
  completed: { background: '#dcfce7', color: '#15803d' },
  in_progress: { background: '#dbeafe', color: '#1d4ed8' },
  pending: { background: '#f3f4f6', color: '#6b7280' },
  postponed: { background: '#fef3c7', color: '#92400e' },
}
const FILTER_LABEL: Record<string, string> = {
  all: '전체 작업', completed: '완료된 작업', pending: '대기 중인 작업',
  postponed: '미루기된 작업', in_progress: '진행중인 작업',
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function parseErr(e: unknown): string {
  return (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ?? (e as { message?: string })?.message
    ?? '알 수 없는 오류'
}

// ===== Excel Export =====
function exportAnnual(data: AnnualStats, year: number) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['월', '전체', '완료', '대기', '미루기'],
    ...data.monthly.map(m => [`${m.month}월`, m.total, m.completed, m.pending, m.postponed]),
    ['합계', data.totals.total, data.totals.completed, data.totals.pending, data.totals.postponed],
  ]), '월별현황')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['직원명', '전체', '완료', '완료율(%)', '예상급여(원)'],
    ...data.employees.map(e => [e.name, e.total, e.completed, e.completion_rate, e.annual_pay]),
  ]), '직원별실적')
  XLSX.writeFile(wb, `연간통계_${year}.xlsx`)
}

function exportMonthly(data: MonthlyStats, year: number, month: number) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['주차', '전체', '완료', '대기', '미루기'],
    ...data.weekly.map(w => [`${w.week}주차`, w.total, w.completed, w.pending, w.postponed]),
    ['합계', data.totals.total, data.totals.completed, data.totals.pending, data.totals.postponed],
  ]), '주차별현황')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['직원명', '전체', '완료', '미루기', '완료율(%)', '이번달급여(원)'],
    ...data.employees.map(e => [e.name, e.total, e.completed, e.postponed, e.completion_rate, e.monthly_pay]),
  ]), '직원별실적')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['기지국명', '담당직원', '상태', '완료일'],
    ...data.stations.map(s => [s.station_name, s.employee_name, STATUS_LABEL[s.status] || s.status, s.completed_at]),
  ]), '기지국현황')
  XLSX.writeFile(wb, `월간통계_${year}년${month}월.xlsx`)
}

function exportDaily(data: DailyStats, dateStr: string) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['직원명', '담당건수', '완료', '미완료'],
    ...data.employees.map(e => [e.name, e.total, e.completed, e.incomplete]),
  ]), '직원별실적')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['순서', '기지국명', '담당직원', '상태', '시작시간', '완료시간', '소요시간(분)'],
    ...data.tasks.map(t => [
      t.sort_order, t.station_name, t.employee_name,
      STATUS_LABEL[t.status] || t.status,
      t.started_at, t.completed_at, t.duration_minutes ?? '',
    ]),
  ]), '작업상세')
  XLSX.writeFile(wb, `일별통계_${dateStr}.xlsx`)
}

// ===== Shared Sub-components =====
function ToolBar({ onExcel, onRefresh, loading }: { onExcel: () => void; onRefresh: () => void; loading: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        onClick={onExcel}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 12, background: '#f0fdf4', color: '#15803d', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
      >
        <Download size={13} /> 엑셀
      </button>
      <button
        onClick={() => window.print()}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 12, background: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
      >
        <Printer size={13} /> 인쇄
      </button>
      <button
        onClick={onRefresh}
        disabled={loading}
        style={{ padding: '6px 8px', background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
      >
        <RefreshCw size={15} style={loading ? { animation: 'spin 0.8s linear infinite' } : {}} />
      </button>
    </div>
  )
}

function ChartLegend() {
  return (
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 12, color: '#6b7280' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: '#22c55e', display: 'inline-block' }} />완료
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: '#9ca3af', display: 'inline-block' }} />대기
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: '#fbbf24', display: 'inline-block' }} />미루기
      </span>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
      <RefreshCw size={24} color="#d1d5db" style={{ animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}

function ErrorBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 20, textAlign: 'center' }}>
      <p style={{ color: '#dc2626', fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>데이터를 불러오지 못했습니다</p>
      <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 12px', wordBreak: 'break-all' }}>{msg}</p>
      <button
        onClick={onRetry}
        style={{ padding: '6px 16px', fontSize: 13, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
      >
        다시 시도
      </button>
    </div>
  )
}

function StatCard({
  label, value, valueColor, onClick, selected,
}: {
  label: string; value: number | string; valueColor?: string;
  onClick?: () => void; selected?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        flex: 1,
        padding: '12px 8px',
        textAlign: 'center',
        background: selected ? '#eff6ff' : '#f9fafb',
        border: selected ? `2px solid ${BRAND}` : '2px solid transparent',
        borderRadius: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
        outline: 'none',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: valueColor ?? '#111827' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{label}</div>
    </button>
  )
}

function TaskListPanel({ title, items, loading, onClose }: {
  title: string; items: TaskListItem[]; loading: boolean; onClose: () => void
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${BRAND}40`, overflow: 'hidden', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#eff6ff', borderBottom: `1px solid ${BRAND}30` }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{title}</span>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
          <X size={15} />
        </button>
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
          <RefreshCw size={20} color="#d1d5db" style={{ animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : items.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '32px 0' }}>데이터 없음</p>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 500 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                {['#', '기지국명', '담당직원', '주소', '날짜', '상태'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === '#' || h === '날짜' || h === '상태' ? 'center' : 'left', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '8px 10px', textAlign: 'center', color: '#9ca3af' }}>{i + 1}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.station_name || '-'}</td>
                  <td style={{ padding: '8px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{item.employee_name || '-'}</td>
                  <td style={{ padding: '8px 10px', color: '#9ca3af', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.address || '-'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', color: '#6b7280', whiteSpace: 'nowrap' }}>{item.scheduled_date}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, ...(STATUS_BADGE[item.status] ?? { background: '#f3f4f6', color: '#6b7280' }) }}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Card({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>{title}</h3>
        {extra && <span style={{ fontSize: 12, color: '#9ca3af' }}>{extra}</span>}
      </div>
      {children}
    </div>
  )
}

// ===== Annual View =====
function AnnualView({ year, setYear }: { year: number; setYear: Dispatch<SetStateAction<number>> }) {
  const [data, setData] = useState<AnnualStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [taskItems, setTaskItems] = useState<TaskListItem[]>([])
  const [taskLoading, setTaskLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSelectedStatus(null)
    setTaskItems([])
    try {
      const res = await dashboardApi.annual(year)
      setData(res.data)
    } catch (e) {
      setError(parseErr(e))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  const handleStatClick = useCallback(async (statusKey: string) => {
    if (selectedStatus === statusKey) {
      setSelectedStatus(null); setTaskItems([]); return
    }
    setSelectedStatus(statusKey)
    setTaskLoading(true)
    try {
      const res = await dashboardApi.tasks({ year, status: statusKey === 'all' ? undefined : statusKey })
      setTaskItems(res.data)
    } catch {
      setTaskItems([])
    } finally {
      setTaskLoading(false)
    }
  }, [selectedStatus, year])

  const chartData = data?.monthly.map(m => ({
    name: MONTH_LABELS[m.month - 1],
    완료: m.completed, 대기: m.pending, 미루기: m.postponed,
  })) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setYear(y => y - 1)} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer' }}><ChevronLeft size={18} /></button>
          <span style={{ fontWeight: 700, fontSize: 17, width: 72, textAlign: 'center' }}>{year}년</span>
          <button onClick={() => setYear(y => y + 1)} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer' }}><ChevronRight size={18} /></button>
        </div>
        <ToolBar onExcel={() => data && exportAnnual(data, year)} onRefresh={load} loading={loading} />
      </div>

      {loading && <LoadingSpinner />}
      {!loading && error && <ErrorBox msg={error} onRetry={load} />}

      {!loading && !error && data && (
        <>
          <Card title="월별 작업 현황">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="완료" fill="#22C55E" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar dataKey="대기" fill="#9CA3AF" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar dataKey="미루기" fill="#FBBF24" radius={[3, 3, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
            <ChartLegend />
          </Card>

          <Card title="연간 합계">
            <div style={{ display: 'flex', gap: 8 }}>
              <StatCard label="전체" value={data.totals.total} onClick={() => handleStatClick('all')} selected={selectedStatus === 'all'} />
              <StatCard label="완료" value={data.totals.completed} valueColor="#16a34a" onClick={() => handleStatClick('completed')} selected={selectedStatus === 'completed'} />
              <StatCard label="대기" value={data.totals.pending} valueColor="#6b7280" onClick={() => handleStatClick('pending')} selected={selectedStatus === 'pending'} />
              <StatCard label="미루기" value={data.totals.postponed} valueColor="#d97706" onClick={() => handleStatClick('postponed')} selected={selectedStatus === 'postponed'} />
              <StatCard label="완료율" value={`${data.totals.completion_rate}%`} valueColor={BRAND} />
            </div>
            {selectedStatus !== null && (
              <TaskListPanel
                title={`${FILTER_LABEL[selectedStatus] ?? selectedStatus} ${taskItems.length}건`}
                items={taskItems}
                loading={taskLoading}
                onClose={() => { setSelectedStatus(null); setTaskItems([]) }}
              />
            )}
          </Card>

          <Card title="직원별 연간 실적">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 400 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    {['직원명', '전체', '완료', '완료율', '예상급여'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.employees.length === 0
                    ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 12 }}>데이터 없음</td></tr>
                    : data.employees.map((emp, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500, color: '#111827' }}>{emp.name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280' }}>{emp.total}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{emp.completed}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280' }}>{emp.completion_rate}%</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: BRAND, fontWeight: 600, fontSize: 12 }}>{emp.annual_pay.toLocaleString()}원</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

// ===== Monthly View =====
function MonthlyView({ year, setYear, month, setMonth }: {
  year: number; setYear: Dispatch<SetStateAction<number>>;
  month: number; setMonth: Dispatch<SetStateAction<number>>
}) {
  const [data, setData] = useState<MonthlyStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [taskItems, setTaskItems] = useState<TaskListItem[]>([])
  const [taskLoading, setTaskLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSelectedStatus(null)
    setTaskItems([])
    try {
      const res = await dashboardApi.monthly(year, month)
      setData(res.data)
    } catch (e) {
      setError(parseErr(e))
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { load() }, [load])

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  const handleStatClick = useCallback(async (statusKey: string) => {
    if (selectedStatus === statusKey) {
      setSelectedStatus(null); setTaskItems([]); return
    }
    setSelectedStatus(statusKey)
    setTaskLoading(true)
    try {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`
      const res = await dashboardApi.tasks({ month: monthStr, status: statusKey === 'all' ? undefined : statusKey })
      setTaskItems(res.data)
    } catch {
      setTaskItems([])
    } finally {
      setTaskLoading(false)
    }
  }, [selectedStatus, year, month])

  const chartData = data?.weekly.map(w => ({
    name: `${w.week}주차`,
    완료: w.completed, 대기: w.pending, 미루기: w.postponed,
  })) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={prevMonth} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer' }}><ChevronLeft size={18} /></button>
          <span style={{ fontWeight: 700, fontSize: 17, width: 100, textAlign: 'center' }}>{year}년 {month}월</span>
          <button onClick={nextMonth} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer' }}><ChevronRight size={18} /></button>
        </div>
        <ToolBar onExcel={() => data && exportMonthly(data, year, month)} onRefresh={load} loading={loading} />
      </div>

      {loading && <LoadingSpinner />}
      {!loading && error && <ErrorBox msg={error} onRetry={load} />}

      {!loading && !error && data && (
        <>
          <Card title="주차별 작업 현황">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="완료" fill="#22C55E" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="대기" fill="#9CA3AF" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="미루기" fill="#FBBF24" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
            <ChartLegend />
          </Card>

          <Card title="월간 합계">
            <div style={{ display: 'flex', gap: 8 }}>
              <StatCard label="전체" value={data.totals.total} onClick={() => handleStatClick('all')} selected={selectedStatus === 'all'} />
              <StatCard label="완료" value={data.totals.completed} valueColor="#16a34a" onClick={() => handleStatClick('completed')} selected={selectedStatus === 'completed'} />
              <StatCard label="대기" value={data.totals.pending} valueColor="#6b7280" onClick={() => handleStatClick('pending')} selected={selectedStatus === 'pending'} />
              <StatCard label="미루기" value={data.totals.postponed} valueColor="#d97706" onClick={() => handleStatClick('postponed')} selected={selectedStatus === 'postponed'} />
              <StatCard label="완료율" value={`${data.totals.completion_rate}%`} valueColor={BRAND} />
            </div>
            {selectedStatus !== null && (
              <TaskListPanel
                title={`${FILTER_LABEL[selectedStatus] ?? selectedStatus} ${taskItems.length}건`}
                items={taskItems}
                loading={taskLoading}
                onClose={() => { setSelectedStatus(null); setTaskItems([]) }}
              />
            )}
          </Card>

          <Card title="직원별 월간 실적">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 440 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    {['직원명', '전체', '완료', '미루기', '완료율', '급여'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.employees.length === 0
                    ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 12 }}>데이터 없음</td></tr>
                    : data.employees.map((emp, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500, color: '#111827' }}>{emp.name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280' }}>{emp.total}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{emp.completed}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d97706' }}>{emp.postponed}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280' }}>{emp.completion_rate}%</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: BRAND, fontWeight: 600, fontSize: 12 }}>{emp.monthly_pay.toLocaleString()}원</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="기지국별 작업 현황" extra={`${data.stations.length}건`}>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {data.stations.length === 0
                ? <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '32px 0' }}>데이터 없음</p>
                : data.stations.map((st, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < data.stations.length - 1 ? '1px solid #f9fafb' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.station_name || '-'}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{st.employee_name || '-'}</div>
                    </div>
                    <span style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, ...(STATUS_BADGE[st.status] ?? { background: '#f3f4f6', color: '#6b7280' }) }}>
                      {STATUS_LABEL[st.status] ?? st.status}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 12, color: '#9ca3af', width: 80, textAlign: 'right' }}>{st.completed_at || '-'}</span>
                  </div>
                ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

// ===== Daily View =====
function DailyView({ selectedDate, setSelectedDate }: {
  selectedDate: string; setSelectedDate: Dispatch<SetStateAction<string>>
}) {
  const [data, setData] = useState<DailyStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [taskItems, setTaskItems] = useState<TaskListItem[]>([])
  const [taskLoading, setTaskLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSelectedStatus(null)
    setTaskItems([])
    try {
      const res = await dashboardApi.daily(selectedDate)
      setData(res.data)
    } catch (e) {
      setError(parseErr(e))
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => { load() }, [load])

  const handleStatClick = useCallback(async (statusKey: string) => {
    if (selectedStatus === statusKey) {
      setSelectedStatus(null); setTaskItems([]); return
    }
    setSelectedStatus(statusKey)
    setTaskLoading(true)
    try {
      const res = await dashboardApi.tasks({ date: selectedDate, status: statusKey === 'all' ? undefined : statusKey })
      setTaskItems(res.data)
    } catch {
      setTaskItems([])
    } finally {
      setTaskLoading(false)
    }
  }, [selectedStatus, selectedDate])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setSelectedDate(d => addDays(d, -1))} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer' }}><ChevronLeft size={18} /></button>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ fontWeight: 700, fontSize: 15, border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 12px', textAlign: 'center', outline: 'none' }}
          />
          <button onClick={() => setSelectedDate(d => addDays(d, 1))} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer' }}><ChevronRight size={18} /></button>
        </div>
        <ToolBar onExcel={() => data && exportDaily(data, selectedDate)} onRefresh={load} loading={loading} />
      </div>

      {loading && <LoadingSpinner />}
      {!loading && error && <ErrorBox msg={error} onRetry={load} />}

      {!loading && !error && data && (
        <>
          <Card title="당일 작업 현황">
            <div style={{ display: 'flex', gap: 8 }}>
              <StatCard label="전체" value={data.summary.total} onClick={() => handleStatClick('all')} selected={selectedStatus === 'all'} />
              <StatCard label="완료" value={data.summary.completed} valueColor="#16a34a" onClick={() => handleStatClick('completed')} selected={selectedStatus === 'completed'} />
              <StatCard label="진행중" value={data.summary.in_progress} valueColor="#1d4ed8" onClick={() => handleStatClick('in_progress')} selected={selectedStatus === 'in_progress'} />
              <StatCard label="대기" value={data.summary.pending} valueColor="#6b7280" onClick={() => handleStatClick('pending')} selected={selectedStatus === 'pending'} />
              <StatCard label="미루기" value={data.summary.postponed} valueColor="#d97706" onClick={() => handleStatClick('postponed')} selected={selectedStatus === 'postponed'} />
            </div>
            {selectedStatus !== null && (
              <TaskListPanel
                title={`${FILTER_LABEL[selectedStatus] ?? selectedStatus} ${taskItems.length}건`}
                items={taskItems}
                loading={taskLoading}
                onClose={() => { setSelectedStatus(null); setTaskItems([]) }}
              />
            )}
          </Card>

          {data.employees.length > 0 && (
            <Card title="직원별 당일 실적">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 320 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                      {['직원명', '담당건수', '완료', '미완료'].map((h, i) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.employees.map((emp, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500, color: '#111827' }}>{emp.name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280' }}>{emp.total}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{emp.completed}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#9ca3af' }}>{emp.incomplete}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card title="작업 상세" extra={`${data.tasks.length}건`}>
            {data.tasks.length === 0
              ? <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '32px 0' }}>데이터 없음</p>
              : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                        {['#', '기지국명', '담당직원', '상태', '시작', '완료', '소요'].map((h, i) => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: i === 0 ? 'center' : i <= 2 ? 'left' : 'center', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.tasks.map((task, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                          <td style={{ padding: '9px 10px', textAlign: 'center', color: '#9ca3af' }}>{task.sort_order}</td>
                          <td style={{ padding: '9px 10px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{task.station_name || '-'}</td>
                          <td style={{ padding: '9px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{task.employee_name || '-'}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, ...(STATUS_BADGE[task.status] ?? { background: '#f3f4f6', color: '#6b7280' }) }}>
                              {STATUS_LABEL[task.status] ?? task.status}
                            </span>
                          </td>
                          <td style={{ padding: '9px 10px', textAlign: 'center', color: '#6b7280' }}>{task.started_at || '-'}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'center', color: '#6b7280' }}>{task.completed_at || '-'}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'center', color: '#9ca3af' }}>
                            {task.duration_minutes != null ? `${task.duration_minutes}분` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </Card>
        </>
      )}
    </div>
  )
}

// ===== Summary Cards (top of page) =====
function SummaryCards({ activeTab, year, month, selectedDate }: {
  activeTab: Tab; year: number; month: number; selectedDate: string
}) {
  const [stats, setStats] = useState<SummaryStats | null>(null)
  const [totalStations, setTotalStations] = useState<number | null>(null)

  useEffect(() => {
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    Promise.all([
      employeeApi.list(false),
      dashboardApi.daily(dateStr),
    ]).then(([eRes, dRes]) => {
      const employeeList = Array.isArray(eRes.data) ? eRes.data : (eRes.data.employees ?? [])
      const daily: DailyStats = dRes.data
      setStats({
        totalEmployees: Array.isArray(employeeList) ? employeeList.length : 0,
        todayTotal: daily.summary.total,
        todayCompleted: daily.summary.completed,
        todayIncomplete: daily.summary.pending + daily.summary.postponed + daily.summary.in_progress,
      })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setTotalStations(null)
    const fetchStations = async () => {
      try {
        let tasks: TaskListItem[]
        if (activeTab === 'annual') {
          const res = await dashboardApi.tasks({ year })
          tasks = res.data
        } else if (activeTab === 'monthly') {
          const monthStr = `${year}-${String(month).padStart(2, '0')}`
          const res = await dashboardApi.tasks({ month: monthStr })
          tasks = res.data
        } else {
          const res = await dashboardApi.tasks({ date: selectedDate })
          tasks = res.data
        }
        const names = new Set(tasks.map(t => t.station_name).filter((n): n is string => !!n))
        setTotalStations(names.size)
      } catch {
        setTotalStations(0)
      }
    }
    fetchStations()
  }, [activeTab, year, month, selectedDate])

  const stationLabel = activeTab === 'annual'
    ? `${year}년 기지국`
    : activeTab === 'monthly'
    ? `${month}월 기지국`
    : '당일 기지국'

  const cards = [
    { label: stationLabel, value: totalStations ?? '-', icon: <Building2 size={22} color={BRAND} />, bg: '#eff6ff' },
    { label: '직원 수', value: stats?.totalEmployees ?? '-', icon: <Users size={22} color="#7c3aed" />, bg: '#f5f3ff' },
    { label: '오늘 일정', value: stats?.todayTotal ?? '-', icon: <CalendarCheck size={22} color="#0891b2" />, bg: '#ecfeff' },
    { label: '오늘 완료', value: stats?.todayCompleted ?? '-', icon: <CheckCircle size={22} color="#16a34a" />, bg: '#f0fdf4' },
    { label: '미완료', value: stats?.todayIncomplete ?? '-', icon: <Clock size={22} color="#d97706" />, bg: '#fffbeb' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
      {cards.map((c, i) => (
        <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {c.icon}
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{c.value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== Main =====
const TABS: { id: Tab; label: string }[] = [
  { id: 'annual', label: '연간' },
  { id: 'monthly', label: '월간' },
  { id: 'daily', label: '일별' },
]

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('monthly')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <SummaryCards activeTab={activeTab} year={year} month={month} selectedDate={selectedDate} />

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 4, padding: '12px 16px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '7px 20px',
                borderRadius: 8,
                border: 'none',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: activeTab === tab.id ? BRAND : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#6b7280',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {activeTab === 'annual' && <AnnualView year={year} setYear={setYear} />}
          {activeTab === 'monthly' && <MonthlyView year={year} setYear={setYear} month={month} setMonth={setMonth} />}
          {activeTab === 'daily' && <DailyView selectedDate={selectedDate} setSelectedDate={setSelectedDate} />}
        </div>
      </div>
    </div>
  )
}
