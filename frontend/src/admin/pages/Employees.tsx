import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Key } from 'lucide-react'
import { employeeApi } from '../../services/api'
import type { Employee } from '../../types'

const BRAND = '#215288'

interface EmpForm {
  name: string
  contact: string
  max_daily_tasks: number
  per_task_rate: number
  vehicle_number: string
  memo: string
  is_active: boolean
}

const EMPTY_FORM: EmpForm = { name: '', contact: '', max_daily_tasks: 5, per_task_rate: 0, vehicle_number: '', memo: '', is_active: true }

interface PwForm { username: string; password: string }

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | 'pw' | null>(null)
  const [target, setTarget] = useState<Employee | null>(null)
  const [form, setForm] = useState<EmpForm>(EMPTY_FORM)
  const [pwForm, setPwForm] = useState<PwForm>({ username: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

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

  const openAdd = () => { setForm(EMPTY_FORM); setTarget(null); setModal('add') }
  const openEdit = (e: Employee) => {
    setForm({ name: e.name, contact: e.contact, max_daily_tasks: e.max_daily_tasks, per_task_rate: e.per_task_rate, vehicle_number: e.vehicle_number ?? '', memo: e.memo ?? '', is_active: e.is_active })
    setTarget(e); setModal('edit')
  }
  const openPw = (e: Employee) => { setPwForm({ username: e.username ?? '', password: '' }); setTarget(e); setModal('pw') }
  const closeModal = () => { setModal(null); setTarget(null) }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (modal === 'add') await employeeApi.create(form)
      else if (modal === 'edit' && target) await employeeApi.update(target.id, form)
      await load()
      closeModal()
    } catch {
      setError('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

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

      {error && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>{error}</div>}

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

      {/* Add/Edit Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? '직원 추가' : '직원 수정'} onClose={closeModal}>
          <FormField label="이름 *">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="직원 이름" />
          </FormField>
          <FormField label="연락처">
            <input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} style={inputStyle} placeholder="010-0000-0000" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="하루 최대 작업">
              <input type="number" value={form.max_daily_tasks} onChange={e => setForm({ ...form, max_daily_tasks: Number(e.target.value) })} style={inputStyle} min={1} max={20} />
            </FormField>
            <FormField label="건당 단가 (원)">
              <input type="number" value={form.per_task_rate} onChange={e => setForm({ ...form, per_task_rate: Number(e.target.value) })} style={inputStyle} min={0} />
            </FormField>
          </div>
          <FormField label="차량번호">
            <input value={form.vehicle_number} onChange={e => setForm({ ...form, vehicle_number: e.target.value })} style={inputStyle} placeholder="12가 3456" />
          </FormField>
          <FormField label="메모">
            <textarea value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} style={{ ...inputStyle, height: 70, resize: 'vertical' }} placeholder="특이사항" />
          </FormField>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
            <label htmlFor="is_active" style={{ fontSize: 13, cursor: 'pointer' }}>활성 직원</label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={closeModal} style={cancelBtnStyle}>취소</button>
            <button onClick={handleSave} disabled={saving || !form.name.trim()} style={saveBtnStyle(saving || !form.name.trim())}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </Modal>
      )}

      {/* Password Modal */}
      {modal === 'pw' && target && (
        <Modal title={`계정 관리 — ${target.name}`} onClose={closeModal}>
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

      {/* Delete Confirm */}
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
const saveBtnStyle = (disabled: boolean): React.CSSProperties => ({ padding: '9px 20px', border: 'none', borderRadius: 8, background: disabled ? '#9ca3af' : '#215288', fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', color: '#fff' })
