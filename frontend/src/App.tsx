import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import BottomNav from './components/common/BottomNav'
import AssignmentPage from './pages/AssignmentPage'
import DashboardPage from './pages/DashboardPage'
import EmployeesPage from './pages/EmployeesPage'
import FilesPage from './pages/FilesPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import MapPage from './pages/MapPage'
import ScheduleDetailPage from './pages/ScheduleDetailPage'
import StationListPage from './pages/StationListPage'
import TodayPage from './pages/TodayPage'
import AdminGuard from './admin/AdminGuard'
import AdminLayout from './admin/AdminLayout'
import AdminDashboard from './admin/pages/Dashboard'
import AdminStations from './admin/pages/Stations'
import AdminEmployees from './admin/pages/Employees'
import AdminSchedule from './admin/pages/Schedule'
import AdminASChecklist from './admin/pages/ASChecklist'
import AdminAssign from './admin/pages/Assign'
import AdminScheduleView from './admin/pages/ScheduleView'
import AdminUpload from './admin/pages/Upload'

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-gray-400">로딩 중...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'admin' ? '/' : '/today'} replace />
  }

  return <>{children}</>
}

function MobileRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-gray-400">로딩 중...</div>
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-white shadow-sm">
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to={user.role === 'admin' ? '/' : '/today'} replace /> : <LoginPage />}
        />

        <Route path="/" element={<ProtectedRoute allowedRoles={['admin']}><HomePage /></ProtectedRoute>} />
        <Route path="/map" element={<ProtectedRoute allowedRoles={['admin']}><MapPage /></ProtectedRoute>} />
        <Route path="/employees" element={<ProtectedRoute allowedRoles={['admin']}><EmployeesPage /></ProtectedRoute>} />
        <Route path="/files" element={<ProtectedRoute allowedRoles={['admin']}><FilesPage /></ProtectedRoute>} />
        <Route path="/files/:fileId/stations" element={<ProtectedRoute allowedRoles={['admin']}><StationListPage /></ProtectedRoute>} />
        <Route path="/assignment" element={<ProtectedRoute allowedRoles={['admin']}><AssignmentPage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin']}><DashboardPage /></ProtectedRoute>} />

        <Route path="/today" element={<ProtectedRoute allowedRoles={['employee']}><TodayPage /></ProtectedRoute>} />
        <Route path="/stations" element={<ProtectedRoute allowedRoles={['employee']}><StationListPage /></ProtectedRoute>} />
        <Route path="/schedule/:id" element={<ProtectedRoute><ScheduleDetailPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to={user ? (user.role === 'admin' ? '/' : '/today') : '/login'} replace />} />
      </Routes>

      {user && <BottomNav />}
    </div>
  )
}

function AppRoutes() {
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')

  if (isAdmin) {
    return (
      <Routes>
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <AdminLayout />
            </AdminGuard>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="stations" element={<AdminStations />} />
          <Route path="employees" element={<AdminEmployees />} />
          <Route path="schedule" element={<AdminSchedule />} />
          <Route path="checklist" element={<AdminASChecklist />} />
          <Route path="assign" element={<AdminAssign />} />
          <Route path="schedule-view" element={<AdminScheduleView />} />
          <Route path="upload" element={<AdminUpload />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    )
  }

  return <MobileRoutes />
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
