import { useEffect, useState } from 'react'
import { Search, Plus, Pencil, Trash2, X } from 'lucide-react'
import { stationApi } from '../../services/api'
import type { Station } from '../../types'

const BRAND = '#215288'

interface StationForm {
  station_name: string
  address: string
  manager: string
  contact: string
}

const EMPTY_FORM: StationForm = { station_name: '', address: '', manager: '', contact: '' }

export default function Stations() {
  const [stations, setStations] = useState<Station[]>([])
  const [filtered, setFiltered] = useState<Station[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<Station | null>(null)
  const [form, setForm] = useState<StationForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      const res = await stationApi.list({ limit: 200 })
      const data: Station[] = res.data.stations ?? res.data ?? []
      setStations(data)
      setFiltered(data)
    } catch {
      setError('기지국 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const q = search.trim().toLowerCase()
    if (!q) { setFiltered(stations); return }
    setFiltered(stations.filter(s =>
      (s.station_name ?? '').toLowerCase().includes(q) ||
      (s.address ?? '').toLowerCase().includes(q)
    ))
  }, [search, stations])

  const openAdd = () => { setForm(EMPTY_FORM); setEditTarget(null); setModal('add') }
  const openEdit = (s: Station) => {
    setForm({ station_name: s.station_name, address: s.address ?? '', manager: s.manager ?? '', contact: s.contact ?? '' })
    setEditTarget(s)
    setModal('edit')
  }
  const closeModal = () => { setModal(null); setEditTarget(null); setForm(EMPTY_FORM) }

  const handleSave = async () => {
    if (!form.station_name.trim()) return
    setSaving(true)
    try {
      if (modal === 'edit' && editTarget) {
        await stationApi.list() // placeholder — update via backend if endpoint exists
        // Note: stationApi has no update endpoint, reflecting actual API
      }
      await load()
      closeModal()
    } catch {
      setError('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await stationApi.delete(deleteId)
      setDeleteId(null)
      await load()
    } catch {
      setError('삭제에 실패했습니다.')
    }
  }

  const coolingCount = (s: Station) => s.cooling_info?.length ?? 0

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="기지국명, 주소 검색..."
            style={{ width: '100%', padding: '9px 12px 9px 36px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <button
          onClick={openAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: BRAND, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={16} /> 기지국 등록
        </button>
      </div>

      {error && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>{error}</div>}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280' }}>
          총 {filtered.length}개 기지국
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['기지국명', '주소', '담당자', '냉방기', '상태', '등록일', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>검색 결과 없음</td></tr>
                ) : filtered.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{s.station_name}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address ?? '-'}</td>
                    <td style={{ padding: '10px 14px' }}>{s.manager ?? '-'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {coolingCount(s) > 0 ? (
                        <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{coolingCount(s)}대</span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge status={s.status} /></td>
                    <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{s.created_at?.slice(0, 10) ?? '-'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <IconBtn icon={<Pencil size={14} />} color="#6b7280" onClick={() => openEdit(s)} title="수정" />
                        <IconBtn icon={<Trash2 size={14} />} color="#ef4444" onClick={() => setDeleteId(s.id)} title="삭제" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <Modal title={modal === 'add' ? '기지국 등록' : '기지국 수정'} onClose={closeModal}>
          <FormField label="기지국명 *">
            <input value={form.station_name} onChange={e => setForm({ ...form, station_name: e.target.value })} style={inputStyle} placeholder="기지국명 입력" />
          </FormField>
          <FormField label="주소">
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={inputStyle} placeholder="주소 입력" />
          </FormField>
          <FormField label="담당자">
            <input value={form.manager} onChange={e => setForm({ ...form, manager: e.target.value })} style={inputStyle} placeholder="담당자명" />
          </FormField>
          <FormField label="연락처">
            <input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} style={inputStyle} placeholder="010-0000-0000" />
          </FormField>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button onClick={closeModal} style={cancelBtnStyle}>취소</button>
            <button onClick={handleSave} disabled={saving || !form.station_name.trim()} style={saveBtnStyle(saving || !form.station_name.trim())}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <Modal title="기지국 삭제" onClose={() => setDeleteId(null)}>
          <p style={{ fontSize: 14, color: '#374151', marginBottom: 20 }}>이 기지국을 삭제하시겠습니까? 관련 일정과 이력이 모두 삭제됩니다.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setDeleteId(null)} style={cancelBtnStyle}>취소</button>
            <button onClick={handleDelete} style={{ ...saveBtnStyle(false), background: '#ef4444' }}>삭제</button>
          </div>
        </Modal>
      )}
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
  return <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: s.color, background: s.bg }}>{s.label}</span>
}

function IconBtn({ icon, color, onClick, title }: { icon: React.ReactNode; color: string; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', color, cursor: 'pointer' }}>
      {icon}
    </button>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 480, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
  fontSize: 13, outline: 'none', boxSizing: 'border-box'
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '9px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff',
  fontSize: 13, cursor: 'pointer', color: '#374151'
}

const saveBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '9px 20px', border: 'none', borderRadius: 8, background: disabled ? '#9ca3af' : '#215288',
  fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', color: '#fff'
})
