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

// cooling_info가 문자열로 올 수 있으므로 항상 배열로 파싱
function parseCoolingInfo(raw: CoolingInfo[] | string | null | undefined): CoolingInfo[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export default function Cooling() {
  const [stations, setStations] = useState<Station[]>([])
  const [filtered, setFiltered] = useState<Station[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 여러 기지국 동시 펼치기 가능
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
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(stationId)) {
        next.delete(stationId)
      } else {
        next.add(stationId)
      }
      return next
    })

    // 처음 펼칠 때만 cooling_units 로드
    if (!expandedIds.has(stationId) && units[stationId] === undefined) {
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
    const existing = units[stationId] ?? []
    setForm({ ...EMPTY_FORM, unit_number: existing.length + 1 })
    setModal({ stationId })
  }

  const openEdit = (stationId: string, unit: CoolingUnit) => {
    setForm({
      unit_number: unit.unit_number,
      capacity: unit.capacity ?? '',
      manufacturer: unit.manufacturer ?? '',
      acquisition_date: unit.acquisition_date ?? '',
    })
    setModal({ stationId, unit })
  }

  const handleSave = async () => {
    if (!modal) return
    setSaving(true)
    try {
      if (modal.unit) {
        await coolingUnitApi.update(modal.unit.id, form)
      } else {
        await coolingUnitApi.create({ station_id: modal.stationId, ...form })
      }
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

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 12, fontSize: 13, color: '#6b7280' }}>
        총 {filtered.length}개 기지국
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', color: '#9ca3af' }}>검색 결과 없음</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(s => {
            const isOpen = expandedIds.has(s.id)
            const coolingList = parseCoolingInfo(s.cooling_info)
            const count = coolingList.length
            const stationUnits = units[s.id] ?? []
            const isUnitsLoading = unitsLoading[s.id] ?? false

            return (
              <div key={s.id} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                {/* 기지국 행 (클릭으로 아코디언 토글) */}
                <div
                  onClick={() => toggleExpand(s.id)}
                  style={{
                    padding: '14px 20px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none',
                    background: isOpen ? '#f9fafb' : '#fff',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{s.station_name}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.address ?? '-'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 12 }}>
                    {count > 0 ? (
                      <span style={{
                        background: '#dbeafe', color: '#1e40af', borderRadius: 99,
                        padding: '3px 10px', fontSize: 12, fontWeight: 600
                      }}>
                        냉방기 {count}대
                      </span>
                    ) : (
                      <span style={{ color: '#d1d5db', fontSize: 12 }}>냉방기 없음</span>
                    )}
                    {isOpen ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                  </div>
                </div>

                {/* 아코디언 상세 영역 */}
                {isOpen && (
                  <div style={{ borderTop: '2px solid #e0e7ff', padding: '16px 20px 20px' }}>

                    {/* stations.cooling_info JSON 배열 표시 */}
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>냉방기 정보</span>
                      </div>

                      {coolingList.length === 0 ? (
                        <div style={{ padding: '12px 16px', background: '#f9fafb', borderRadius: 8, color: '#9ca3af', fontSize: 13 }}>
                          등록된 냉방기 정보가 없습니다.
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: '#f0f4ff' }}>
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
                    </div>

                    {/* cooling_units 별도 이력 테이블 */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>냉방기 이력 (cooling_units)</span>
                        <button
                          onClick={e => { e.stopPropagation(); openAdd(s.id) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: 12, padding: '5px 12px', border: `1px solid ${BRAND}`,
                            borderRadius: 6, background: '#fff', color: BRAND, cursor: 'pointer', fontWeight: 600
                          }}
                        >
                          <Plus size={13} /> 추가
                        </button>
                      </div>

                      {isUnitsLoading ? (
                        <div style={{ padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>로딩 중...</div>
                      ) : stationUnits.length === 0 ? (
                        <div style={{ padding: '12px 16px', background: '#f9fafb', borderRadius: 8, color: '#9ca3af', fontSize: 13 }}>
                          등록된 이력이 없습니다. 추가 버튼을 눌러 등록하세요.
                        </div>
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
                                      <button
                                        onClick={e => { e.stopPropagation(); openEdit(s.id, u) }}
                                        style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb', borderRadius: 5, background: '#fff', color: '#6b7280', cursor: 'pointer' }}
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        onClick={e => { e.stopPropagation(); setDeleteTarget({ stationId: s.id, unitId: u.id }) }}
                                        style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb', borderRadius: 5, background: '#fff', color: '#ef4444', cursor: 'pointer' }}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
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
                  onChange={e => setForm(prev => ({
                    ...prev,
                    [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                  }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setModal(null)} style={cancelBtnStyle}>취소</button>
              <button onClick={handleSave} disabled={saving} style={saveBtnStyle(saving)}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
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

const cancelBtnStyle: React.CSSProperties = {
  padding: '9px 20px', border: '1px solid #e5e7eb', borderRadius: 8,
  background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151'
}

const saveBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '9px 20px', border: 'none', borderRadius: 8,
  background: disabled ? '#9ca3af' : '#215288',
  fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', color: '#fff'
})
