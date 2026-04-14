import { useState, useEffect } from 'react'
import Header from '../components/common/Header'
import { employeeApi, assignmentApi, fileApi, stationApi } from '../services/api'
import type { Employee, AssignmentPreview, AssignmentStation, UploadedFile, Station } from '../types'
import { Shuffle, CheckCircle2, Loader2, ChevronDown, ChevronUp, MapPin, ArrowLeft, Trash2, Plus, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

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

function formatDateTime(isoStr: string | null) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

interface FileGroup {
  file_id: string
  filename: string
  total: number
  employees: { employee_id: string; employee_name: string; count: number }[]
}

type PageMode = 'status' | 'setup' | 'preview'

export default function AssignmentPage() {
  const [mode, setMode] = useState<PageMode>('status')

  // 공통
  const [employees, setEmployees] = useState<Employee[]>([])
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [initialLoading, setInitialLoading] = useState(true)

  // 현황
  const [statusData, setStatusData] = useState<any>(null)
  const [fileGroups, setFileGroups] = useState<FileGroup[]>([])
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancellingFileId, setCancellingFileId] = useState<string | null>(null)

  // 설정
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([])
  const [selectedFileId, setSelectedFileId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [existingCounts, setExistingCounts] = useState<Record<string, number>>({})

  // 미리보기 결과
  const [preview, setPreview] = useState<AssignmentPreview | null>(null)
  const [confirming, setConfirming] = useState(false)

  // 재배정 팝업
  const [reassignTarget, setReassignTarget] = useState<{
    station: AssignmentStation
    currentEmpId: string
  } | null>(null)

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
        setMode('status')
      } else {
        setMode('setup')
      }
    } catch {
      setMode('setup')
    } finally {
      setInitialLoading(false)
    }
  }

  const refreshStatus = async () => {
    try {
      const statusRes = await assignmentApi.status()
      if (statusRes.data.has_assignments) {
        setStatusData(statusRes.data)
        setFileGroups(statusRes.data.file_groups || [])
        setMode('status')
      } else {
        setStatusData(null)
        setFileGroups([])
        setMode('setup')
      }
    } catch {
      setMode('setup')
    }
  }

  // 직원 선택 시 기존 배정 건수 조회
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

  // 지오코딩
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

  // 자동 배분 요청
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
      setMode('preview')
      toast.success(`${res.data.stats.assigned}건 배분 완료`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '배분 실패')
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  // 재배정
  const handleReassign = (newEmpId: string) => {
    if (!reassignTarget || !preview) return
    const updated = { ...preview }
    const { station, currentEmpId } = reassignTarget
    const fromGroup = updated.assignments.find(a => a.employee_id === currentEmpId)
    if (fromGroup) fromGroup.stations = fromGroup.stations.filter(s => s.station_id !== station.station_id)
    const toGroup = updated.assignments.find(a => a.employee_id === newEmpId)
    if (toGroup) toGroup.stations.push({ ...station })
    setPreview(updated)
    setReassignTarget(null)
    toast.success('재배정 완료')
  }

  // 배분 확정
  const handleConfirm = async () => {
    if (!preview) return
    if (!confirm('배분을 확정하시겠습니까?\n확정 후 각 직원 앱에 즉시 반영됩니다.')) return
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
      refreshStatus()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '확정 실패')
    } finally {
      setConfirming(false)
    }
  }

  // 전체 배분 취소
  const handleCancelAll = async () => {
    if (!confirm('전체 배분을 취소하시겠습니까?\n모든 배분 내역이 삭제됩니다.')) return
    setCancelling(true)
    try {
      const res = await assignmentApi.cancel()
      toast.success(res.data.message)
      refreshStatus()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '취소 실패')
    } finally {
      setCancelling(false)
    }
  }

  // 파일별 배분 취소
  const handleCancelFile = async (fileId: string, filename: string) => {
    if (!confirm(`"${filename}" 배분을 취소하시겠습니까?`)) return
    setCancellingFileId(fileId)
    try {
      const res = await assignmentApi.cancel(fileId)
      toast.success(res.data.message)
      refreshStatus()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '취소 실패')
    } finally {
      setCancellingFileId(null)
    }
  }

  // 추가 배분 시작
  const goToSetup = () => {
    setPreview(null)
    setSelectedEmpIds([])
    setExistingCounts({})
    setMode('setup')
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
      <div className="min-h-screen bg-gray-50 pb-20">
        <Header title="기지국 배분" />
        <div className="flex items-center justify-center pt-20">
          <Loader2 size={32} className="animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  // ===== 설정 화면 =====
  if (mode === 'setup') {
    // 이미 배분된 파일 ID
    const assignedFileIds = new Set(fileGroups.map(fg => fg.file_id))
    // 미배분 파일만 필터
    const availableFiles = files.filter(f => !assignedFileIds.has(f.id))

    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <Header
          title={statusData ? '추가 배분' : '기지국 배분'}
          left={statusData ? (
            <button onClick={() => setMode('status')} className="p-1">
              <ArrowLeft size={22} />
            </button>
          ) : undefined}
        />

        <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
          {/* 기존 배분 안내 */}
          {statusData && fileGroups.length > 0 && (
            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <p className="text-sm font-medium text-blue-700 mb-1">기존 배분 현황</p>
              <div className="space-y-1">
                {fileGroups.map(fg => (
                  <p key={fg.file_id} className="text-xs text-blue-600">
                    {fg.filename}: {fg.total}건 ({fg.employees.map(e => e.employee_name).join(', ')})
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* 파일 선택 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <label className="block text-sm font-bold text-gray-900 mb-2">업로드 파일 선택</label>
            <select
              value={selectedFileId}
              onChange={e => setSelectedFileId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-kt-red/20 focus:border-kt-red"
            >
              <option value="">전체 미배분 기지국</option>
              {(statusData ? availableFiles : files).map(f => (
                <option key={f.id} value={f.id}>{f.filename} ({f.total_count}개)</option>
              ))}
              {statusData && files.filter(f => !availableFiles.includes(f)).map(f => (
                <option key={f.id} value={f.id} disabled>
                  {f.filename} ({f.total_count}개) - 배분완료
                </option>
              ))}
            </select>
          </div>

          {/* 날짜 선택 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <label className="block text-sm font-bold text-gray-900 mb-3">작업 기간</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">시작일</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-kt-red/20 focus:border-kt-red" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">종료일</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-kt-red/20 focus:border-kt-red" />
              </div>
            </div>
          </div>

          {/* 직원 선택 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-gray-900">직원 선택</label>
              <button onClick={selectAllEmployees} className="text-xs text-kt-red font-medium">
                {selectedEmpIds.length === employees.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <div className="space-y-2">
              {employees.map(emp => {
                const existing = existingCounts[emp.id] || 0
                return (
                  <label
                    key={emp.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      selectedEmpIds.includes(emp.id) ? 'border-kt-red bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <input type="checkbox" checked={selectedEmpIds.includes(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                      className="w-4 h-4 text-kt-red rounded border-gray-300 focus:ring-kt-red" />
                    <div className="flex-1">
                      <span className="font-medium text-gray-900">{emp.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{emp.contact}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {existing > 0 && (
                        <span className="text-[11px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <AlertTriangle size={10} />
                          기존 {existing}건
                        </span>
                      )}
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                        하루 {emp.max_daily_tasks}건
                      </span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          <button
            onClick={handlePreview}
            disabled={loading || selectedEmpIds.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-kt-red text-white rounded-2xl font-bold text-base disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 size={20} className="animate-spin" /> {loadingMsg || '처리 중...'}</>
            ) : (
              <><Shuffle size={20} /> {statusData ? '추가 배분' : '자동 배분'}</>
            )}
          </button>
        </div>
      </div>
    )
  }

  // ===== 미리보기 결과 =====
  if (mode === 'preview' && preview) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <Header
          title="배분 결과"
          left={<button onClick={goToSetup} className="p-1"><ArrowLeft size={22} /></button>}
        />

        {/* 통계 */}
        <div className="bg-white border-b border-gray-100 px-4 py-3">
          <div className="max-w-lg mx-auto flex gap-4 text-center">
            <div className="flex-1">
              <p className="text-lg font-bold text-gray-900">{preview.stats.total}</p>
              <p className="text-xs text-gray-500">전체</p>
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-green-600">{preview.stats.assigned}</p>
              <p className="text-xs text-gray-500">배분됨</p>
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-orange-500">{preview.stats.no_coords}</p>
              <p className="text-xs text-gray-500">좌표없음</p>
            </div>
          </div>
        </div>

        {/* 범례 */}
        <div className="bg-white border-b border-gray-100 px-4 py-2 overflow-x-auto">
          <div className="max-w-lg mx-auto flex gap-3">
            {preview.assignments.map(a => (
              <div key={a.employee_id} className="flex items-center gap-1.5 flex-shrink-0">
                <div className="w-3 h-3 rounded-full" style={{ background: a.color }} />
                <span className="text-xs font-medium text-gray-700">{a.employee_name} ({a.stations.length})</span>
              </div>
            ))}
          </div>
        </div>

        {/* 직원별 */}
        <div className="max-w-lg mx-auto px-4 pt-3 space-y-3">
          {preview.assignments.map(group => (
            <div key={group.employee_id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <button
                onClick={() => setExpandedEmp(expandedEmp === group.employee_id ? null : group.employee_id)}
                className="w-full flex items-center gap-3 p-4"
              >
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: group.color }} />
                <span className="font-bold text-gray-900 flex-1 text-left">{group.employee_name}</span>
                <span className="text-sm text-gray-500">{group.stations.length}건</span>
                {expandedEmp === group.employee_id ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
              </button>
              {expandedEmp === group.employee_id && (
                <div className="border-t border-gray-100 px-4 pb-4">
                  {groupByDate(group.stations).map(([dateStr, stations]) => (
                    <div key={dateStr} className="mt-3">
                      <p className="text-xs font-bold text-gray-500 mb-2">
                        {dateStr} ({['일','월','화','수','목','금','토'][new Date(dateStr).getDay()]})
                        <span className="text-gray-400 ml-1">{stations.length}건</span>
                      </p>
                      <div className="space-y-1.5">
                        {stations.sort((a, b) => a.sort_order - b.sort_order).map(s => (
                          <div key={s.station_id}
                            onClick={() => setReassignTarget({ station: s, currentEmpId: group.employee_id })}
                            className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                          >
                            <span className="flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold flex-shrink-0"
                              style={{ background: group.color }}>{s.sort_order + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{s.station_name}</p>
                              <p className="text-xs text-gray-400 truncate flex items-center gap-1"><MapPin size={10} />{s.address || '주소 없음'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {preview.unassigned && preview.unassigned.length > 0 && (
            <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100">
              <p className="text-sm font-bold text-orange-700 mb-2">좌표 없음 ({preview.unassigned.length}건)</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {preview.unassigned.map(s => <p key={s.id} className="text-xs text-orange-700">{s.station_name}</p>)}
              </div>
            </div>
          )}

          <div className="flex gap-3 pb-4">
            <button onClick={goToSetup} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-2xl font-medium">
              다시 배분
            </button>
            <button onClick={handleConfirm} disabled={confirming}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-kt-red text-white rounded-2xl font-bold disabled:opacity-50">
              {confirming ? <><Loader2 size={18} className="animate-spin" /> 확정 중...</> : <><CheckCircle2 size={18} /> 배분 확정</>}
            </button>
          </div>
        </div>

        {/* 재배정 팝업 */}
        {reassignTarget && (
          <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={() => setReassignTarget(null)}>
            <div className="bg-white rounded-t-2xl w-full max-w-lg p-5 safe-area-bottom" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-gray-900 mb-1">기지국 재배정</h3>
              <p className="text-sm text-gray-500 mb-4">{reassignTarget.station.station_name}</p>
              <div className="space-y-2">
                {preview.assignments.map(a => (
                  <button key={a.employee_id} onClick={() => handleReassign(a.employee_id)}
                    disabled={a.employee_id === reassignTarget.currentEmpId}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      a.employee_id === reassignTarget.currentEmpId ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-gray-200 hover:border-kt-red hover:bg-blue-50'
                    }`}>
                    <div className="w-4 h-4 rounded-full" style={{ background: a.color }} />
                    <span className="font-medium flex-1 text-left">{a.employee_name}</span>
                    <span className="text-xs text-gray-400">{a.stations.length}건</span>
                    {a.employee_id === reassignTarget.currentEmpId && <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded">현재</span>}
                  </button>
                ))}
              </div>
              <button onClick={() => setReassignTarget(null)} className="w-full mt-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium">취소</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ===== 현황 화면 =====
  const lastAssignedAt = statusData?.last_assigned_at
  const assignments = statusData?.assignments || []
  const stats = statusData?.stats

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header title="배분 현황" />

      {/* 배분 완료 상태 바 */}
      {lastAssignedAt && (
        <div className="bg-green-50 border-b border-green-100 px-4 py-2.5">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-600" />
              <span className="text-sm font-medium text-green-700">배분 완료</span>
            </div>
            <span className="text-xs text-green-600">{formatDateTime(lastAssignedAt)}</span>
          </div>
        </div>
      )}

      {/* 통계 */}
      {stats && (
        <div className="bg-white border-b border-gray-100 px-4 py-3">
          <div className="max-w-lg mx-auto flex gap-4 text-center">
            <div className="flex-1">
              <p className="text-lg font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">전체</p>
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-green-600">{stats.assigned}</p>
              <p className="text-xs text-gray-500">배분됨</p>
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-orange-500">{stats.unassigned ?? 0}</p>
              <p className="text-xs text-gray-500">미배분</p>
            </div>
          </div>
          {/* 검증 로그 */}
          {(() => {
            const sum = stats.assigned + (stats.unassigned ?? 0)
            if (sum !== stats.total) {
              console.warn(`[배분 현황 검증 실패] 전체=${stats.total}, 배분됨=${stats.assigned}, 미배분=${stats.unassigned}, 합계=${sum}`)
            } else {
              console.log(`[배분 현황 검증 OK] 전체=${stats.total}, 배분됨=${stats.assigned}, 미배분=${stats.unassigned}`)
            }
            return null
          })()}
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-3 space-y-3">
        {/* 파일별 배분 현황 */}
        {fileGroups.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">파일별 배분 현황</h3>
            </div>
            {fileGroups.map(fg => (
              <div key={fg.file_id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-gray-900 truncate flex-1">{fg.filename}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-lg">{fg.total}건</span>
                    <button
                      onClick={() => handleCancelFile(fg.file_id, fg.filename)}
                      disabled={cancellingFileId === fg.file_id}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      {cancellingFileId === fg.file_id ? '취소중...' : '취소'}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {fg.employees.map(e => (
                    <span key={e.employee_id} className="text-[11px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                      {e.employee_name} {e.count}건
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 직원별 범례 */}
        {assignments.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl px-4 py-2 overflow-x-auto">
            <div className="flex gap-3">
              {assignments.map((a: any) => (
                <div key={a.employee_id} className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="w-3 h-3 rounded-full" style={{ background: a.color }} />
                  <span className="text-xs font-medium text-gray-700">{a.employee_name} ({a.stations.length})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 직원별 배정 목록 */}
        {assignments.map((group: any) => (
          <div key={group.employee_id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => setExpandedEmp(expandedEmp === group.employee_id ? null : group.employee_id)}
              className="w-full flex items-center gap-3 p-4"
            >
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: group.color }} />
              <span className="font-bold text-gray-900 flex-1 text-left">{group.employee_name}</span>
              <span className="text-sm text-gray-500">{group.stations.length}건</span>
              {expandedEmp === group.employee_id ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>
            {expandedEmp === group.employee_id && (
              <div className="border-t border-gray-100 px-4 pb-4">
                {groupByDate(group.stations).map(([dateStr, stations]: [string, any[]]) => (
                  <div key={dateStr} className="mt-3">
                    <p className="text-xs font-bold text-gray-500 mb-2">
                      {dateStr} ({['일','월','화','수','목','금','토'][new Date(dateStr).getDay()]})
                      <span className="text-gray-400 ml-1">{stations.length}건</span>
                    </p>
                    <div className="space-y-1.5">
                      {stations.sort((a: any, b: any) => a.sort_order - b.sort_order).map((s: any) => (
                        <div key={s.station_id} className="flex items-center gap-2 p-2 rounded-lg">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold flex-shrink-0"
                            style={{ background: group.color }}>{s.sort_order + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{s.station_name}</p>
                            <p className="text-xs text-gray-400 truncate flex items-center gap-1"><MapPin size={10} />{s.address || '주소 없음'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* 하단 버튼 */}
        <div className="flex gap-3 pb-4">
          <button
            onClick={handleCancelAll}
            disabled={cancelling}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-700 rounded-2xl font-medium disabled:opacity-50"
          >
            {cancelling ? <><Loader2 size={18} className="animate-spin" /> 취소 중...</> : <><Trash2 size={18} /> 전체 취소</>}
          </button>
          <button
            onClick={goToSetup}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-kt-red text-white rounded-2xl font-bold"
          >
            <Plus size={18} /> 추가 배분
          </button>
        </div>
      </div>
    </div>
  )
}
