import { useEffect, useState } from 'react'
import { Search, Plus, Pencil, Trash2, X } from 'lucide-react'
import { stationApi } from '../../services/api'
import type { Station, CoolingInfo } from '../../types'

const BRAND = '#215288'

function getCoolingCount(coolingInfo: unknown): number {
  if (!coolingInfo) return 0
  try {
    const arr = typeof coolingInfo === 'string' ? JSON.parse(coolingInfo) : coolingInfo
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}

function parseWorkHistory(record: unknown): Record<string, string> {
  if (!record) return {}
  if (typeof record === 'string') {
    try {
      return JSON.parse(record)
    } catch {
      return {}
    }
  }
  if (typeof record === 'object') {
    return record as Record<string, string>
  }
  return {}
}

interface StationForm {
  station_name: string
  station_id: string
  network_group: string
  equipment_type: string
  operation_count: string
  address: string
  manager: string
  contact: string
  cooling_info: CoolingInfo[]
  work_history: Record<string, string>
  inspection_date: string
}

const EMPTY_ADD_FORM: StationForm = {
  station_name: '',
  station_id: '',
  network_group: '',
  equipment_type: '',
  operation_count: '',
  address: '',
  manager: '',
  contact: '',
  cooling_info: [],
  work_history: {},
  inspection_date: '',
}

export default function Stations() {
  const [stations, setStations] = useState<Station[]>([])
  const [filtered, setFiltered] = useState<Station[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<Station | null>(null)
  const [form, setForm] = useState<StationForm>(EMPTY_ADD_FORM)
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

  const openAdd = () => { setForm(EMPTY_ADD_FORM); setEditTarget(null); setModal('add') }
  const openEdit = (s: Station) => {
    const coolingArr = Array.isArray(s.cooling_info) ? s.cooling_info : []
    const workHist = parseWorkHistory(s.work_history)
    setForm({
      station_name: s.station_name,
      station_id: s.station_id ?? '',
      network_group: s.network_group ?? '',
      equipment_type: s.equipment_type ?? '',
      operation_count: s.operation_count?.toString() ?? '',
      address: s.address ?? '',
      manager: s.manager ?? '',
      contact: s.contact ?? '',
      cooling_info: coolingArr,
      work_history: workHist,
      inspection_date: s.inspection_date ?? '',
    })
    setEditTarget(s)
    setModal('edit')
  }
  const closeModal = () => { setModal(null); setEditTarget(null); setForm(EMPTY_ADD_FORM) }

  const handleSave = async () => {
    if (!form.station_name.trim()) return
    setSaving(true)
    try {
      if (modal === 'add') {
        // Add는 아직 backend에서 지원하지 않는 경우가 많음 - placeholder 유지
        setError('현재 등록 기능은 엑셀 업로드를 통해서만 가능합니다.')
        setSaving(false)
        return
      }
      if (modal === 'edit' && editTarget) {
        const payload: Record<string, unknown> = {
          station_name: form.station_name,
          station_id: form.station_id || null,
          network_group: form.network_group || null,
          equipment_type: form.equipment_type || null,
          operation_count: form.operation_count ? Number(form.operation_count) : null,
          address: form.address || null,
          manager: form.manager || null,
          contact: form.contact || null,
          cooling_info: form.cooling_info.length > 0 ? form.cooling_info : null,
          work_history: Object.keys(form.work_history).length > 0 ? form.work_history : null,
          inspection_date: form.inspection_date || null,
        }
        await stationApi.update(editTarget.id, payload)
        await load()
        closeModal()
      }
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

  const coolingCount = (s: Station) => getCoolingCount(s.cooling_info)

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

      {/* Add Modal */}
      {modal === 'add' && (
        <Modal title="기지국 등록" onClose={closeModal}>
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

      {/* Edit Modal */}
      {modal === 'edit' && editTarget && (
        <LargeModal title="기지국 수정" onClose={closeModal}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* 기본 정보 */}
            <Section title="기본 정보">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="기지국명 *">
                  <input value={form.station_name} onChange={e => setForm({ ...form, station_name: e.target.value })} style={inputStyle} placeholder="기지국명" />
                </FormField>
                <FormField label="기지국 ID">
                  <input value={form.station_id} onChange={e => setForm({ ...form, station_id: e.target.value })} style={inputStyle} placeholder="기지국 ID" />
                </FormField>
                <FormField label="네트워크권">
                  <input value={form.network_group} onChange={e => setForm({ ...form, network_group: e.target.value })} style={inputStyle} placeholder="네트워크권" />
                </FormField>
                <FormField label="장비유형">
                  <input value={form.equipment_type} onChange={e => setForm({ ...form, equipment_type: e.target.value })} style={inputStyle} placeholder="장비유형" />
                </FormField>
                <FormField label="운용수량">
                  <input value={form.operation_count} onChange={e => setForm({ ...form, operation_count: e.target.value })} style={inputStyle} placeholder="운용수량" type="number" />
                </FormField>
              </div>
              <FormField label="주소">
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={inputStyle} placeholder="주소" />
              </FormField>
            </Section>

            {/* 담당 정보 */}
            <Section title="담당 정보">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="담당자">
                  <input value={form.manager} onChange={e => setForm({ ...form, manager: e.target.value })} style={inputStyle} placeholder="담당자명" />
                </FormField>
                <FormField label="연락처">
                  <input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} style={inputStyle} placeholder="010-0000-0000" />
                </FormField>
              </div>
            </Section>

            {/* 냉방기 정보 */}
            <Section title="냉방기 정보">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {form.cooling_info.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#9ca3af' }}>냉방기 정보가 없습니다.</p>
                ) : (
                  form.cooling_info.map((c, i) => (
                    <div key={i} style={{ background: '#f9fafb', padding: 12, borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>용량</label>
                        <input value={c.capacity ?? ''} onChange={e => {
                          const arr = [...form.cooling_info]; arr[i].capacity = e.target.value; setForm({ ...form, cooling_info: arr })
                        }} style={inputStyle} placeholder="용량" />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>제조사</label>
                        <input value={c.manufacturer ?? ''} onChange={e => {
                          const arr = [...form.cooling_info]; arr[i].manufacturer = e.target.value; setForm({ ...form, cooling_info: arr })
                        }} style={inputStyle} placeholder="제조사" />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>취득일</label>
                        <input value={c.acquired ?? ''} onChange={e => {
                          const arr = [...form.cooling_info]; arr[i].acquired = e.target.value; setForm({ ...form, cooling_info: arr })
                        }} style={inputStyle} placeholder="YYYY-MM-DD" />
                      </div>
                      <button onClick={() => {
                        const arr = form.cooling_info.filter((_, idx) => idx !== i)
                        setForm({ ...form, cooling_info: arr })
                      }} style={{ padding: '6px 10px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        삭제
                      </button>
                    </div>
                  ))
                )}
                <button
                  onClick={() => setForm({ ...form, cooling_info: [...form.cooling_info, { capacity: null, manufacturer: null, acquired: null }] })}
                  style={{ padding: '8px 12px', background: '#eff6ff', color: BRAND, border: `1px solid ${BRAND}`, borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  + 냉방기 추가
                </button>
              </div>
            </Section>

            {/* 작업 이력 */}
            <Section title="작업 이력">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.keys(form.work_history).length === 0 ? (
                  <p style={{ fontSize: 13, color: '#9ca3af' }}>작업 이력이 없습니다.</p>
                ) : (
                  Object.entries(form.work_history).map(([year, content]) => (
                    <div key={year} style={{ background: '#f9fafb', padding: 12, borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 60 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>연도</label>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginTop: 6 }}>{year}년</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>작업내용</label>
                        <textarea value={content ?? ''} onChange={e => {
                          setForm({ ...form, work_history: { ...form.work_history, [year]: e.target.value } })
                        }} style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} placeholder="작업내용" />
                      </div>
                      <button onClick={() => {
                        const hist = { ...form.work_history }
                        delete hist[year]
                        setForm({ ...form, work_history: hist })
                      }} style={{ padding: '6px 10px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, marginTop: 26 }}>
                        삭제
                      </button>
                    </div>
                  ))
                )}
                <button
                  onClick={() => {
                    const year = new Date().getFullYear().toString()
                    if (!form.work_history[year]) {
                      setForm({ ...form, work_history: { ...form.work_history, [year]: '' } })
                    }
                  }}
                  style={{ padding: '8px 12px', background: '#eff6ff', color: BRAND, border: `1px solid ${BRAND}`, borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, alignSelf: 'flex-start' }}
                >
                  + 연도 추가
                </button>
              </div>
            </Section>

            {/* 점검 정보 */}
            <Section title="점검 정보">
              <FormField label="점검일자">
                <input value={form.inspection_date} onChange={e => setForm({ ...form, inspection_date: e.target.value })} style={inputStyle} type="date" />
              </FormField>
            </Section>

            {/* 버튼 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={closeModal} style={cancelBtnStyle}>취소</button>
              <button onClick={handleSave} disabled={saving || !form.station_name.trim()} style={saveBtnStyle(saving || !form.station_name.trim())}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </LargeModal>
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

function LargeModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 860, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, position: 'sticky', top: 0, background: '#fff', paddingBottom: 16 }}>
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
    <div style={{ marginBottom: 0 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
      <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#111827' }}>{title}</h4>
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
