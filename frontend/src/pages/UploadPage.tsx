import { useState, useRef } from 'react'
import Header from '../components/common/Header'
import { fileApi } from '../services/api'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function UploadPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setResult(null)

    try {
      const res = await fileApi.upload(file)
      setResult(res.data)
      toast.success(`${res.data.success}건 업로드 완료`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '업로드 실패')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header title="엑셀 업로드" />

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* 업로드 영역 */}
        <div
          onClick={() => fileRef.current?.click()}
          className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center cursor-pointer hover:border-kt-red/40 transition-colors"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleUpload}
            className="hidden"
          />
          {uploading ? (
            <div className="animate-pulse">
              <div className="w-12 h-12 rounded-full bg-kt-red/10 flex items-center justify-center mx-auto mb-3">
                <Upload size={24} className="text-kt-red animate-bounce" />
              </div>
              <p className="text-gray-500">업로드 중...</p>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <FileSpreadsheet size={24} className="text-gray-400" />
              </div>
              <p className="font-medium text-gray-700">엑셀 파일을 선택하세요</p>
              <p className="text-sm text-gray-400 mt-1">.xlsx, .xls 파일 지원</p>
            </>
          )}
        </div>

        {/* 필수 컬럼 안내 */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-3">필수 컬럼</h3>
          <div className="space-y-2">
            {['기지국명', '담당자', '연락처', '주소', '작업내용'].map((col) => (
              <div key={col} className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-1.5 h-1.5 rounded-full bg-kt-red" />
                {col}
              </div>
            ))}
          </div>
        </div>

        {/* 업로드 결과 */}
        {result && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-3">업로드 결과</h3>
            {(result.sheet_used || result.header_row) && (
              <div className="flex gap-3 mb-3 text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg">
                {result.sheet_used && <span>시트: <b className="text-gray-700">{result.sheet_used}</b></span>}
                {result.header_row && <span>헤더 행: <b className="text-gray-700">{result.header_row}행</b></span>}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center p-3 bg-gray-50 rounded-xl">
                <p className="text-xl font-bold text-gray-900">{result.total}</p>
                <p className="text-xs text-gray-500">전체</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-xl">
                <p className="text-xl font-bold text-green-600">{result.success}</p>
                <p className="text-xs text-gray-500">성공</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-xl">
                <p className="text-xl font-bold text-red-600">{result.failed}</p>
                <p className="text-xs text-gray-500">실패</p>
              </div>
            </div>

            {result.errors?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-red-500">오류 목록:</p>
                {result.errors.map((err: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-500 bg-red-50 p-2 rounded-lg">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>행 {err.row}: {err.error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
