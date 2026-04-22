import { useEffect, useRef, useState } from 'react'
import {
  Upload, FileSpreadsheet, Trash2, CheckCircle2,
  AlertCircle, Eye, Loader2, FolderOpen
} from 'lucide-react'
import { fileApi } from '../../services/api'
import type { UploadedFile } from '../../types'

const BRAND = '#215288'

interface UploadResult {
  total: number
  success: number
  failed: number
  sheet_used?: string
  header_row?: number
  errors?: { row: number; error: string }[]
}

export default function AdminUpload() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [filesLoading, setFilesLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<UploadedFile | null>(null)
  const [error, setError] = useState('')

  const loadFiles = async () => {
    try {
      const res = await fileApi.list()
      setFiles(res.data)
    } catch {
      setError('파일 목록을 불러오지 못했습니다.')
    } finally {
      setFilesLoading(false)
    }
  }

  useEffect(() => { loadFiles() }, [])

  const doUpload = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('.xlsx 또는 .xls 파일만 업로드 가능합니다.')
      return
    }
    setUploading(true)
    setResult(null)
    setError('')
    try {
      const res = await fileApi.upload(file)
      setResult(res.data)
      await loadFiles()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof msg === 'string' ? msg : '업로드에 실패했습니다.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) doUpload(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) doUpload(file)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await fileApi.delete(deleteTarget.id)
      setDeleteTarget(null)
      await loadFiles()
    } catch {
      setError('삭제에 실패했습니다.')
    }
  }

  const formatDate = (d: string) => {
    const dt = new Date(d)
    return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* 왼쪽: 업로드 영역 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 드래그앤드롭 영역 */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !uploading && fileRef.current?.click()}
            style={{
              background: dragging ? '#eff6ff' : '#fff',
              border: `2px dashed ${dragging ? BRAND : '#d1d5db'}`,
              borderRadius: 16,
              padding: '48px 32px',
              textAlign: 'center',
              cursor: uploading ? 'not-allowed' : 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            {uploading ? (
              <div>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Loader2 size={28} color={BRAND} style={{ animation: 'spin 0.8s linear infinite' }} />
                </div>
                <p style={{ fontSize: 16, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>업로드 중...</p>
                <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>잠시만 기다려주세요</p>
              </div>
            ) : (
              <div>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: dragging ? '#dbeafe' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', transition: 'background 0.15s' }}>
                  {dragging
                    ? <Upload size={28} color={BRAND} />
                    : <FileSpreadsheet size={28} color="#9ca3af" />
                  }
                </div>
                <p style={{ fontSize: 16, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>
                  {dragging ? '여기에 놓으세요' : '엑셀 파일을 드래그하거나 클릭하여 선택'}
                </p>
                <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px' }}>.xlsx, .xls 파일 지원</p>
                <button
                  onClick={e => { e.stopPropagation(); fileRef.current?.click() }}
                  style={{
                    padding: '10px 24px', background: BRAND, color: '#fff',
                    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  파일 선택
                </button>
              </div>
            )}
          </div>

          {/* 필수 컬럼 안내 */}
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: '#111827' }}>엑셀 필수 컬럼</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
              {['기지국명', '담당자', '연락처', '주소', '작업내용'].map(col => (
                <div key={col} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND, flexShrink: 0 }} />
                  {col}
                </div>
              ))}
            </div>
          </div>

          {/* 업로드 결과 */}
          {error && (
            <div style={{ padding: '12px 16px', background: '#fef2f2', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>
            </div>
          )}

          {result && (
            <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <CheckCircle2 size={18} color="#10b981" />
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#111827' }}>업로드 완료</h3>
              </div>

              {(result.sheet_used || result.header_row) && (
                <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: '8px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
                  {result.sheet_used && <span>시트: <strong style={{ color: '#374151' }}>{result.sheet_used}</strong></span>}
                  {result.header_row && <span>헤더 행: <strong style={{ color: '#374151' }}>{result.header_row}행</strong></span>}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[
                  { label: '전체', value: result.total, color: '#374151', bg: '#f3f4f6' },
                  { label: '성공', value: result.success, color: '#059669', bg: '#d1fae5' },
                  { label: '실패', value: result.failed, color: '#dc2626', bg: '#fee2e2' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', padding: '12px 8px', background: s.bg, borderRadius: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {result.errors && result.errors.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>
                    오류 목록 ({result.errors.length}건)
                  </p>
                  <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {result.errors.map((e, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: '#fef2f2', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>
                        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>행 {e.row}: {e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 오른쪽: 업로드된 파일 목록 */}
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderOpen size={18} color={BRAND} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>업로드된 파일</h3>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>{files.length}개</span>
          </div>

          {filesLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>로딩 중...</div>
          ) : files.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <FileSpreadsheet size={36} color="#d1d5db" style={{ margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>업로드된 파일이 없습니다</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {files.map((f, idx) => (
                <div
                  key={f.id}
                  style={{
                    padding: '14px 20px',
                    borderBottom: idx < files.length - 1 ? '1px solid #f3f4f6' : 'none',
                    display: 'flex', alignItems: 'center', gap: 14
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileSpreadsheet size={20} color="#16a34a" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.filename}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                      {formatDate(f.upload_date)} · 기지국 {f.total_count}개
                    </div>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(f)}
                    title="삭제"
                    style={{
                      width: 30, height: 30, border: '1px solid #fee2e2', borderRadius: 6,
                      background: '#fff', color: '#ef4444', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 420, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>파일 삭제</h3>
            <p style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>
              <strong>{deleteTarget.filename}</strong>
            </p>
            <p style={{ fontSize: 13, color: '#dc2626', marginBottom: 24 }}>
              이 파일과 연결된 기지국 데이터 {deleteTarget.total_count}개가 모두 삭제됩니다.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{ padding: '9px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#fff' }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
