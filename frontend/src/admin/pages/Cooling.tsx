import { useEffect, useState } from 'react'
import { Search, Pencil, Plus, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react'
import { stationApi, coolingUnitApi } from '../../services/api'
import type { Station, CoolingUnit, CoolingInfo } from '../../types'

const BRAND = '#215288'

interface CoolingForm {
  unit_number: number
  capacity: string
  manufacturer: string
  acquisition_date: string
}

const EMPTY_FORM: CoolingForm = { unit_number: 1, capacity: '', manufacturer: '', acquisition_date: '' }

// cooling_info는 런타임에 문자열로 올 수 있어 unknown으로 받아 안전하게 파싱
function parseCoolingInfo(raw: unknown): CoolingInfo[] {
  if (!raw) return []
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? (arr as CoolingInfo[]) : []
  } catch {
    return []
  }
}

// work_history JSON 또는 work_20xx 개별 컬럼에서 연도별 이력 추출
function parseWorkHistory(s: Station): Array<[string, string]> {
  const fromJson =
    s.work_history && Object.keys(s.work_history).length > 0
      ? Object.entries(s.work_history)
      : [
          ['2021', s.work_2021],
          ['2022', s.work_2022],
          ['2023', s.work_2023],
          ['2024', s.work_2024],
          ['2025', s.work_2025],
        ]
  return (fromJson as Array<[string, string | null]>)
    .filter((e): e is [string, string] => Boolean(e[1]))
    .sort(([a], [b]) => a.localeCompare(b))
}

