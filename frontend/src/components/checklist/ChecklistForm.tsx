import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { checklistApi, scheduleApi } from '../../services/api'
import { CheckSquare, Square, Save, Undo2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Checklist } from '../../types'

interface ChecklistFormProps {
  scheduleId: string
  status?: string
}

export default function ChecklistForm({ scheduleId, status }: ChecklistFormProps) {
  const navigate = useNavigate()
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const isCompleted = status === 'completed'

  useEffect(() => {
    loadChecklist()
  }, [scheduleId])

  const loadChecklist = async () => {
    try {
      const res = await checklistApi.get(scheduleId)
      setChecklist(res.data)
      setNotes(res.data.notes || '')
    } catch {
      // 체크리스트가 없을 수 있음
    } finally {
      setLoading(false)
    }
  }

  const toggleItem = async (itemKey: string, currentValue: boolean) => {
    if (!checklist) return
    try {
      const res = await checklistApi.update(scheduleId, { [itemKey]: !currentValue })
      setChecklist(res.data)
    } catch {
      toast.error('업데이트 실패')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // 1. 체크리스트 특이사항 저장
      await checklistApi.update(scheduleId, { notes })

      // 2. 스케줄 상태를 completed로 변경
      await scheduleApi.update(scheduleId, { status: 'completed' })

      toast.success('작업이 완료되었습니다!')

      // 3. 홈 화면으로 이동
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
  if (!checklist) return <div className="p-4 text-center text-gray-400">체크리스트 없음</div>

  const items = [
    { key: 'item_1', checked: checklist.item_1, label: checklist.item_1_label },
    { key: 'item_2', checked: checklist.item_2, label: checklist.item_2_label },
    { key: 'item_3', checked: checklist.item_3, label: checklist.item_3_label },
    { key: 'item_4', checked: checklist.item_4, label: checklist.item_4_label },
    { key: 'item_5', checked: checklist.item_5, label: checklist.item_5_label },
  ]

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-gray-900">A/S 체크리스트</h3>

      {items.map(({ key, checked, label }) => (
        <button
          key={key}
          onClick={() => toggleItem(key, checked)}
          className="flex items-center gap-3 w-full p-3 bg-white rounded-xl border border-gray-100 text-left"
        >
          {checked ? (
            <CheckSquare size={22} className="text-green-500 flex-shrink-0" />
          ) : (
            <Square size={22} className="text-gray-300 flex-shrink-0" />
          )}
          <span className={checked ? 'text-gray-500 line-through' : 'text-gray-900'}>
            {label}
          </span>
        </button>
      ))}

      <div className="pt-2">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          특이사항
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="특이사항을 입력하세요..."
          rows={3}
          className="w-full p-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-kt-red/30"
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
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-kt-red text-white rounded-2xl font-bold text-base disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? '저장 중...' : '작업 완료 저장'}
        </button>
      )}
    </div>
  )
}
