import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Users, CalendarDays,
  ClipboardList, Wind, ChevronLeft, ChevronRight, LogOut, Menu
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  { path: '/admin', label: '대시보드', icon: LayoutDashboard, end: true },
  { path: '/admin/stations', label: '기지국 관리', icon: Building2 },
  { path: '/admin/employees', label: '직원 관리', icon: Users },
  { path: '/admin/schedule', label: '일정 관리', icon: CalendarDays },
  { path: '/admin/checklist', label: 'A/S 체크리스트', icon: ClipboardList },
  { path: '/admin/cooling', label: '냉방기 관리', icon: Wind },
]

const PAGE_TITLES: Record<string, string> = {
  '/admin': '대시보드',
  '/admin/stations': '기지국 관리',
  '/admin/employees': '직원 관리',
  '/admin/schedule': '일정 관리',
  '/admin/checklist': 'A/S 체크리스트',
  '/admin/cooling': '냉방기 관리',
}

const BRAND = '#215288'

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const pageTitle = PAGE_TITLES[location.pathname] ?? '관리자'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const sidebarW = collapsed ? 64 : 220

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarW, minHeight: '100vh', background: BRAND, color: '#fff',
        display: 'flex', flexDirection: 'column', transition: 'width 0.2s', flexShrink: 0,
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100, overflow: 'hidden'
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
            📡
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>하민공조</div>
              <div style={{ fontSize: 11, opacity: 0.7, whiteSpace: 'nowrap' }}>관리자 콘솔</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {NAV_ITEMS.map(({ path, label, icon: Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8, marginBottom: 4,
                textDecoration: 'none', color: '#fff',
                background: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
                fontWeight: isActive ? 600 : 400, fontSize: 14,
                whiteSpace: 'nowrap', overflow: 'hidden',
                transition: 'background 0.15s'
              })}
            >
              <Icon size={18} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          {!collapsed && user && (
            <div style={{ padding: '8px 12px', fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>{user.name}</div>
              <div style={{ opacity: 0.7 }}>{user.email}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, width: '100%',
              background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
              cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden'
            }}
          >
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {!collapsed && <span>로그아웃</span>}
          </button>
        </div>

        {/* Toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            position: 'absolute', top: 20, right: -12,
            width: 24, height: 24, borderRadius: '50%',
            background: '#fff', border: `2px solid ${BRAND}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: BRAND, zIndex: 101
          }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, marginLeft: sidebarW, display: 'flex', flexDirection: 'column', transition: 'margin-left 0.2s', minWidth: 0 }}>
        {/* Header */}
        <header style={{
          background: '#fff', borderBottom: '1px solid #e5e7eb',
          padding: '0 24px', height: 56, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Menu size={20} color="#6b7280" style={{ cursor: 'pointer' }} onClick={() => setCollapsed(c => !c)} />
            <h1 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: 0 }}>{pageTitle}</h1>
          </div>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: BRAND,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 13, fontWeight: 700
          }}>
            {user?.name?.charAt(0) ?? 'A'}
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
