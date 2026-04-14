import { useEffect, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import Header from '../components/common/Header'
import { dashboardApi } from '../services/api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { RefreshCw, Download, Printer, ChevronLeft, ChevronRight, X } from 'lucide-react'

// ===== 타입 =====
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

// ===== 상수 =====
const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
const STATUS_LABEL: Record<string, string> = {
  completed: '완료', in_progress: '진행중', pending: '대기', postponed: '미루기',
}
const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  pending: 'bg-gray-100 text-gray-600',
  postponed: 'bg-amber-100 text-amber-700',
}
const FILTER_LABEL: Record<string, string> = {
  all: '전체 작업',
  completed: '완료된 작업',
  pending: '대기 중인 작업',
  postponed: '미루기된 작업',
  in_progress: '진행중인 작업',
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// ===== Excel 내보내기 =====
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

// ===== 공통 컴포넌트 =====
function StatCard({
  label, value, color, onClick, selected,
}: {
  label: string; value: number | string; color?: string;
  onClick?: () => void; selected?: boolean
}) {
  const base = 'text-center py-2.5 rounded-xl w-full transition-all'
  const interactive = onClick
    ? selected
      ? 'cursor-pointer ring-2 ring-kt-red bg-blue-50 scale-[0.97]'
      : 'cursor-pointer hover:bg-gray-50 active:scale-[0.97]'
    : 'cursor-default'
  return (
    <button onClick={onClick} disabled={!onClick} className={`${base} ${interactive}`}>
      <p className={`text-xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </button>
  )
}

function ToolBar({ onExcel, onRefresh, loading }: { onExcel: () => void; onRefresh: () => void; loading: boolean }) {
  return (
    <div className="flex gap-1.5">
      <button onClick={onExcel} className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-medium">
        <Download size={13} />엑셀
      </button>
      <button onClick={() => window.print()} className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium">
        <Printer size={13} />인쇄
      </button>
      <button onClick={onRefresh} disabled={loading} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50">
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}

function ChartLegend() {
  return (
    <div className="flex gap-4 justify-center mt-1 text-xs text-gray-600">
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" />완료</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-400 inline-block" />대기</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" />미루기</span>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw size={24} className="animate-spin text-gray-300" />
    </div>
  )
}

function ErrorBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
      <p className="text-red-600 text-sm font-medium mb-1">데이터를 불러오지 못했습니다</p>
      <p className="text-red-400 text-xs mb-3 break-all">{msg}</p>
      <button onClick={onRetry} className="px-4 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium">
        다시 시도
      </button>
    </div>
  )
}

// ===== 작업 목록 패널 =====
function TaskListPanel({
  title, items, loading, onClose,
}: {
  title: string; items: TaskListItem[]; loading: boolean; onClose: () => void
}) {
  return (
    <div className="bg-white rounded-2xl border-2 border-kt-red/30 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-kt-red/20">
        <span className="text-sm font-bold text-gray-900">{title}</span>
        <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-700">
          <X size={15} />
        </button>
      </div>

      {/* 내용 */}
      {loading ? (
        <div className="flex justify-center py-10">
          <RefreshCw size={20} className="animate-spin text-gray-300" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-gray-400 text-xs py-10">데이터 없음</p>
      ) : (
        <div className="overflow-auto max-h-72">
          <table className="w-full text-xs min-w-[400px]">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-center py-2 pl-3 pr-1 font-medium w-8">#</th>
                <th className="text-left py-2 px-1 font-medium">기지국명</th>
                <th className="text-left py-2 px-1 font-medium">담당직원</th>
                <th className="text-left py-2 px-1 font-medium">주소</th>
                <th className="text-center py-2 px-1 font-medium whitespace-nowrap">날짜</th>
                <th className="text-center py-2 pl-1 pr-3 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="text-center py-2 pl-3 pr-1 text-gray-400">{i + 1}</td>
                  <td className="py-2 px-1 font-medium text-gray-900 max-w-[90px]">
                    <span className="block truncate">{item.station_name || '-'}</span>
                  </td>
                  <td className="py-2 px-1 text-gray-600 whitespace-nowrap">{item.employee_name || '-'}</td>
                  <td className="py-2 px-1 text-gray-400 max-w-[100px]">
                    <span className="block truncate">{item.address || '-'}</span>
                  </td>
                  <td className="text-center py-2 px-1 text-gray-500 tabular-nums whitespace-nowrap">{item.scheduled_date}</td>
                  <td className="text-center py-2 pl-1 pr-3">
                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[item.status] ?? 'bg-gray-100 text-gray-500'}`}>
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

// ===== 에러 파싱 헬퍼 =====
function parseErr(e: unknown): string {
  return (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ?? (e as { message?: string })?.message
    ?? '알 수 없는 오류'
}

// ===== 연간 뷰 =====
function AnnualView() {
  const [year, setYear] = useState(new Date().getFullYear())
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={18} /></button>
          <span className="font-bold text-lg w-16 text-center">{year}년</span>
          <button onClick={() => setYear(y => y + 1)} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={18} /></button>
        </div>
        <ToolBar onExcel={() => data && exportAnnual(data, year)} onRefresh={load} loading={loading} />
      </div>

      {loading && <Loading />}
      {!loading && error && <ErrorBox msg={error} onRetry={load} />}

      {!loading && !error && data && (
        <>
          {/* 월별 그래프 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-3">월별 작업 현황</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="완료" fill="#22C55E" radius={[3, 3, 0, 0]} maxBarSize={14} />
                <Bar dataKey="대기" fill="#9CA3AF" radius={[3, 3, 0, 0]} maxBarSize={14} />
                <Bar dataKey="미루기" fill="#FBBF24" radius={[3, 3, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
            <ChartLegend />
          </div>

          {/* 연간 합계 — 클릭 가능 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-3">연간 합계</h3>
            <div className="grid grid-cols-5 gap-1">
              <StatCard label="전체" value={data.totals.total}
                onClick={() => handleStatClick('all')} selected={selectedStatus === 'all'} />
              <StatCard label="완료" value={data.totals.completed} color="text-green-600"
                onClick={() => handleStatClick('completed')} selected={selectedStatus === 'completed'} />
              <StatCard label="대기" value={data.totals.pending} color="text-gray-500"
                onClick={() => handleStatClick('pending')} selected={selectedStatus === 'pending'} />
              <StatCard label="미루기" value={data.totals.postponed} color="text-amber-600"
                onClick={() => handleStatClick('postponed')} selected={selectedStatus === 'postponed'} />
              <StatCard label="완료율" value={`${data.totals.completion_rate}%`} color="text-kt-red" />
            </div>

            {/* 클릭 시 목록 패널 */}
            {selectedStatus !== null && (
              <div className="mt-4">
                <TaskListPanel
                  title={`${FILTER_LABEL[selectedStatus] ?? selectedStatus} ${taskItems.length}건`}
                  items={taskItems}
                  loading={taskLoading}
                  onClose={() => { setSelectedStatus(null); setTaskItems([]) }}
                />
              </div>
            )}
          </div>

          {/* 직원별 연간 실적 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-3">직원별 연간 실적</h3>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[320px]">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="text-left py-2 pl-1 pr-2 font-medium">직원명</th>
                    <th className="text-right py-2 px-1 font-medium">전체</th>
                    <th className="text-right py-2 px-1 font-medium">완료</th>
                    <th className="text-right py-2 px-1 font-medium">완료율</th>
                    <th className="text-right py-2 pl-1 pr-1 font-medium">예상급여</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.length === 0
                    ? <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-xs">데이터 없음</td></tr>
                    : data.employees.map((emp, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pl-1 pr-2 font-medium text-gray-900">{emp.name}</td>
                        <td className="text-right py-2 px-1 text-gray-600">{emp.total}</td>
                        <td className="text-right py-2 px-1 text-green-600 font-medium">{emp.completed}</td>
                        <td className="text-right py-2 px-1 text-gray-600">{emp.completion_rate}%</td>
                        <td className="text-right py-2 pl-1 pr-1 text-kt-red font-medium text-xs">{emp.annual_pay.toLocaleString()}원</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ===== 월간 뷰 =====
function MonthlyView() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={18} /></button>
          <span className="font-bold text-lg w-24 text-center">{year}년 {month}월</span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={18} /></button>
        </div>
        <ToolBar onExcel={() => data && exportMonthly(data, year, month)} onRefresh={load} loading={loading} />
      </div>

      {loading && <Loading />}
      {!loading && error && <ErrorBox msg={error} onRetry={load} />}

      {!loading && !error && data && (
        <>
          {/* 주차별 그래프 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-3">주차별 작업 현황</h3>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="완료" fill="#22C55E" radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="대기" fill="#9CA3AF" radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="미루기" fill="#FBBF24" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
            <ChartLegend />
          </div>

          {/* 월간 합계 — 클릭 가능 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-3">월간 합계</h3>
            <div className="grid grid-cols-5 gap-1">
              <StatCard label="전체" value={data.totals.total}
                onClick={() => handleStatClick('all')} selected={selectedStatus === 'all'} />
              <StatCard label="완료" value={data.totals.completed} color="text-green-600"
                onClick={() => handleStatClick('completed')} selected={selectedStatus === 'completed'} />
              <StatCard label="대기" value={data.totals.pending} color="text-gray-500"
                onClick={() => handleStatClick('pending')} selected={selectedStatus === 'pending'} />
              <StatCard label="미루기" value={data.totals.postponed} color="text-amber-600"
                onClick={() => handleStatClick('postponed')} selected={selectedStatus === 'postponed'} />
              <StatCard label="완료율" value={`${data.totals.completion_rate}%`} color="text-kt-red" />
            </div>

            {selectedStatus !== null && (
              <div className="mt-4">
                <TaskListPanel
                  title={`${FILTER_LABEL[selectedStatus] ?? selectedStatus} ${taskItems.length}건`}
                  items={taskItems}
                  loading={taskLoading}
                  onClose={() => { setSelectedStatus(null); setTaskItems([]) }}
                />
              </div>
            )}
          </div>

          {/* 직원별 월간 실적 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-3">직원별 월간 실적</h3>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[360px]">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="text-left py-2 pl-1 pr-2 font-medium">직원명</th>
                    <th className="text-right py-2 px-1 font-medium">전체</th>
                    <th className="text-right py-2 px-1 font-medium">완료</th>
                    <th className="text-right py-2 px-1 font-medium">미루기</th>
                    <th className="text-right py-2 px-1 font-medium">완료율</th>
                    <th className="text-right py-2 pl-1 pr-1 font-medium">급여</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.length === 0
                    ? <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-xs">데이터 없음</td></tr>
                    : data.employees.map((emp, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pl-1 pr-2 font-medium text-gray-900">{emp.name}</td>
                        <td className="text-right py-2 px-1 text-gray-600">{emp.total}</td>
                        <td className="text-right py-2 px-1 text-green-600 font-medium">{emp.completed}</td>
                        <td className="text-right py-2 px-1 text-amber-600">{emp.postponed}</td>
                        <td className="text-right py-2 px-1 text-gray-600">{emp.completion_rate}%</td>
                        <td className="text-right py-2 pl-1 pr-1 text-kt-red font-medium text-xs">{emp.monthly_pay.toLocaleString()}원</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 기지국별 작업 현황 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900">기지국별 작업 현황</h3>
              <span className="text-xs text-gray-400">{data.stations.length}건</span>
            </div>
            <div className="space-y-0 max-h-72 overflow-y-auto">
              {data.stations.length === 0
                ? <p className="text-center text-gray-400 text-xs py-8">데이터 없음</p>
                : data.stations.map((st, i) => (
                  <div key={i} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{st.station_name || '-'}</p>
                      <p className="text-xs text-gray-500">{st.employee_name || '-'}</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[st.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[st.status] ?? st.status}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400 w-[72px] text-right tabular-nums">
                      {st.completed_at || '-'}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ===== 일별 뷰 =====
function DailyView() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => setSelectedDate(d => addDays(d, -1))} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={18} /></button>
          <input
            type="date" value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="font-bold text-base border border-gray-200 rounded-lg px-2 py-1 text-center"
          />
          <button onClick={() => setSelectedDate(d => addDays(d, 1))} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={18} /></button>
        </div>
        <ToolBar onExcel={() => data && exportDaily(data, selectedDate)} onRefresh={load} loading={loading} />
      </div>

      {loading && <Loading />}
      {!loading && error && <ErrorBox msg={error} onRetry={load} />}

      {!loading && !error && data && (
        <>
          {/* 당일 작업 현황 — 클릭 가능 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-3">당일 작업 현황</h3>
            <div className="grid grid-cols-5 gap-1">
              <StatCard label="전체" value={data.summary.total}
                onClick={() => handleStatClick('all')} selected={selectedStatus === 'all'} />
              <StatCard label="완료" value={data.summary.completed} color="text-green-600"
                onClick={() => handleStatClick('completed')} selected={selectedStatus === 'completed'} />
              <StatCard label="진행중" value={data.summary.in_progress} color="text-blue-600"
                onClick={() => handleStatClick('in_progress')} selected={selectedStatus === 'in_progress'} />
              <StatCard label="대기" value={data.summary.pending} color="text-gray-500"
                onClick={() => handleStatClick('pending')} selected={selectedStatus === 'pending'} />
              <StatCard label="미루기" value={data.summary.postponed} color="text-amber-600"
                onClick={() => handleStatClick('postponed')} selected={selectedStatus === 'postponed'} />
            </div>

            {selectedStatus !== null && (
              <div className="mt-4">
                <TaskListPanel
                  title={`${FILTER_LABEL[selectedStatus] ?? selectedStatus} ${taskItems.length}건`}
                  items={taskItems}
                  loading={taskLoading}
                  onClose={() => { setSelectedStatus(null); setTaskItems([]) }}
                />
              </div>
            )}
          </div>

          {/* 직원별 당일 실적 */}
          {data.employees.length > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-3">직원별 당일 실적</h3>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[280px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500">
                      <th className="text-left py-2 pl-1 pr-2 font-medium">직원명</th>
                      <th className="text-right py-2 px-2 font-medium">담당건수</th>
                      <th className="text-right py-2 px-2 font-medium">완료</th>
                      <th className="text-right py-2 pl-2 pr-1 font-medium">미완료</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.employees.map((emp, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pl-1 pr-2 font-medium text-gray-900">{emp.name}</td>
                        <td className="text-right py-2 px-2 text-gray-600">{emp.total}</td>
                        <td className="text-right py-2 px-2 text-green-600 font-medium">{emp.completed}</td>
                        <td className="text-right py-2 pl-2 pr-1 text-gray-400">{emp.incomplete}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 당일 작업 상세 리스트 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900">작업 상세</h3>
              <span className="text-xs text-gray-400">{data.tasks.length}건</span>
            </div>
            {data.tasks.length === 0
              ? <p className="text-center text-gray-400 text-xs py-8">데이터 없음</p>
              : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs min-w-[480px]">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-500">
                        <th className="text-center py-2 w-7 font-medium pl-1">#</th>
                        <th className="text-left py-2 px-1 font-medium">기지국명</th>
                        <th className="text-left py-2 px-1 font-medium">담당직원</th>
                        <th className="text-center py-2 px-1 font-medium">상태</th>
                        <th className="text-right py-2 px-1 font-medium">시작</th>
                        <th className="text-right py-2 px-1 font-medium">완료</th>
                        <th className="text-right py-2 pl-1 pr-1 font-medium">소요</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tasks.map((task, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0">
                          <td className="text-center py-2 text-gray-400 pl-1">{task.sort_order}</td>
                          <td className="py-2 px-1 max-w-[100px]">
                            <span className="block truncate text-gray-900 font-medium">{task.station_name || '-'}</span>
                          </td>
                          <td className="py-2 px-1 text-gray-600 whitespace-nowrap">{task.employee_name || '-'}</td>
                          <td className="text-center py-2 px-1">
                            <span className={`px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[task.status] ?? 'bg-gray-100 text-gray-500'}`}>
                              {STATUS_LABEL[task.status] ?? task.status}
                            </span>
                          </td>
                          <td className="text-right py-2 px-1 text-gray-500 tabular-nums">{task.started_at || '-'}</td>
                          <td className="text-right py-2 px-1 text-gray-500 tabular-nums">{task.completed_at || '-'}</td>
                          <td className="text-right py-2 pl-1 pr-1 text-gray-400 tabular-nums">
                            {task.duration_minutes != null ? `${task.duration_minutes}분` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </>
      )}
    </div>
  )
}

// ===== 메인 컴포넌트 =====
type Tab = 'annual' | 'monthly' | 'daily'
const TABS: { id: Tab; label: string }[] = [
  { id: 'annual', label: '연간' },
  { id: 'monthly', label: '월간' },
  { id: 'daily', label: '일별' },
]

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('monthly')

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header title="관리자 대시보드" />
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* 탭 바 */}
        <div className="bg-white rounded-2xl p-1 border border-gray-100 flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id ? 'bg-kt-red text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'annual' && <AnnualView />}
        {activeTab === 'monthly' && <MonthlyView />}
        {activeTab === 'daily' && <DailyView />}
      </div>
    </div>
  )
}