export default function Cooling() {
  const [stations, setStations] = useState<Station[]>([])
  const [filtered, setFiltered] = useState<Station[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [units, setUnits] = useState<Record<string, CoolingUnit[]>>({})
  const [unitsLoading, setUnitsLoading] = useState<Record<string, boolean>>({})
  const [modal, setModal] = useState<{ stationId: string; unit?: CoolingUnit } | null>(null)
  const [form, setForm] = useState<CoolingForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ stationId: string; unitId: string } | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      const res = await stationApi.list({ limit: 500 })
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

  const toggleExpand = async (stationId: string) => {
    const willOpen = !expandedIds.has(stationId)
    setExpandedIds(prev => {
      const next = new Set(prev)
      willOpen ? next.add(stationId) : next.delete(stationId)
      return next
    })
    if (willOpen && units[stationId] === undefined) {
      setUnitsLoading(prev => ({ ...prev, [stationId]: true }))
      try {
        const res = await coolingUnitApi.list(stationId)
        setUnits(prev => ({ ...prev, [stationId]: res.data ?? [] }))
      } catch {
        setUnits(prev => ({ ...prev, [stationId]: [] }))
      } finally {
        setUnitsLoading(prev => ({ ...prev, [stationId]: false }))
      }
    }
  }

  const openAdd = (stationId: string) => {
    setForm({ ...EMPTY_FORM, unit_number: (units[stationId] ?? []).length + 1 })
    setModal({ stationId })
  }

  const openEdit = (stationId: string, unit: CoolingUnit) => {
    setForm({ unit_number: unit.unit_number, capacity: unit.capacity ?? '', manufacturer: unit.manufacturer ?? '', acquisition_date: unit.acquisition_date ?? '' })
    setModal({ stationId, unit })
  }

  const handleSave = async () => {
    if (!modal) return
    setSaving(true)
    try {
      if (modal.unit) await coolingUnitApi.update(modal.unit.id, form)
      else await coolingUnitApi.create({ station_id: modal.stationId, ...form })
      const res = await coolingUnitApi.list(modal.stationId)
      setUnits(prev => ({ ...prev, [modal.stationId]: res.data ?? [] }))
      setModal(null)
    } catch {
      setError('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await coolingUnitApi.remove(deleteTarget.unitId)
      const res = await coolingUnitApi.list(deleteTarget.stationId)
      setUnits(prev => ({ ...prev, [deleteTarget.stationId]: res.data ?? [] }))
      setDeleteTarget(null)
    } catch {
      setError('삭제에 실패했습니다.')
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ position: 'relative', maxWidth: 360 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="기지국명, 주소 검색..."
            style={{ width: '100%', padding: '9px 12px 9px 36px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {error && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>{error}</div>}

      <div style={{ marginBottom: 12, fontSize: 13, color: '#6b7280' }}>총 {filtered.length}개 기지국</div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', color: '#9ca3af' }}>검색 결과 없음</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(s => {
            const isOpen = expandedIds.has(s.id)
            const coolingList = parseCoolingInfo(s.cooling_info)
            const stationUnits = units[s.id] ?? []
            const isUnitsLoading = unitsLoading[s.id] ?? false
            const workHistory = parseWorkHistory(s)

            return (
              <div key={s.id} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                {/* 기지국 행 */}
                <div
                  onClick={() => toggleExpand(s.id)}
                  style={{
                    padding: '14px 20px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none',
                    background: isOpen ? '#f9fafb' : '#fff', transition: 'background 0.15s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{s.station_name}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.address ?? '-'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 12 }}>
                    {coolingList.length > 0 ? (
                      <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                        냉방기 {coolingList.length}대
                      </span>
                    ) : (
                      <span style={{ color: '#d1d5db', fontSize: 12 }}>냉방기 없음</span>
                    )}
                    {s.inspection_result && (
                      <span style={{
                        borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                        color: s.inspection_result === '양호' ? '#065f46' : '#7c2d12',
                        background: s.inspection_result === '양호' ? '#d1fae5' : '#fee2e2',
                      }}>
                        {s.inspection_result}
                      </span>
                    )}
                    {isOpen ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                  </div>
                </div>

                {/* 아코디언 상세 */}
                {isOpen && (
                  <div style={{ borderTop: `2px solid ${BRAND}20`, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

                    {/* ── 1. 기본 정보 + 담당 정보 (2단) ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <DetailSection title="기본 정보">
                        <InfoRow label="고유번호" value={s.unique_no} />
                        <InfoRow label="기지국 ID" value={s.station_id} />
                        <InfoRow label="네트워크군" value={s.network_group} />
                        <InfoRow label="장비유형" value={s.equipment_type} />
                        <InfoRow label="실내외" value={s.indoor_outdoor} />
                        <InfoRow label="운용수량" value={s.operation_count?.toString()} />
                        <InfoRow label="바코드" value={s.barcode} />
                        <InfoRow label="주소" value={s.address} />
                        <InfoRow label="건물명" value={s.building_name} />
                      </DetailSection>

                      <DetailSection title="담당 정보">
                        <InfoRow label="운용팀" value={s.operation_team} />
                        <InfoRow label="점검자" value={s.inspector} />
                        <InfoRow label="담당자" value={s.manager} />
                        <InfoRow label="연락처" value={s.contact} />
                      </DetailSection>
                    </div>

                    {/* ── 2. 냉방기 정보 (stations.cooling_info JSON) ── */}
                    <DetailSection title="냉방기 정보">
                      {coolingList.length === 0 ? (
                        <EmptyMsg>등록된 냉방기 정보가 없습니다.</EmptyMsg>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: '#eff6ff' }}>
                                {['번호', '용량', '제조사/모델', '취득일'].map(h => (
                                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#374151', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {coolingList.map((ci, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                  <td style={{ padding: '9px 12px', fontWeight: 600, color: BRAND }}>#{i + 1}</td>
                                  <td style={{ padding: '9px 12px' }}>{ci.capacity ?? '-'}</td>
                                  <td style={{ padding: '9px 12px' }}>{ci.manufacturer ?? '-'}</td>
                                  <td style={{ padding: '9px 12px', color: '#9ca3af' }}>{ci.acquired ?? '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </DetailSection>

                    {/* ── 3. 냉방기 이력 (cooling_units 테이블) ── */}
                    <DetailSection
                      title="냉방기 이력"
                      action={
                        <button
                          onClick={e => { e.stopPropagation(); openAdd(s.id) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '5px 12px', border: `1px solid ${BRAND}`, borderRadius: 6, background: '#fff', color: BRAND, cursor: 'pointer', fontWeight: 600 }}
                        >
                          <Plus size={13} /> 추가
                        </button>
                      }
                    >
                      {isUnitsLoading ? (
                        <div style={{ padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>로딩 중...</div>
                      ) : stationUnits.length === 0 ? (
                        <EmptyMsg>등록된 이력이 없습니다.</EmptyMsg>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: '#f9fafb' }}>
                                {['번호', '용량', '제조사', '취득일', ''].map(h => (
                                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {stationUnits.map(u => (
                                <tr key={u.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>#{u.unit_number}</td>
                                  <td style={{ padding: '8px 12px' }}>{u.capacity ?? '-'}</td>
                                  <td style={{ padding: '8px 12px' }}>{u.manufacturer ?? '-'}</td>
                                  <td style={{ padding: '8px 12px', color: '#9ca3af' }}>{u.acquisition_date ?? '-'}</td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <IconBtn onClick={e => { e.stopPropagation(); openEdit(s.id, u) }} color="#6b7280"><Pencil size={12} /></IconBtn>
                                      <IconBtn onClick={e => { e.stopPropagation(); setDeleteTarget({ stationId: s.id, unitId: u.id }) }} color="#ef4444"><Trash2 size={12} /></IconBtn>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </DetailSection>

                    {/* ── 4. 작업 이력 ── */}
                    <DetailSection title="작업 이력">
                      {workHistory.length === 0 && !s.defect && !s.planned_process ? (
                        <EmptyMsg>등록된 작업 이력이 없습니다.</EmptyMsg>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {workHistory.map(([year, value]) => (
                            <div key={year} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 12, fontSize: 13 }}>
                              <span style={{ fontWeight: 700, color: BRAND, flexShrink: 0 }}>{year}년</span>
                              <span style={{ color: '#374151', lineHeight: 1.6 }}>{value}</span>
                            </div>
                          ))}
                          {s.defect && (
                            <div style={{ marginTop: 4, padding: '8px 12px', background: '#fef2f2', borderRadius: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>불량사항 </span>
                              <span style={{ fontSize: 13, color: '#374151' }}>{s.defect}</span>
                            </div>
                          )}
                          {s.planned_process && (
                            <div style={{ padding: '8px 12px', background: '#f0f9ff', borderRadius: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1' }}>예정공정 </span>
                              <span style={{ fontSize: 13, color: '#374151' }}>{s.planned_process}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </DetailSection>

                    {/* ── 5. 점검 결과 ── */}
                    <DetailSection title="점검 결과">
                      {!s.inspection_target && !s.inspection_result && !s.inspection_date && !s.registration_status ? (
                        <EmptyMsg>등록된 점검 결과가 없습니다.</EmptyMsg>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <InfoRow label="점검대상" value={s.inspection_target} />
                          <InfoRow label="점검결과" value={s.inspection_result} />
                          <InfoRow label="점검일자" value={s.inspection_date} />
                          <InfoRow label="등록여부" value={s.registration_status} />
                          <InfoRow label="등록일자" value={s.registration_date} />
                        </div>
                      )}
                    </DetailSection>

                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 추가/수정 모달 */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 400, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{modal.unit ? '냉방기 수정' : '냉방기 추가'}</h3>
              <button onClick={() => setModal(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
            </div>
            {(
              [
                { label: '번호', key: 'unit_number', type: 'number' },
                { label: '용량 (예: 5RT)', key: 'capacity', type: 'text' },
                { label: '제조사', key: 'manufacturer', type: 'text' },
                { label: '취득일', key: 'acquisition_date', type: 'date' },
              ] as { label: string; key: keyof CoolingForm; type: string }[]
            ).map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{f.label}</label>
                <input
                  type={f.type}
                  value={form[f.key] as string | number}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setModal(null)} style={cancelBtnStyle}>취소</button>
              <button onClick={handleSave} disabled={saving} style={saveBtnStyle(saving)}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 360, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>냉방기 삭제</h3>
            <p style={{ fontSize: 14, color: '#374151', marginBottom: 20 }}>이 냉방기 이력을 삭제하시겠습니까?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDeleteTarget(null)} style={cancelBtnStyle}>취소</button>
              <button onClick={handleDelete} style={{ ...saveBtnStyle(false), background: '#ef4444' }}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 서브 컴포넌트 ──

function DetailSection({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827', paddingLeft: 8, borderLeft: `3px solid ${BRAND}` }}>{title}</h4>
        {action}
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', fontSize: 12, marginBottom: 4 }}>
      <span style={{ width: 72, flexShrink: 0, color: '#9ca3af' }}>{label}</span>
      <span style={{ flex: 1, color: '#374151' }}>{value}</span>
    </div>
  )
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 14px', background: '#f9fafb', borderRadius: 8, color: '#9ca3af', fontSize: 13 }}>
      {children}
    </div>
  )
}

function IconBtn({ children, color, onClick }: { children: React.ReactNode; color: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb', borderRadius: 5, background: '#fff', color, cursor: 'pointer' }}
    >
      {children}
    </button>
  )
}

const cancelBtnStyle: React.CSSProperties = { padding: '9px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }
const saveBtnStyle = (disabled: boolean): React.CSSProperties => ({ padding: '9px 20px', border: 'none', borderRadius: 8, background: disabled ? '#9ca3af' : BRAND, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', color: '#fff' })
