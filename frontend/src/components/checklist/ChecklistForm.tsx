import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { checklistApi, scheduleApi, workHistoryApi } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { Save, Undo2, BookOpen, Pencil, Trash2, X, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import type { WorkHistory, StationHistory } from '../../types'

interface ChecklistFormProps {
  scheduleId: string
  status?: string
  stationId: string
}

export default function ChecklistForm({ scheduleId, status, stationId }: ChecklistFormProps) {
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingHistory, setSavingHistory] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // 통합 이력 상태
  const [stationHistory, setStationHistory] = useState<StationHistory | null>(null)
  const [historiesLoading, setHistoriesLoading] = useState(false)

  // work_history 인라인 편집
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 연도별 인라인 편집 (관리자 전용)
  const [editingYear, setEditingYear] = useState<string | null>(null)
  const [editYearContent, setEditYearContent] = useState('')
  const [editYearSaving, setEditYearSaving] = useState(false)

  const isCompleted = status === 'completed'
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    loadChecklist()
  }, [scheduleId])

  useEffect(() => {
    if (!stationId) return
    loadStationHistory()
  }, [stationId])

  const loadChecklist = async () => {
    try {
      const res = await checklistApi.get(scheduleId)
      setNotes(res.data.notes || '')
    } catch {
      // 체크리스트가 없을 수 있음
    } finally {
      setLoading(false)
    }
  }

  const loadStationHistory = () => {
    setHistoriesLoading(true)
    workHistoryApi.getStationHistory(stationId)
      .then(res => setStationHistory(res.data))
      .catch(() => {})
      .finally(() => setHistoriesLoading(false))
  }

  // 작업 완료 저장
  const handleSave = async () => {
    setSaving(true)
    try {
      const datedNotes = notes.trim() ? `${today}: ${notes.trim()}` : ''
      await checklistApi.update(scheduleId, { notes: datedNotes })
      await scheduleApi.update(scheduleId, { status: 'completed' })
      toast.success('작업이 완료되었습니다!')
      setTimeout(() => navigate(-1), 500)
    } catch {
      toast.error('저장 실패')
    } finally {
      setSaving(false)
    }
  }

  // 작업 이력 저장 (상태 변경 없음)
  const handleSaveHistory = async () => {
    if (!notes.trim()) {
      toast.error('작업 이력을 입력하세요')
      return
    }
    setSavingHistory(true)
    try {
      const res = await workHistoryApi.create({
        station_id: stationId,
        schedule_id: scheduleId,
        content: notes.trim(),
        date: today,
      })
      setNotes('')
      setStationHistory(prev => prev
        ? { ...prev, work_history: [res.data, ...prev.work_history] }
        : { year_history: { '2021': null, '2022': null, '2023': null, '2024': null }, work_history: [res.data] }
      )
      toast.success('작업 이력이 저장되었습니다')
    } catch {
      toast.error('저장 실패')
    } finally {
      setSavingHistory(false)
    }
  }

  const handleCancelComplete = async () => {
    if (!window.confirm('완료를 취소하시겠습니까?')) return
    setCancelling(true)
    try {
      await scheduleApi.cancelComplete(scheduleId)
      toast.success('작업이 취소되었습니다')
      setTimeout(() => navigate(-1), 500)
    } catch {
      toast.error('완료 취소 실패')
    } finally {
      setCancelling(false)
    }
  }

  // work_history 편집
  const startEdit = (item: WorkHistory) => {
    setEditingId(item.id)
    setEditContent(item.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditContent('')
  }

  const handleEditSave = async (id: string) => {
    if (!editContent.trim()) return
    setEditSaving(true)
    try {
      const res = await workHistoryApi.update(id, { content: editContent.trim() })
      setStationHistory(prev => prev
        ? { ...prev, work_history: prev.work_history.map(h => h.id === id ? res.data : h) }
        : prev
      )
      setEditingId(null)
      toast.success('수정되었습니다')
    } catch (err: any) {
      if (err?.response?.status === 403) {
        toast.error('수정 권한이 없습니다')
      } else {
        toast.error('수정 실패')
      }
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 작업 이력을 삭제하시겠습니까?')) return
    setDeletingId(id)
    try {
      await workHistoryApi.delete(id)
      setStationHistory(prev => prev
        ? { ...prev, work_history: prev.work_history.filter(h => h.id !== id) }
        : prev
      )
      toast.success('삭제되었습니다')
    } catch (err: any) {
      if (err?.response?.status === 403) {
        toast.error('삭제 권한이 없습니다')
      } else {
        toast.error('삭제 실패')
      }
    } finally {
      setDeletingId(null)
    }
  }

  const canModifyHistory = (item: WorkHistory) =>
    isAdmin || (!!user?.employee_id && item.employee_id === user.employee_id)

  // 연도별 편집 (관리자 전용)
  const startEditYear = (year: string, currentValue: string | null) => {
    setEditingYear(year)
    setEditYearContent(currentValue || '')
  }

  const cancelEditYear = () => {
    setEditingYear(null)
    setEditYearContent('')
  }

  const handleYearSave = async (year: string) => {
    setEditYearSaving(true)
    try {
      await workHistoryApi.updateYear(stationId, {
        year: parseInt(year),
        content: editYearContent.trim() || null,
      })
      setStationHistory(prev => prev
        ? { ...prev, year_history: { ...prev.year_history, [year]: editYearContent.trim() || null } }
        : prev
      )
      setEditingYear(null)
      toast.success('수정되었습니다')
    } catch (err: any) {
      if (err?.response?.status === 403) {
        toast.error('관리자만 수정할 수 있습니다')
      } else {
        toast.error('수정 실패')
      }
    } finally {
      setEditYearSaving(false)
    }
  }

  const handleYearDelete = async (year: string) => {
    if (!window.confirm(`${year}년 이력을 삭제하시겠습니까?`)) return
    try {
      await workHistoryApi.updateYear(stationId, { year: parseInt(year), content: null })
      setStationHistory(prev => prev
        ? { ...prev, year_history: { ...prev.year_history, [year]: null } }
        : prev
      )
      toast.success('삭제되었습니다')
    } catch (err: any) {
      if (err?.response?.status === 403) {
        toast.error('관리자만 삭제할 수 있습니다')
      } else {
        toast.error('삭제 실패')
      }
    }
  }

  if (loading) return <div className="p-4 text-center text-gray-400">로딩중...</div>

  const yearHistory = stationHistory
    ? (['2021', '2022', '2023', '2024'] as const).map(y => ({
        year: y,
        label: `${y}년`,
        value: stationHistory.year_history[y],
      }))
    : []

  // 관리자: 빈 연도도 표시 / 직원: 값 있는 연도만
  const visibleYears = isAdmin ? yearHistory : yearHistory.filter(h => h.value)

  const workHistories = stationHistory?.work_history ?? []
  const hasAnyHistory = visibleYears.length > 0 || workHistories.length > 0

  return (
    <div className="space-y-4">
      {/* 점검·작업 이력 */}
      <div>
        <p className="text-sm font-bold text-[#215288] mb-2">점검·작업 이력</p>

        {historiesLoading ? (
          <div className="text-xs text-gray-400 text-center py-3">로딩중...</div>
        ) : !hasAnyHistory ? (
          <div className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-xl">
            이전 기록이 없습니다
          </div>
        ) : (
          <div className="space-y-1.5">
            {/* 연도별 이력 (2021~2024) */}
            {visibleYears.length > 0 && (
              <div className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1.5">
                {visibleYears.map(h => (
                  <div key={h.year}>
                    {editingYear === h.year ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[#215288] w-14 flex-shrink-0 font-medium text-xs">{h.label}</span>
                          <textarea
                            value={editYearContent}
                            onChange={e => setEditYearContent(e.target.value)}
                            rows={2}
                            className="flex-1 p-1.5 border border-[#215288]/40 rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#215288]/30"
                          />
                        </div>
                        <div className="flex gap-1.5 pl-14">
                          <button
                            onClick={() => handleYearSave(h.year)}
                            disabled={editYearSaving}
                            className="flex items-center gap-1 px-2.5 py-1 bg-[#215288] text-white rounded-lg text-xs font-medium disabled:opacity-50"
                          >
                            <Check size={11} />
                            {editYearSaving ? '저장 중...' : '저장'}
                          </button>
                          <button
                            onClick={cancelEditYear}
                            disabled={editYearSaving}
                            className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium"
                          >
                            <X size={11} />
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex text-xs">
                        <span className="text-[#215288] w-14 flex-shrink-0 font-medium">{h.label}</span>
                        <span className="text-gray-700 flex-1">{h.value || <span className="text-gray-300">없음</span>}</span>
                        {isAdmin && (
                          <div className="flex items-center gap-0.5 ml-1 flex-shrink-0">
                            <button
                              onClick={() => startEditYear(h.year, h.value)}
                              className="p-0.5 text-gray-400 hover:text-[#215288]"
                              title="수정"
                            >
                              <Pencil size={11} />
                            </button>
                            {h.value && (
                              <button
                                onClick={() => handleYearDelete(h.year)}
                                className="p-0.5 text-gray-400 hover:text-red-500"
                                title="삭제"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 직원 입력 이력 */}
            {workHistories.length > 0 && (
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {workHistories.map(item => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[#215288]/20 bg-blue-50/50 p-3"
                  >
                    {editingId === item.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          rows={2}
                          className="w-full p-2 border border-[#215288]/40 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#215288]/30"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditSave(item.id)}
                            disabled={editSaving || !editContent.trim()}
                            className="flex items-center gap-1 px-3 py-1 bg-[#215288] text-white rounded-lg text-xs font-medium disabled:opacity-50"
                          >
                            <Check size={12} />
                            {editSaving ? '저장 중...' : '저장'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={editSaving}
                            className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium"
                          >
                            <X size={12} />
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">{item.employee_name || '알 수 없음'}</span>
                          {canModifyHistory(item) && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => startEdit(item)}
                                className="p-1 text-gray-400 hover:text-[#215288]"
                                title="수정"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                onClick={() => handleDelete(item.id)}
                                disabled={deletingId === item.id}
                                className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-50"
                                title="삭제"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          <span className="font-semibold text-[#215288]">{item.date}: </span>
                          {item.content}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 작업 이력 입력 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          작업 이력
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="작업 이력을 입력하세요..."
          rows={3}
          className="w-full p-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#215288]/30"
        />
        <p className="text-xs text-gray-400 mt-1">저장 시 오늘 날짜({today})가 자동으로 추가됩니다</p>
      </div>

      {/* 버튼 영역 */}
      <div className="space-y-2">
        <button
          onClick={handleSaveHistory}
          disabled={savingHistory}
          className="w-full flex items-center justify-center gap-2 py-3 bg-white text-[#215288] border-2 border-[#215288] rounded-2xl font-bold text-base disabled:opacity-50"
        >
          <BookOpen size={18} />
          {savingHistory ? '저장 중...' : '작업 이력 저장'}
        </button>

        {isCompleted ? (
          <button
            onClick={handleCancelComplete}
            disabled={cancelling}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white text-gray-600 border border-gray-300 rounded-2xl font-bold text-base disabled:opacity-50"
          >
            <Undo2 size={18} />
            {cancelling ? '처리 중...' : '완료 취소'}
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#215288] text-white rounded-2xl font-bold text-base disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? '저장 중...' : '작업 완료 저장'}
          </button>
        )}
      </div>
    </div>
  )
}
