import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { LogIn } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      toast.error('아이디와 비밀번호를 입력하세요')
      return
    }
    setLoading(true)
    try {
      await login(username.trim(), password)
      const saved = localStorage.getItem('user')
      const user = saved ? JSON.parse(saved) : null
      if (user?.role === 'admin') {
        navigate('/', { replace: true })
      } else {
        navigate('/today', { replace: true })
      }
      toast.success('로그인 성공')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || '로그인 실패'
      toast.error(typeof msg === 'string' ? msg : '로그인 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* 로고 영역 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-kt-red rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">KT</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">KT 현장관리 시스템</h1>
          <p className="text-sm text-gray-500 mt-1">기지국 A/S 작업 관리</p>
        </div>

        {/* 로그인 폼 */}
        <form onSubmit={handleLogin} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">아이디</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디 입력"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30 focus:border-kt-red"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30 focus:border-kt-red"
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 bg-kt-red text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span>로그인 중...</span>
            ) : (
              <>
                <LogIn size={18} />
                <span>로그인</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
