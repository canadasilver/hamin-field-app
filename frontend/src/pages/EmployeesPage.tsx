import { useEffect, useState } from 'react'
import Header from '../components/common/Header'
import { employeeApi } from '../services/api'
import { Plus, Trash2, Pencil, X, CalendarOff, Loader2, User } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Employee, UnavailableDate } from '../types'

interface CreateForm {
  name: string
  contact: string
  username: string
  password: string
  confirmPassword: string
  max_daily_tasks: number
  per_task_rate: number
}

interface EditForm {
  name: string
  contact: string
  max_daily_tasks: number
  per_task_rate: number
  new_password: string
  username: string
  confirm_password: string
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateForm>({
    name: '', contact: '', username: '', password: '', confirmPassword: '',
    max_daily_tasks: 5, per_task_rate: 0,
  })
  const [creating, setCreating] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState<string | null>(null)
  const [unavailDate, setUnavailDate] = useState('')

  // 수정 모달 상태
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', contact: '', max_daily_tasks: 5, per_task_rate: 0, new_password: '', username: '', confirm_password: '' })
  const [editUsername, setEditUsername] = useState<string | null>(null)
  const [editHasAccount, setEditHasAccount] = useState(false)
  const [editUnavailDates, setEditUnavailDates] = useState<UnavailableDate[]>([])
  const [editNewDate, setEditNewDate] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadEmployees()
  }, [])

  const loadEmployees = async () => {
    const res = await employeeApi.list(false)
    setEmployees(res.data)
  }

  const handleCreate = async () => {
    if (!form.name.trim() || !form.contact.trim()) {
      toast.error('이름과 연락처를 입력하세요')
      return
    }
    if (!form.username.trim()) {
      toast.error('아이디를 입력하세요')
      return
    }
    if (!form.password) {
      toast.error('비밀번호를 입력하세요')
      return
    }
    if (form.password !== form.confirmPassword) {
      toast.error('비밀번호가 일치하지 않습니다')
      return
    }

    setCreating(true)
    try {
      await employeeApi.create({
        name: form.name.trim(),
        contact: form.contact.trim(),
        username: form.username.trim(),
        password: form.password,
        max_daily_tasks: Number(form.max_daily_tasks) || 5,
        per_task_rate: Number(form.per_task_rate) || 0,
      })
      toast.success('직원 등록 완료')
      setShowForm(false)
      setForm({
        name: '', contact: '', username: '', password: '', confirmPassword: '',
        max_daily_tasks: 5, per_task_rate: 0,
      })
      loadEmployees()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      const msg = typeof detail === 'string'
        ? detail
        : err?.message === 'Network Error'
          ? '서버에 연결할 수 없습니다.'
          : '등록 실패'
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('비활성화하시겠습니까?')) return
    await employeeApi.delete(id)
    toast.success('비활성화되었습니다')
    loadEmployees()
  }

  const handleAddUnavailDate = async () => {
    if (!selectedEmp || !unavailDate) return
    try {
      await employeeApi.addUnavailableDate(selectedEmp, {
        unavailable_date: unavailDate,
      })
      toast.success('근무불가 날짜 추가')
      setUnavailDate('')
    } catch {
      toast.error('추가 실패')
    }
  }

  // === 수정 모달 ===
  const openEditModal = async (emp: Employee) => {
    setEditTarget(emp)
    setEditForm({
      name: emp.name,
      contact: emp.contact,
      max_daily_tasks: emp.max_daily_tasks,
      per_task_rate: emp.per_task_rate,
      new_password: '',
      username: '',
      confirm_password: '',
    })
    setEditUsername(emp.username || null)
    setEditHasAccount(false)
    setEditUnavailDates([])
    setEditNewDate('')
    setEditLoading(true)

    try {
      const [accountRes, datesRes] = await Promise.all([
        employeeApi.getAccount(emp.id).catch(() => ({ data: { username: null, has_account: false } })),
        employeeApi.getUnavailableDates(emp.id),
      ])
      setEditUsername(accountRes.data.username || emp.username || null)
      setEditHasAccount(accountRes.data.has_account || false)
      setEditUnavailDates(datesRes.data)
    } catch {
      // 에러 무시
    } finally {
      setEditLoading(false)
    }
  }

  const handleEditSave = async () => {
    if (!editTarget) return
    if (!editForm.name.trim() || !editForm.contact.trim()) {
      toast.error('이름과 연락처를 입력하세요')
      return
    }

    // 계정 없는 직원이 아이디를 입력한 경우 유효성 검사
    if (!editHasAccount && editForm.username.trim()) {
      if (!editForm.new_password) {
        toast.error('비밀번호를 입력하세요')
        return
      }
      if (editForm.new_password !== editForm.confirm_password) {
        toast.error('비밀번호가 일치하지 않습니다')
        return
      }
    }

    setSaving(true)
    try {
      await employeeApi.update(editTarget.id, {
        name: editForm.name.trim(),
        contact: editForm.contact.trim(),
        max_daily_tasks: Number(editForm.max_daily_tasks) || 5,
        per_task_rate: Number(editForm.per_task_rate) || 0,
      })

      // 계정 없는 직원: 계정 생성
      if (!editHasAccount && editForm.username.trim() && editForm.new_password) {
        try {
          await employeeApi.createAccount(editTarget.id, {
            username: editForm.username.trim(),
            password: editForm.new_password,
          })
          toast.success('계정 생성 완료')
        } catch (err: any) {
          toast.error(err.response?.data?.detail || '계정 생성 실패')
          setSaving(false)
          return
        }
      }

      // 계정 있는 직원: 비밀번호 변경
      if (editHasAccount && editForm.new_password) {
        try {
          await employeeApi.resetPassword(editTarget.id, editForm.new_password)
          toast.success('비밀번호 변경 완료')
        } catch (err: any) {
          toast.error(err.response?.data?.detail || '비밀번호 변경 실패')
        }
      }

      toast.success('수정 완료')
      setEditTarget(null)
      loadEmployees()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '수정 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleEditAddDate = async () => {
    if (!editTarget || !editNewDate) return
    try {
      const res = await employeeApi.addUnavailableDate(editTarget.id, {
        unavailable_date: editNewDate,
      })
      setEditUnavailDates(prev => [...prev, res.data])
      setEditNewDate('')
      toast.success('날짜 추가')
    } catch {
      toast.error('추가 실패')
    }
  }

  const handleEditRemoveDate = async (dateId: string) => {
    if (!editTarget) return
    try {
      await employeeApi.removeUnavailableDate(editTarget.id, dateId)
      setEditUnavailDates(prev => prev.filter(d => d.id !== dateId))
      toast.success('날짜 삭제')
    } catch {
      toast.error('삭제 실패')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header
        title="직원 관리"
        right={
          <button
            onClick={() => setShowForm(!showForm)}
            className="p-2 text-kt-red"
          >
            <Plus size={22} />
          </button>
        }
      />

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* 직원 등록 폼 */}
        {showForm && (
          <div className="bg-white rounded-2xl p-4 mb-4 space-y-3 border border-gray-100">
            <h3 className="font-bold text-gray-900">새 직원 등록</h3>
            <input
              type="text"
              placeholder="이름"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
            />
            <input
              type="tel"
              placeholder="연락처 (010-0000-0000)"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
            />
            <div>
              <input
                type="text"
                placeholder="아이디"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
              />
              <p className="text-xs text-gray-400 mt-1 ml-1">로그인에 사용할 아이디</p>
            </div>
            <input
              type="password"
              placeholder="비밀번호"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
              autoComplete="new-password"
            />
            <div>
              <input
                type="password"
                placeholder="비밀번호 확인"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30 ${
                  form.confirmPassword && form.password !== form.confirmPassword
                    ? 'border-red-400'
                    : 'border-gray-200'
                }`}
                autoComplete="new-password"
              />
              {form.confirmPassword && form.password !== form.confirmPassword && (
                <p className="text-xs text-red-500 mt-1 ml-1">비밀번호가 일치하지 않습니다</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">하루 최대 작업수</label>
                <input
                  type="number"
                  min="1"
                  value={form.max_daily_tasks}
                  onChange={(e) => {
                    const val = parseInt(e.target.value)
                    setForm({ ...form, max_daily_tasks: isNaN(val) ? 0 : val })
                  }}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">건당 단가 (원)</label>
                <input
                  type="number"
                  min="0"
                  value={form.per_task_rate}
                  onChange={(e) => {
                    const val = parseInt(e.target.value)
                    setForm({ ...form, per_task_rate: isNaN(val) ? 0 : val })
                  }}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
                />
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-2.5 bg-kt-red text-white rounded-xl text-sm font-medium disabled:opacity-50"
            >
              {creating ? '등록 중...' : '등록'}
            </button>
          </div>
        )}

        {/* 직원 목록 */}
        <div className="space-y-3">
          {employees.map((emp) => (
            <div key={emp.id} className="bg-white rounded-2xl p-4 border border-gray-100">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900">{emp.name}</h3>
                    {!emp.is_active && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">비활성</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{emp.contact}</p>
                  {emp.username && (
                    <p className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                      <User size={12} />
                      {emp.username}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEditModal(emp)} className="p-1.5 text-gray-300 hover:text-blue-500">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => handleDelete(emp.id)} className="p-1.5 text-gray-300 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="flex gap-4 mt-3 text-xs text-gray-500">
                <span>최대 {emp.max_daily_tasks}건/일</span>
                <span>건당 {emp.per_task_rate.toLocaleString()}원</span>
              </div>

              {/* 근무불가 날짜 */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarOff size={14} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-500">근무불가 날짜</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={selectedEmp === emp.id ? unavailDate : ''}
                    onFocus={() => setSelectedEmp(emp.id)}
                    onChange={(e) => {
                      setSelectedEmp(emp.id)
                      setUnavailDate(e.target.value)
                    }}
                    className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
                  />
                  <button
                    onClick={handleAddUnavailDate}
                    disabled={selectedEmp !== emp.id || !unavailDate}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium disabled:opacity-40"
                  >
                    추가
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== 수정 모달 ===== */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={() => setEditTarget(null)}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto safe-area-bottom"
            onClick={e => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h3 className="font-bold text-gray-900 text-lg">직원 정보 수정</h3>
              <button onClick={() => setEditTarget(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {editLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* 이름 */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">이름</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
                  />
                </div>

                {/* 연락처 */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">연락처</label>
                  <input
                    type="tel"
                    value={editForm.contact}
                    onChange={e => setEditForm({ ...editForm, contact: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
                  />
                </div>

                {/* 아이디 */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">아이디</label>
                  {editHasAccount ? (
                    <input
                      type="text"
                      value={editUsername || ''}
                      disabled
                      className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-sm bg-gray-50 text-gray-400"
                    />
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="아이디 입력"
                        value={editForm.username}
                        onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
                      />
                      <p className="text-xs text-gray-400 mt-1 ml-1">로그인에 사용할 아이디</p>
                    </>
                  )}
                </div>

                {/* 비밀번호 */}
                {editHasAccount ? (
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">비밀번호 재설정</label>
                    <input
                      type="password"
                      placeholder="새 비밀번호 입력"
                      value={editForm.new_password}
                      onChange={e => setEditForm({ ...editForm, new_password: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-gray-400 mt-1">비워두면 변경하지 않습니다</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">비밀번호</label>
                      <input
                        type="password"
                        placeholder="비밀번호 입력"
                        value={editForm.new_password}
                        onChange={e => setEditForm({ ...editForm, new_password: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">비밀번호 확인</label>
                      <input
                        type="password"
                        placeholder="비밀번호 확인"
                        value={editForm.confirm_password}
                        onChange={e => setEditForm({ ...editForm, confirm_password: e.target.value })}
                        className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30 ${
                          editForm.confirm_password && editForm.new_password !== editForm.confirm_password
                            ? 'border-red-400'
                            : 'border-gray-200'
                        }`}
                        autoComplete="new-password"
                      />
                      {editForm.confirm_password && editForm.new_password !== editForm.confirm_password && (
                        <p className="text-xs text-red-500 mt-1 ml-1">비밀번호가 일치하지 않습니다</p>
                      )}
                    </div>
                  </>
                )}

                {/* 작업 설정 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">하루 최대 작업수</label>
                    <input
                      type="number"
                      min="1"
                      value={editForm.max_daily_tasks}
                      onChange={e => {
                        const val = parseInt(e.target.value)
                        setEditForm({ ...editForm, max_daily_tasks: isNaN(val) ? 0 : val })
                      }}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">건당 단가 (원)</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.per_task_rate}
                      onChange={e => {
                        const val = parseInt(e.target.value)
                        setEditForm({ ...editForm, per_task_rate: isNaN(val) ? 0 : val })
                      }}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
                    />
                  </div>
                </div>

                {/* 근무불가 날짜 */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">
                    <CalendarOff size={12} className="inline mr-1" />
                    근무 불가능한 날
                  </label>

                  {editUnavailDates.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {editUnavailDates
                        .sort((a, b) => a.unavailable_date.localeCompare(b.unavailable_date))
                        .map(d => (
                          <span
                            key={d.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 rounded-lg text-xs"
                          >
                            {d.unavailable_date}
                            {d.reason && <span className="text-orange-400">({d.reason})</span>}
                            <button
                              onClick={() => handleEditRemoveDate(d.id)}
                              className="ml-0.5 text-orange-400 hover:text-orange-600"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={editNewDate}
                      onChange={e => setEditNewDate(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
                    />
                    <button
                      onClick={handleEditAddDate}
                      disabled={!editNewDate}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-gray-200"
                    >
                      추가
                    </button>
                  </div>
                </div>

                {/* 버튼 */}
                <div className="flex gap-3 pt-2 pb-2">
                  <button
                    onClick={() => setEditTarget(null)}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleEditSave}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-kt-red text-white rounded-xl font-bold disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                    저장
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
