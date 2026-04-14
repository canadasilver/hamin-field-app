import { useState, useEffect } from 'react'
import { scheduleApi, employeeApi } from '../../services/api'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Employee } from '../../types'

interface ReassignModalProps {
  scheduleId: string
  currentEmployeeId: string
  currentDate: string
  stationName: string
  onClose: () => void
  onDone: (newDate: string) => void
}

export default function ReassignModal({
  scheduleId,
  currentEmployeeId,
  currentDate,
  stationName,
  onClose,
  onDone,
}: ReassignModalProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(currentEmployeeId)
  const [selectedDate, setSelectedDate] = useState(currentDate)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    employeeApi.list().then(res => setEmployees(res.data)).catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await scheduleApi.reassign(scheduleId, {
        employee_id: selectedEmployeeId,
        scheduled_date: selectedDate,
      })
      toast.success('재배정 완료')
      onDone(selectedDate)
    } catch {
      toast.error('재배정 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">작업 재배정</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">{stationName}</p>

        {/* 담당 직원 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">담당 직원</label>
          <select
            value={selectedEmployeeId}
            onChange={e => setSelectedEmployeeId(e.target.value)}
            className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
          >
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>

        {/* 작업 날짜 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">작업 날짜</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
          />
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-white border border-gray-300 text-gray-600 rounded-xl font-medium text-sm"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-kt-red text-white rounded-xl font-medium text-sm disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
