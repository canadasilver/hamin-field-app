import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/common/Header'
import { fileApi } from '../services/api'
import { Plus, FileSpreadsheet, Trash2, Eye, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { UploadedFile } from '../types'

export default function FilesPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UploadedFile | null>(null)

  useEffect(() => {
    loadFiles()
  }, [])

  const loadFiles = async () => {
    try {
      const res = await fileApi.list()
      setFiles(res.data)
    } catch {
      toast.error('파일 목록 로딩 실패')
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await fileApi.upload(file)
      const d = res.data
      const info = d.sheet_used ? ` (시트: ${d.sheet_used}, ${d.header_row}행)` : ''
      toast.success(`${d.success}건 업로드 완료${info}`)
      loadFiles()
    } catch (err: any) {
      const msg = err?.response?.data?.detail
      toast.error(typeof msg === 'string' ? msg : '업로드 실패')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await fileApi.delete(deleteTarget.id)
      toast.success('삭제되었습니다')
      setDeleteTarget(null)
      loadFiles()
    } catch {
      toast.error('삭제 실패')
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header title="파일 관리" />
      <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" />

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* 업로드 버튼 */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-kt-red text-white rounded-2xl font-medium disabled:opacity-50"
        >
          {uploading ? (
            <><Loader2 size={18} className="animate-spin" /> 업로드 중...</>
          ) : (
            <><Plus size={18} /> 새 엑셀 파일 업로드</>
          )}
        </button>

        {/* 파일 목록 */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">로딩중...</div>
        ) : files.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <FileSpreadsheet size={48} className="mx-auto mb-3 opacity-30" />
            <p>업로드된 파일이 없습니다</p>
            <p className="text-sm mt-1">엑셀 파일을 업로드하세요</p>
          </div>
        ) : (
          files.map((f) => (
            <div key={f.id} className="bg-white rounded-2xl p-4 border border-gray-100">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet size={20} className="text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{f.filename}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(f.upload_date)} &middot; {f.total_count}개 기지국
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => navigate(`/files/${f.id}/stations`)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-50 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-100"
                >
                  <Eye size={15} /> 보기
                </button>
                <button
                  onClick={() => setDeleteTarget(f)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100"
                >
                  <Trash2 size={15} /> 삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 삭제 확인 팝업 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-gray-900 text-lg mb-2">파일 삭제</h3>
            <p className="text-sm text-gray-600 mb-1">
              <span className="font-medium">{deleteTarget.filename}</span>
            </p>
            <p className="text-sm text-red-500 mb-6">
              이 파일과 연결된 {deleteTarget.total_count}개 기지국 데이터가 모두 삭제됩니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-medium"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
