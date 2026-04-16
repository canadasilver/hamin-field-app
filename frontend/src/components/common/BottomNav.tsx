import { useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Building2,
  CalendarCheck,
  FolderOpen,
  Home,
  LogOut,
  MapPin,
  Shuffle,
  Users,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const adminNavItems = [
  { path: '/', icon: Home, label: '홈' },
  { path: '/assignment', icon: Shuffle, label: '배정' },
  { path: '/map', icon: MapPin, label: '지도' },
  { path: '/employees', icon: Users, label: '직원' },
  { path: '/files', icon: FolderOpen, label: '파일' },
  { path: '/dashboard', icon: BarChart3, label: '대시보드' },
]

const employeeNavItems = [
  { path: '/today', icon: CalendarCheck, label: '홈' },
  { path: '/stations', icon: Building2, label: '기지국' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  if (!user) return null

  const navItems = user.role === 'admin' ? adminNavItems : employeeNavItems
  const columnCount = navItems.length + 1

  return (
    <nav className="safe-area-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white">
      <div
        className="mx-auto grid h-16 max-w-lg items-center"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path

          return (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-1 px-2 py-2 transition-colors ${
                active ? 'text-kt-red' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => {
            logout()
            navigate('/login', { replace: true })
          }}
          className="flex flex-col items-center gap-1 px-2 py-2 text-gray-400 transition-colors hover:text-gray-600"
        >
          <LogOut size={22} strokeWidth={2} />
          <span className="text-xs font-medium">로그아웃</span>
        </button>
      </div>
    </nav>
  )
}
