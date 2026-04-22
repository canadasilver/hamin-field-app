import { useEffect, useState } from 'react'
import { Building2, Users, CalendarDays, ClipboardList, Wind } from 'lucide-react'
import { dashboardApi, stationApi, employeeApi } from '../../services/api'
import type { DashboardSummary, Station } from '../../types'

interface StatCard {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
}

const BRAND = '#215288'

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [stationCount, setStationCount] = useState(0)
  const [employeeCount, setEmployeeCount] = useState(0)
  const [recentStations, setRecentStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [summaryRes, stationsRes, employeesRes] = await Promise.all([
          dashboardApi.summary(),
          stationApi.list({ limit: 5 }),
          employeeApi.list(false),
        ])
        setSummary(summaryRes.data)
        setStationCount(summaryRes.data.stations?.stations_total ?? 0)
        setRecentStations(stationsRes.data.stations ?? stationsRes.data ?? [])
        setEmployeeCount(employeesRes.data.length ?? 0)
      } catch {
        setError('데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMsg msg={error} />

  const cards: StatCard[] = [
    { label: '전체 기지국', value: stationCount, icon: <Building2 size={20} />, color: BRAND },
    { label: '직원 수', value: employeeCount, icon: <Users size={20} />, color: '#0891b2' },
    { label: '오늘 일정', value: summary?.today_total ?? 0, icon: <CalendarDays size={20} />, color: '#7c3aed' },
    { label: '이번달 완료', value: summary?.tasks.completed ?? 0, icon: <ClipboardList size={20} />, color: '#059669' },
    { label: '미완료 작업', value: (summary?.tasks.pending ?? 0) + (summary?.tasks.in_progress ?? 0), icon: <Wind size={20} />, color: '#dc2626' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>전체 현황</h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{summary?.month ?? ''} 기준</p>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        {cards.map(card => (
          <div key={card.label} style={{
            background: '#fff', borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 16
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: `${card.color}18`, color: card.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              {card.icon}
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{card.value}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Today Summary */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          <SectionCard title="오늘 작업 현황">
            <StatusRow label="대기" value={summary.today_tasks.pending} color="#f59e0b" />
            <StatusRow label="진행중" value={summary.today_tasks.in_progress} color="#3b82f6" />
            <StatusRow label="완료" value={summary.today_tasks.completed} color="#10b981" />
            <StatusRow label="미루기" value={summary.today_tasks.postponed} color="#ef4444" />
          </SectionCard>

          <SectionCard title="이번달 기지국 현황">
            <StatusRow label="미배분" value={summary.stations.pending} color="#6b7280" />
            <StatusRow label="배분완료" value={summary.stations.assigned} color="#3b82f6" />
            <StatusRow label="작업완료" value={summary.stations.completed} color="#10b981" />
            <div style={{ marginTop: 12, padding: '8px 0', borderTop: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>완료율 </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: BRAND }}>{summary.completion_rate.toFixed(1)}%</span>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Recent Stations */}
      <SectionCard title="최근 등록 기지국">
        {recentStations.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 14 }}>등록된 기지국이 없습니다.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f3f4f6' }}>
                {['기지국명', '주소', '상태', '등록일'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentStations.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{s.station_name}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>{s.address ?? '-'}</td>
                  <td style={{ padding: '10px 12px' }}><StatusBadge status={s.status} /></td>
                  <td style={{ padding: '10px 12px', color: '#9ca3af' }}>{s.created_at?.slice(0, 10) ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 16px' }}>{title}</h3>
      {children}
    </div>
  )
}

function StatusRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
      <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: '대기', color: '#92400e', bg: '#fef3c7' },
    assigned: { label: '배분완료', color: '#1e40af', bg: '#dbeafe' },
    completed: { label: '완료', color: '#065f46', bg: '#d1fae5' },
  }
  const s = map[status] ?? { label: status, color: '#374151', bg: '#f3f4f6' }
  return (
    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: s.color, background: s.bg }}>
      {s.label}
    </span>
  )
}

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#215288', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return <div style={{ padding: 20, background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 14 }}>{msg}</div>
}
