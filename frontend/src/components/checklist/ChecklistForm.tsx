import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { checklistApi, scheduleApi, stationApi } from '../../services/api'
import { Save, Undo2, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import type { StationNote, Station } from '../../types'

interface ChecklistFormProps {
  scheduleId: string
  status?: string
  stationId: string
  station?: Station
}

export default function ChecklistForm({ scheduleId, status, stationId, station }: ChecklistFormProps) {
  const navigate = useNavigate()
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingHistory, setSavingHistory] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [stationNotes, setStationNotes] = useState<StationNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const isCompleted = status === 'completed'

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    loadChecklist()
  }, [scheduleId])

  useEffect(() => {
    if (!stationId) return
    loadStationNotes()
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

  const loadStationNotes = () => {
    setNotesLoading(true)
    stationApi.getNotes(stationId)
      .then(res => setStationNotes(res.data))
      .catch(() => {})
      .finally(() => setNotesLoading(false))
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

  // 작업 이력 저장 (상태 변경 없음 - 항상 가능)
  const handleSaveHistory = async () => {
    if (!notes.trim()) {
      toast.error('작업 이력을 입력하세요')
      return
    }
    setSavingHistory(true)
    try {
      const datedNotes = `${today}: ${notes.trim()}`
      await checklistApi.update(scheduleId, { notes: datedNotes })
      toast.success('작업 이력이 저장되었습니다')
      setNotes('')
      loadStationNotes()
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

  if (loading) return <div className="p-4 text-center text-gray-400">로딩중...</div>

  // work_2021~2024 연도별 이력 (값 있는 것만)
  const yearHistory = [
    { year: '2021년', value: station?.work_2021 },
    { year: '2022년', value: station?.work_2022 },
    { year: '2023년', value: station?.work_2023 },
    { year: '2024년', value: station?.work_2024 },
  ].filter(h => h.value)

  const hasAnyHistory = yearHistory.length > 0 || stationNotes.length > 0

  return (
    <div className="space-y-4">
      {/* 작업 이력 */}
      <div>
        <p className="text-sm font-bold text-[#215288] mb-2">📋 작업 이력</p>

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

        {/* 직원 입력 이력 (체크리스트 notes) */}
        {notesLoading ? (
          <div className="text-xs text-gray-400 text-center py-3">로딩중...</div>
        ) : !hasAnyHistory ? (
          <div className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-xl">
            이전 기록이 없습니다
          </div>
        ) : stationNotes.length > 0 ? (
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {stationNotes.map((item, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-[#215288]/20 bg-blue-50/50 p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-[#215288]">{item.date}</span>
                  <span className="text-xs text-gray-500">{item.employee}</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.note}</p>
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
