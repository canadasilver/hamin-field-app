import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import BottomNav from './components/common/BottomNav'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import MapPage from './pages/MapPage'
import EmployeesPage from './pages/EmployeesPage'
import FilesPage from './pages/FilesPage'
import StationListPage from './pages/StationListPage'
import DashboardPage from './pages/DashboardPage'
import ScheduleDetailPage from './pages/ScheduleDetailPage'
import TodayPage from './pages/TodayPage'
import AssignmentPage from './pages/AssignmentPage'

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">로딩중...</div>
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'admin' ? '/' : '/today'} replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">로딩중...</div>
  }

  return (
    <div className="max-w-lg mx-auto bg-white min-h-screen shadow-sm">
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to={user.role === 'admin' ? '/' : '/today'} replace /> : <LoginPage />}
        />

        {/* 관리자 전용 */}
        <Route path="/" element={<ProtectedRoute allowedRoles={['admin']}><HomePage /></ProtectedRoute>} />
        <Route path="/map" element={<ProtectedRoute allowedRoles={['admin']}><MapPage /></ProtectedRoute>} />
        <Route path="/employees" element={<ProtectedRoute allowedRoles={['admin']}><EmployeesPage /></ProtectedRoute>} />
        <Route path="/files" element={<ProtectedRoute allowedRoles={['admin']}><FilesPage /></ProtectedRoute>} />
        <Route path="/files/:fileId/stations" element={<ProtectedRoute allowedRoles={['admin']}><StationListPage /></ProtectedRoute>} />
        <Route path="/assignment" element={<ProtectedRoute allowedRoles={['admin']}><AssignmentPage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin']}><DashboardPage /></ProtectedRoute>} />

        {/* 직원 전용 */}
        <Route path="/today" element={<ProtectedRoute allowedRoles={['employee']}><TodayPage /></ProtectedRoute>} />

        {/* 공통 */}
        <Route path="/schedule/:id" element={<ProtectedRoute><ScheduleDetailPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to={user ? (user.role === 'admin' ? '/' : '/today') : '/login'} replace />} />
      </Routes>
      {user && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 2000,
            style: { fontSize: '14px', borderRadius: '12px' },
          }}
        />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
