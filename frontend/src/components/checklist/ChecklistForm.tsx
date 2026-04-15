import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { checklistApi, scheduleApi, workHistoryApi } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { Save, Undo2, BookOpen, Pencil, Trash2, X, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Station, WorkHistory } from '../../types'

interface ChecklistFormProps {
  scheduleId: string
  status?: string
  stationId: string
  station?: Station
}

export default function ChecklistForm({ scheduleId, status, stationId, station }: ChecklistFormProps) {
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingHistory, setSavingHistory] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [workHistories, setWorkHistories] = useState<WorkHistory[]>([])
  const [historiesLoading, setHistoriesLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const isCompleted = status === 'completed'

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    loadChecklist()
  }, [scheduleId])

  useEffect(() => {
    if (!stationId) return
    loadWorkHistory()
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

  const loadWorkHistory = () => {
    setHistoriesLoading(true)
    workHistoryApi.list(stationId)
      .then(res => setWorkHistories(res.data))
      .catch(() => {})
      .finally(() => setHistoriesLoading(false))
  }

  // 작업 완료 저장 (상태 변경 포함)
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
      // 입력란 초기화 후 목록 최신순 추가
      setNotes('')
      setWorkHistories(prev => [res.data, ...prev])
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
      setWorkHistories(prev => prev.map(h => h.id === id ? res.data : h))
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
      setWorkHistories(prev => prev.filter(h => h.id !== id))
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

  const canModify = (item: WorkHistory) =>
    isAdmin || (!!user?.employee_id && item.employee_id === user.employee_id)

  if (loading) return <div className="p-4 text-center text-gray-400">로딩중...</div>

  // work_2021~2024 연도별 이력 (값 있는 것만)
  const yearHistory = [
    { year: '2021년', value: station?.work_2021 },
    { year: '2022년', value: station?.work_2022 },
    { year: '2023년', value: station?.work_2023 },
    { year: '2024년', value: station?.work_2024 },
  ].filter(h => h.value)

  const hasAnyHistory = yearHistory.length > 0 || workHistories.length > 0

  return (
    <div className="space-y-4">
      {/* 작업 이력 */}
      <div>
        <p className="text-sm font-bold text-[#215288] mb-2">작업 이력</p>

        {/* 연도별 이력 (work_2021~2024) */}
        {yearHistory.length > 0 && (
          <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-2 space-y-1.5">
            {yearHistory.map(h => (
              <div key={h.year} className="flex text-xs">
                <span className="text-[#215288] w-14 flex-shrink-0 font-medium">{h.year}</span>
                <span className="text-gray-700 flex-1">{h.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* 직원 입력 이력 */}
        {historiesLoading ? (
          <div className="text-xs text-gray-400 text-center py-3">로딩중...</div>
        ) : !hasAnyHistory ? (
          <div className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-xl">
            이전 기록이 없습니다
          </div>
        ) : workHistories.length > 0 ? (
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {workHistories.map(item => (
              <div
                key={item.id}
                className="rounded-xl border border-[#215288]/20 bg-blue-50/50 p-3"
              >
                {editingId === item.id ? (
                  /* 편집 모드 */
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
                  /* 보기 모드 */
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-[#215288]">{item.date}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500">{item.employee_name || '알 수 없음'}</span>
                        {canModify(item) && (
                          <>
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
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.content}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : null}
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
        {/* 작업 이력 저장 - 항상 표시 */}
        <button
          onClick={handleSaveHistory}
          disabled={savingHistory}
          className="w-full flex items-center justify-center gap-2 py-3 bg-white text-[#215288] border-2 border-[#215288] rounded-2xl font-bold text-base disabled:opacity-50"
        >
          <BookOpen size={18} />
          {savingHistory ? '저장 중...' : '작업 이력 저장'}
        </button>

        {/* 완료 상태 버튼 */}
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
