import { useState, useEffect } from 'react'
import { employeeApi, assignmentApi, fileApi, stationApi } from '../../services/api'
import type { Employee, AssignmentPreview, AssignmentStation, UploadedFile, Station } from '../../types'
import { Shuffle, Loader2, ChevronDown, AlertTriangle, Trash2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

declare global {
  interface Window { kakao: any }
}

function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!window.kakao?.maps?.services) return resolve(null)
    const geocoder = new window.kakao.maps.services.Geocoder()
    geocoder.addressSearch(address, (result: any[], status: string) => {
      if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
        resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) })
      } else {
        resolve(null)
      }
    })
  })
}

interface FileGroup {
  file_id: string
  filename: string
  total: number
  employees: { employee_id: string; employee_name: string; count: number }[]
}

type PageMode = 'setup' | 'preview'

const BRAND = '#215288'

export default function Assign() {
  const [mode, setMode] = useState<PageMode>('setup')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [statusData, setStatusData] = useState<any>(null)
  const [fileGroups, setFileGroups] = useState<FileGroup[]>([])

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([])
  const [selectedFileId, setSelectedFileId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [existingCounts, setExistingCounts] = useState<Record<string, number>>({})

  const [preview, setPreview] = useState<AssignmentPreview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [selectedTabEmpId, setSelectedTabEmpId] = useState<string>('')

  useEffect(() => {
    const today = new Date()
    const twoWeeks = new Date(today)
    twoWeeks.setDate(today.getDate() + 14)
    setStartDate(fmt(today))
    setEndDate(fmt(twoWeeks))
    loadInitial()
  }, [])

  function fmt(d: Date) { return d.toISOString().split('T')[0] }

  const loadInitial = async () => {
    try {
      const [empRes, fileRes, statusRes] = await Promise.all([
        employeeApi.list(),
        fileApi.list().catch(() => ({ data: [] })),
        assignmentApi.status(),
      ])
      setEmployees(empRes.data)
      setFiles(fileRes.data)
      if (statusRes.data.has_assignments) {
        setStatusData(statusRes.data)
        setFileGroups(statusRes.data.file_groups || [])
      }
    } catch {
      toast.error('초기 데이터 로드 실패')
    } finally {
      setInitialLoading(false)
    }
  }

  const checkExisting = async (empIds: string[]) => {
    if (empIds.length === 0 || !startDate || !endDate) return
    try {
      const res = await assignmentApi.employeeExisting(empIds, startDate, endDate)
      const map: Record<string, number> = {}
      res.data.forEach((e: any) => { map[e.employee_id] = e.existing_count })
      setExistingCounts(map)
    } catch { /* ignore */ }
  }

  const toggleEmployee = (id: string) => {
    const next = selectedEmpIds.includes(id)
      ? selectedEmpIds.filter(x => x !== id)
      : [...selectedEmpIds, id]
    setSelectedEmpIds(next)
    checkExisting(next)
  }

  const selectAllEmployees = () => {
    const next = selectedEmpIds.length === employees.length ? [] : employees.map(e => e.id)
    setSelectedEmpIds(next)
    checkExisting(next)
  }

  const geocodeStations = async () => {
    setLoadingMsg('좌표 없는 기지국 조회 중...')
    const params: any = { limit: 500, offset: 0 }
    if (selectedFileId) params.file_id = selectedFileId
    const stRes = await stationApi.list(params)
    const noCoords = stRes.data.filter((s: Station) => !s.lat && !s.lng && s.address && s.status === 'pending')
    if (noCoords.length === 0) return 0

    setLoadingMsg(`${noCoords.length}건 지오코딩 중...`)
    const updates: { station_id: string; lat: number; lng: number }[] = []
    for (let i = 0; i < noCoords.length; i++) {
      const s = noCoords[i]
      setLoadingMsg(`지오코딩 ${i + 1}/${noCoords.length}: ${s.station_name}`)
      const coords = await geocodeAddress(s.address!)
      if (coords) updates.push({ station_id: s.id, lat: coords.lat, lng: coords.lng })
      if (i % 5 === 4) await new Promise(r => setTimeout(r, 200))
    }
    if (updates.length > 0) {
      setLoadingMsg(`${updates.length}건 좌표 저장 중...`)
      await assignmentApi.updateCoords(updates)
    }
    return updates.length
  }

  const handlePreview = async () => {
    if (!startDate || !endDate) return toast.error('날짜를 선택해주세요')
    if (selectedEmpIds.length === 0) return toast.error('직원을 선택해주세요')

    setLoading(true)
    try {
      const geocoded = await geocodeStations()
      if (geocoded > 0) toast.success(`${geocoded}건 좌표 변환 완료`)

      setLoadingMsg('자동 배분 계산 중...')
      const res = await assignmentApi.preview({
        start_date: startDate,
        end_date: endDate,
        employee_ids: selectedEmpIds,
        file_id: selectedFileId || undefined,
      })
      setPreview(res.data)
      setSelectedTabEmpId(selectedEmpIds[0] || '')
      setMode('preview')
      toast.success(`${res.data.stats.assigned}건 배분 완료`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '배분 실패')
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  const handleReassign = (stationId: string, fromEmpId: string, toEmpId: string) => {
    if (!preview) return
    const updated = { ...preview }
    const fromGroup = updated.assignments.find(a => a.employee_id === fromEmpId)
    const toGroup = updated.assignments.find(a => a.employee_id === toEmpId)
    if (fromGroup) {
      const station = fromGroup.stations.find(s => s.station_id === stationId)
      if (station) {
        fromGroup.stations = fromGroup.stations.filter(s => s.station_id !== stationId)
        if (toGroup) toGroup.stations.push(station)
      }
    }
    setPreview(updated)
    toast.success('재배정 완료')
  }

  const handleConfirm = async () => {
    if (!preview) return
    if (!confirm('배분을 확정하시겠습니까?')) return
    setConfirming(true)
    try {
      const items = preview.assignments.flatMap(a =>
        a.stations.map(s => ({
          station_id: s.station_id,
          employee_id: a.employee_id,
          scheduled_date: s.scheduled_date,
          sort_order: s.sort_order,
        }))
      )
      const res = await assignmentApi.confirm(items)
      toast.success(res.data.message)
      setPreview(null)
      setMode('setup')
      loadInitial()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '확정 실패')
    } finally {
      setConfirming(false)
    }
  }

  const handleExcelDownload = () => {
    if (!preview) return
    const data: any[] = []
    preview.assignments.forEach(assignment => {
      assignment.stations.forEach((station, idx) => {
        data.push({
          '직원명': assignment.employee_name,
          '순서': idx + 1,
          '기지국명': station.station_name,
          '주소': station.station_name,
          '배분일자': station.scheduled_date,
        })
      })
    })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '배분결과')
    XLSX.writeFile(wb, `배분결과_${new Date().toISOString().split('T')[0]}.xlsx`)
    toast.success('엑셀 파일이 다운로드되었습니다')
  }

  const groupByDate = (stations: AssignmentStation[]) => {
    const grouped: Record<string, AssignmentStation[]> = {}
    stations.forEach(s => {
      if (!grouped[s.scheduled_date]) grouped[s.scheduled_date] = []
      grouped[s.scheduled_date].push(s)
    })
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
  }

  if (initialLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} color="#6b7280" />
      </div>
    )
  }

  // ===== 설정 화면 =====
  if (mode === 'setup') {
    const assignedFileIds = new Set(fileGroups.map(fg => fg.file_id))
    const availableFiles = files.filter(f => !assignedFileIds.has(f.id))

    return (
      <div style={{ display: 'flex', gap: 24, minHeight: 'calc(100vh - 80px)' }}>
        {/* 좌측 설정 패널 */}
        <div style={{ flex: '0 0 320px', background: '#fff', borderRight: '1px solid #e5e7eb', padding: 20, overflowY: 'auto' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: '#111827' }}>배분 설정</h2>

          {/* 파일 선택 */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#6b7280' }}>업로드 파일 선택</label>
            <select
              value={selectedFileId}
              onChange={e => setSelectedFileId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid #e5e7eb`, fontSize: 13 }}
            >
              <option value="">전체 미배분 기지국</option>
              {(statusData ? availableFiles : files).map(f => (
                <option key={f.id} value={f.id}>{f.filename} ({f.total_count}개)</option>
              ))}
              {statusData && files.filter(f => !availableFiles.includes(f)).map(f => (
                <option key={f.id} value={f.id} disabled>{f.filename} ({f.total_count}개) - 배분완료</option>
              ))}
            </select>
          </div>

          {/* 날짜 선택 */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#6b7280' }}>작업 기간</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid #e5e7eb`, fontSize: 13 }} />
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid #e5e7eb`, fontSize: 13 }} />
            </div>
          </div>

          {/* 직원 선택 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>직원 선택</label>
              <button onClick={selectAllEmployees} style={{ fontSize: 11, color: BRAND, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {selectedEmpIds.length === employees.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
              {employees.map(emp => {
                const existing = existingCounts[emp.id] || 0
                return (
                  <label
                    key={emp.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderRadius: 6,
                      border: `1px solid ${selectedEmpIds.includes(emp.id) ? BRAND : '#e5e7eb'}`,
                      background: selectedEmpIds.includes(emp.id) ? '#eff6ff' : '#fff',
                      cursor: 'pointer', fontSize: 13
                    }}
                  >
                    <input type="checkbox" checked={selectedEmpIds.includes(emp.id)} onChange={() => toggleEmployee(emp.id)} style={{ cursor: 'pointer' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{emp.name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{emp.contact}</div>
                    </div>
                    {existing > 0 && (
                      <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <AlertTriangle size={10} /> {existing}건
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>

          {/* 자동 배분 버튼 */}
          <button
            onClick={handlePreview}
            disabled={loading || selectedEmpIds.length === 0}
            style={{
              width: '100%', padding: 12, borderRadius: 6, background: loading ? '#d1d5db' : BRAND, color: '#fff',
              border: 'none', cursor: loading ? 'default' : 'pointer', fontWeight: 600, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            {loading ? (
              <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> {loadingMsg || '처리 중...'}</>
            ) : (
              <><Shuffle size={16} /> 자동 배분</>
            )}
          </button>

          {/* 배분 현황 */}
          {statusData && fileGroups.length > 0 && (
            <div style={{ marginTop: 20, padding: 12, background: '#f3f4f6', borderRadius: 6 }}>
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#111827' }}>기존 배분 현황</p>
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                {fileGroups.map(fg => (
                  <div key={fg.file_id} style={{ marginBottom: 4 }}>
                    {fg.filename}: {fg.total}건
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 우측 배분 안내 */}
        <div style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 14 }}>
          <div style={{ textAlign: 'center' }}>
            <Shuffle size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
            <p>설정 후 "자동 배분" 버튼을 클릭하여</p>
            <p>배분 결과를 미리보고 확정합니다.</p>
          </div>
        </div>
      </div>
    )
  }

  // ===== 미리보기 =====
  if (mode === 'preview' && preview) {
    const tabEmp = preview.assignments.find(a => a.employee_id === selectedTabEmpId)
    const tabStations = tabEmp?.stations || []
    const tabStats = {
      total: tabStations.length,
      pending: tabStations.filter(s => !s.scheduled_date).length,
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
        {/* 헤더 */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>배분 결과</h2>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>전체 {preview.stats.total}건 | 배분됨 {preview.stats.assigned}건 | 좌표없음 {preview.stats.no_coords}건</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleExcelDownload} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${BRAND}`, background: '#fff', color: BRAND, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              엑셀 다운로드
            </button>
            <button onClick={handleConfirm} disabled={confirming} style={{ padding: '8px 16px', borderRadius: 6, background: confirming ? '#d1d5db' : BRAND, color: '#fff', border: 'none', cursor: confirming ? 'default' : 'pointer', fontWeight: 600, fontSize: 13 }}>
              {confirming ? '확정 중...' : '배분 확정'}
            </button>
          </div>
        </div>

        {/* 탭 + 테이블 */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* 직원 탭 */}
          <div style={{ borderBottom: '1px solid #e5e7eb', padding: '0 24px', display: 'flex', gap: 4, overflowX: 'auto', background: '#f9fafb' }}>
            {preview.assignments.map(a => (
              <button
                key={a.employee_id}
                onClick={() => setSelectedTabEmpId(a.employee_id)}
                style={{
                  padding: '12px 16px', borderBottom: `3px solid ${selectedTabEmpId === a.employee_id ? BRAND : 'transparent'}`,
                  background: 'none', border: 'none', cursor: 'pointer', fontWeight: selectedTabEmpId === a.employee_id ? 600 : 500,
                  color: selectedTabEmpId === a.employee_id ? BRAND : '#6b7280', fontSize: 13, whiteSpace: 'nowrap'
                }}
              >
                {a.employee_name} ({a.stations.length}건)
              </button>
            ))}
          </div>

          {/* 기지국 테이블 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px' }}>
            {tabStations.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#9ca3af' }}>배분된 기지국이 없습니다.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>순서</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>기지국명</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>주소</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>배분일자</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>재배정</th>
                  </tr>
                </thead>
                <tbody>
                  {tabStations.map((s, i) => (
                    <tr key={s.station_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 12, color: BRAND, fontWeight: 600 }}>#{i + 1}</td>
                      <td style={{ padding: 12 }}>{s.station_name}</td>
                      <td style={{ padding: 12, fontSize: 12, color: '#6b7280' }}>{s.station_name}</td>
                      <td style={{ padding: 12 }}>{s.scheduled_date}</td>
                      <td style={{ padding: 12 }}>
                        <select
                          onChange={e => {
                            if (e.target.value && selectedTabEmpId) {
                              handleReassign(s.station_id, selectedTabEmpId, e.target.value)
                              e.target.value = ''
                            }
                          }}
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e5e7eb', fontSize: 12, cursor: 'pointer' }}
                          defaultValue=""
                        >
                          <option value="">다른 직원으로...</option>
                          {preview.assignments.filter(a => a.employee_id !== selectedTabEmpId).map(a => (
                            <option key={a.employee_id} value={a.employee_id}>{a.employee_name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
