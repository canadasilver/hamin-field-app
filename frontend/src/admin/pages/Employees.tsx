import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Key } from 'lucide-react'
import { employeeApi } from '../../services/api'
import type { Employee } from '../../types'

const BRAND = '#215288'

// 추가 전용 폼 — 앱 EmployeesPage의 CreateForm과 동일
interface CreateForm {
  name: string
  contact: string
  username: string
  password: string
  confirmPassword: string
  max_daily_tasks: number
  per_task_rate: number
  resident_number: string
  vehicle_number: string
  memo: string
}

const EMPTY_CREATE: CreateForm = {
  name: '', contact: '', username: '', password: '', confirmPassword: '',
  max_daily_tasks: 5, per_task_rate: 0,
  resident_number: '', vehicle_number: '', memo: '',
}

// 수정 전용 폼 (비밀번호는 pw 모달에서 따로 처리)
interface EditForm {
  name: string
  contact: string
  max_daily_tasks: number
  per_task_rate: number
  resident_number: string
  vehicle_number: string
  memo: string
}

interface PwForm { username: string; password: string }

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | 'pw' | null>(null)
  const [target, setTarget] = useState<Employee | null>(null)
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', contact: '', max_daily_tasks: 5, per_task_rate: 0, resident_number: '', vehicle_number: '', memo: '' })
  const [pwForm, setPwForm] = useState<PwForm>({ username: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  // 비밀번호 확인 불일치 표시
  const pwMismatch = createForm.confirmPassword !== '' && createForm.password !== createForm.confirmPassword

  const load = async () => {
    try {
      setLoading(true)
      const res = await employeeApi.list(false)
      setEmployees(res.data)
    } catch {
      setError('직원 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setCreateForm(EMPTY_CREATE); setModal('add') }
  const openEdit = (e: Employee) => {
    setEditForm({ name: e.name, contact: e.contact, max_daily_tasks: e.max_daily_tasks, per_task_rate: e.per_task_rate, resident_number: e.resident_number ?? '', vehicle_number: e.vehicle_number ?? '', memo: e.memo ?? '' })
    setTarget(e)
    setModal('edit')
  }
  const openPw = (e: Employee) => { setPwForm({ username: e.username ?? '', password: '' }); setTarget(e); setModal('pw') }
  const closeModal = () => { setModal(null); setTarget(null); setError('') }

  // ── 직원 추가 (앱과 동일한 로직) ──
  const handleCreate = async () => {
    setError('')
    const f = createForm
    if (!f.name.trim() || !f.contact.trim()) { setError('이름과 연락처를 입력하세요.'); return }
    if (!f.username.trim()) { setError('아이디를 입력하세요.'); return }
    if (!f.password) { setError('비밀번호를 입력하세요.'); return }
    if (f.password !== f.confirmPassword) { setError('비밀번호가 일치하지 않습니다.'); return }

    setSaving(true)
    try {
      await employeeApi.create({
        name: f.name.trim(),
        contact: f.contact.trim(),
        username: f.username.trim(),
        password: f.password,
        max_daily_tasks: Number(f.max_daily_tasks) || 5,
        per_task_rate: Number(f.per_task_rate) || 0,
        ...(f.resident_number.trim() && { resident_number: f.resident_number.trim() }),
        ...(f.vehicle_number.trim() && { vehicle_number: f.vehicle_number.trim() }),
        ...(f.memo.trim() && { memo: f.memo.trim() }),
      })
      await load()
      closeModal()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : '등록에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // ── 직원 수정 ──
  const handleEdit = async () => {
    if (!target || !editForm.name.trim()) { setError('이름을 입력하세요.'); return }
    setSaving(true)
    try {
      await employeeApi.update(target.id, {
        name: editForm.name.trim(),
        contact: editForm.contact.trim(),
        max_daily_tasks: Number(editForm.max_daily_tasks) || 5,
        per_task_rate: Number(editForm.per_task_rate) || 0,
        resident_number: editForm.resident_number.trim() || null,
        vehicle_number: editForm.vehicle_number.trim() || null,
        memo: editForm.memo.trim() || null,
      })
      await load()
      closeModal()
    } catch {
      setError('수정에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // ── 비밀번호/계정 처리 ──
  const handlePwSave = async () => {
    if (!target || !pwForm.password.trim()) return
    setSaving(true)
    try {
      if (!target.username) await employeeApi.createAccount(target.id, { username: pwForm.username, password: pwForm.password })
      else await employeeApi.resetPassword(target.id, pwForm.password)
      closeModal()
    } catch {
      setError('계정 처리에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // ── 삭제 ──
  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await employeeApi.delete(deleteId)
      setDeleteId(null)
      await load()
    } catch {
      setError('삭제에 실패했습니다.')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: BRAND, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={16} /> 직원 추가
        </button>
      </div>

      {error && !modal && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>{error}</div>}

      {/* 직원 목록 테이블 */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280' }}>총 {employees.length}명</div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['이름', '연락처', '아이디', '하루최대', '단가', '차량번호', '상태', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>직원이 없습니다.</td></tr>
                ) : employees.map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{e.name}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{e.contact}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{e.username ?? <span style={{ color: '#d1d5db' }}>미설정</span>}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>{e.max_daily_tasks}건</td>
                    <td style={{ padding: '10px 14px' }}>{e.per_task_rate.toLocaleString()}원</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{e.vehicle_number ?? '-'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: e.is_active ? '#065f46' : '#6b7280', background: e.is_active ? '#d1fae5' : '#f3f4f6' }}>
                        {e.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <IconBtn icon={<Pencil size={14} />} color="#6b7280" onClick={() => openEdit(e)} title="수정" />
                        <IconBtn icon={<Key size={14} />} color="#7c3aed" onClick={() => openPw(e)} title="계정/비밀번호" />
                        <IconBtn icon={<Trash2 size={14} />} color="#ef4444" onClick={() => setDeleteId(e.id)} title="삭제" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 직원 추가 모달 (앱과 동일한 필드) ── */}
      {modal === 'add' && (
        <Modal title="새 직원 등록" onClose={closeModal}>
          {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 12 }}>{error}</div>}

          <FormField label="이름 *">
            <input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} style={inputStyle} placeholder="직원 이름" />
          </FormField>
          <FormField label="연락처">
            <input type="tel" value={createForm.contact} onChange={e => setCreateForm({ ...createForm, contact: e.target.value })} style={inputStyle} placeholder="010-0000-0000" />
          </FormField>
          <FormField label="아이디 *">
            <input value={createForm.username} onChange={e => setCreateForm({ ...createForm, username: e.target.value })} style={inputStyle} placeholder="로그인에 사용할 아이디" autoComplete="off" />
          </FormField>
          <FormField label="비밀번호 *">
            <input type="password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} style={inputStyle} placeholder="비밀번호" autoComplete="new-password" />
          </FormField>
          <FormField label="비밀번호 확인 *">
            <input
              type="password"
              value={createForm.confirmPassword}
              onChange={e => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
              style={{ ...inputStyle, borderColor: pwMismatch ? '#ef4444' : '#e5e7eb' }}
              placeholder="비밀번호 재입력"
              autoComplete="new-password"
            />
            {pwMismatch && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>비밀번호가 일치하지 않습니다.</p>}
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="하루 최대 작업수">
              <input type="number" min={1} max={20} value={createForm.max_daily_tasks} onChange={e => setCreateForm({ ...createForm, max_daily_tasks: parseInt(e.target.value) || 5 })} style={inputStyle} />
            </FormField>
            <FormField label="건당 단가 (원)">
              <input type="number" min={0} value={createForm.per_task_rate} onChange={e => setCreateForm({ ...createForm, per_task_rate: parseInt(e.target.value) || 0 })} style={inputStyle} />
            </FormField>
          </div>
          <FormField label="주민번호">
            <input value={createForm.resident_number} onChange={e => setCreateForm({ ...createForm, resident_number: e.target.value })} style={inputStyle} placeholder="000000-0000000" />
          </FormField>
          <FormField label="차량번호">
            <input value={createForm.vehicle_number} onChange={e => setCreateForm({ ...createForm, vehicle_number: e.target.value })} style={inputStyle} placeholder="예: 12가 3456" />
          </FormField>
          <FormField label="비고">
            <textarea value={createForm.memo} onChange={e => setCreateForm({ ...createForm, memo: e.target.value })} style={{ ...inputStyle, height: 70, resize: 'vertical' }} placeholder="특이사항" />
          </FormField>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button onClick={closeModal} style={cancelBtnStyle}>취소</button>
            <button
              onClick={handleCreate}
              disabled={saving || !createForm.name.trim() || pwMismatch}
              style={saveBtnStyle(saving || !createForm.name.trim() || pwMismatch)}
            >
              {saving ? '등록 중...' : '등록'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── 직원 수정 모달 ── */}
      {modal === 'edit' && target && (
        <Modal title={`직원 수정 — ${target.name}`} onClose={closeModal}>
          {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 12 }}>{error}</div>}

          <FormField label="이름 *">
            <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={inputStyle} placeholder="직원 이름" />
          </FormField>
          <FormField label="연락처">
            <input type="tel" value={editForm.contact} onChange={e => setEditForm({ ...editForm, contact: e.target.value })} style={inputStyle} placeholder="010-0000-0000" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="하루 최대 작업수">
              <input type="number" min={1} max={20} value={editForm.max_daily_tasks} onChange={e => setEditForm({ ...editForm, max_daily_tasks: parseInt(e.target.value) || 5 })} style={inputStyle} />
            </FormField>
            <FormField label="건당 단가 (원)">
              <input type="number" min={0} value={editForm.per_task_rate} onChange={e => setEditForm({ ...editForm, per_task_rate: parseInt(e.target.value) || 0 })} style={inputStyle} />
            </FormField>
          </div>
          <FormField label="주민번호">
            <input value={editForm.resident_number} onChange={e => setEditForm({ ...editForm, resident_number: e.target.value })} style={inputStyle} placeholder="000000-0000000" />
          </FormField>
          <FormField label="차량번호">
            <input value={editForm.vehicle_number} onChange={e => setEditForm({ ...editForm, vehicle_number: e.target.value })} style={inputStyle} placeholder="예: 12가 3456" />
          </FormField>
          <FormField label="비고">
            <textarea value={editForm.memo} onChange={e => setEditForm({ ...editForm, memo: e.target.value })} style={{ ...inputStyle, height: 70, resize: 'vertical' }} placeholder="특이사항" />
          </FormField>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button onClick={closeModal} style={cancelBtnStyle}>취소</button>
            <button onClick={handleEdit} disabled={saving || !editForm.name.trim()} style={saveBtnStyle(saving || !editForm.name.trim())}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── 계정/비밀번호 모달 ── */}
      {modal === 'pw' && target && (
        <Modal title={`계정 관리 — ${target.name}`} onClose={closeModal}>
          {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 12 }}>{error}</div>}
          {!target.username && (
            <FormField label="아이디">
              <input value={pwForm.username} onChange={e => setPwForm({ ...pwForm, username: e.target.value })} style={inputStyle} placeholder="로그인 아이디" />
            </FormField>
          )}
          <FormField label={target.username ? '새 비밀번호' : '비밀번호'}>
            <input type="password" value={pwForm.password} onChange={e => setPwForm({ ...pwForm, password: e.target.value })} style={inputStyle} placeholder="비밀번호 입력" />
          </FormField>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={closeModal} style={cancelBtnStyle}>취소</button>
            <button onClick={handlePwSave} disabled={saving || !pwForm.password.trim()} style={saveBtnStyle(saving || !pwForm.password.trim())}>
              {saving ? '처리 중...' : target.username ? '비밀번호 변경' : '계정 생성'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── 삭제 확인 ── */}
      {deleteId && (
        <Modal title="직원 삭제" onClose={() => setDeleteId(null)}>
          <p style={{ fontSize: 14, color: '#374151', marginBottom: 20 }}>이 직원을 삭제하시겠습니까?</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setDeleteId(null)} style={cancelBtnStyle}>취소</button>
            <button onClick={handleDelete} style={{ ...saveBtnStyle(false), background: '#ef4444' }}>삭제</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function IconBtn({ icon, color, onClick, title }: { icon: React.ReactNode; color: string; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', color, cursor: 'pointer' }}>
      {icon}
    </button>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 480, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const cancelBtnStyle: React.CSSProperties = { padding: '9px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }
const saveBtnStyle = (disabled: boolean): React.CSSProperties => ({ padding: '9px 20px', border: 'none', borderRadius: 8, background: disabled ? '#9ca3af' : BRAND, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', color: '#fff' })
