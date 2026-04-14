import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { checklistApi, scheduleApi, stationApi } from '../../services/api'
import { Save, Undo2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { StationNote } from '../../types'

interface ChecklistFormProps {
  scheduleId: string
  status?: string
  stationId: string
}

export default function ChecklistForm({ scheduleId, status, stationId }: ChecklistFormProps) {
  const navigate = useNavigate()
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [stationNotes, setStationNotes] = useState<StationNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const isCompleted = status === 'completed'

  useEffect(() => {
    loadChecklist()
  }, [scheduleId])

  useEffect(() => {
    if (!stationId) return
    setNotesLoading(true)
    stationApi.getNotes(stationId)
      .then(res => setStationNotes(res.data))
      .catch(() => {})
      .finally(() => setNotesLoading(false))
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

  const handleSave = async () => {
    setSaving(true)
    try {
      await checklistApi.update(scheduleId, { notes })
      await scheduleApi.update(scheduleId, { status: 'completed' })
      toast.success('작업이 완료되었습니다!')
      setTimeout(() => navigate(-1), 500)
    } catch {
      toast.error('저장 실패')
    } finally {
      setSaving(false)
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

  return (
    <div className="space-y-4">
      {/* 이전 특이사항 이력 */}
      <div>
        <p className="text-sm font-bold text-[#215288] mb-2">📋 이전 특이사항 이력</p>
        {notesLoading ? (
          <div className="text-xs text-gray-400 text-center py-3">로딩중...</div>
        ) : stationNotes.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-xl">
            이전 기록이 없습니다
          </div>
        ) : (
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
        )}
      </div>

      {/* 특이사항 입력 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          특이사항
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="특이사항을 입력하세요..."
          rows={3}
          className="w-full p-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#215288]/30"
        />
      </div>

      {/* 버튼 */}
      {isCompleted ? (
        <button
          onClick={handleCancelComplete}
          disabled={cancelling}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-white text-gray-600 border border-gray-300 rounded-2xl font-bold text-base disabled:opacity-50"
        >
          <Undo2 size={20} />
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
  )
}
