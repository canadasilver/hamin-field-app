import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// 요청 시 토큰 자동 첨부
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 응답 시 로그인 페이지로 이동
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

// --- 인증 ---
export const authApi = {
  login: (data: { username: string; password: string }) =>
    api.post('/auth/login', data),
  signup: (data: { email: string; password: string; name: string; role: string; employee_id?: string }) =>
    api.post('/auth/signup', data),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
}

// --- 파일 관리 ---
export const fileApi = {
  list: () => api.get('/stations/files'),
  delete: (id: string) => api.delete(`/stations/files/${id}`),
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/stations/upload-excel', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// --- 기지국 ---
export const stationApi = {
  list: (params?: { file_id?: string; search?: string; region?: string; team?: string; limit?: number; offset?: number }) =>
    api.get('/stations/', { params }),
  get: (id: string) => api.get(`/stations/${id}`),
  filters: (fileId?: string) =>
    api.get('/stations/filters', { params: fileId ? { file_id: fileId } : {} }),
  count: (fileId?: string) =>
    api.get('/stations/count', { params: fileId ? { file_id: fileId } : {} }),
  delete: (id: string) => api.delete(`/stations/${id}`),
  geocodeMissing: () => api.post('/stations/geocode-missing'),
}

// --- 직원 ---
export const employeeApi = {
  list: (activeOnly = true) =>
    api.get('/employees/', { params: { active_only: activeOnly } }),
  create: (data: any) => api.post('/employees/', data),
  update: (id: string, data: any) => api.patch(`/employees/${id}`, data),
  delete: (id: string) => api.delete(`/employees/${id}`),
  getUnavailableDates: (id: string) =>
    api.get(`/employees/${id}/unavailable-dates`),
  addUnavailableDate: (id: string, data: any) =>
    api.post(`/employees/${id}/unavailable-dates`, data),
  removeUnavailableDate: (employeeId: string, dateId: string) =>
    api.delete(`/employees/${employeeId}/unavailable-dates/${dateId}`),
  getAccount: (id: string) => api.get(`/employees/${id}/account`),
  createAccount: (id: string, data: { username: string; password: string }) =>
    api.post(`/employees/${id}/create-account`, data),
  resetPassword: (id: string, newPassword: string) =>
    api.post(`/employees/${id}/reset-password`, { new_password: newPassword }),
}

// --- 일정 ---
export const scheduleApi = {
  list: (params?: { employee_id?: string; scheduled_date?: string; status?: string }) =>
    api.get('/schedules/', { params }),
  create: (data: any) => api.post('/schedules/', data),
  update: (id: string, data: any) => api.patch(`/schedules/${id}`, data),
  postpone: (id: string) => api.post(`/schedules/${id}/postpone`),
  cancelComplete: (id: string) => api.post(`/schedules/${id}/cancel-complete`),
  reassign: (id: string, data: { employee_id: string; scheduled_date: string }) =>
    api.post(`/schedules/${id}/reassign`, data),
  optimizeRoute: (employeeId: string, date: string, currentLat?: number, currentLng?: number) =>
    api.post('/schedules/optimize-route', null, {
      params: {
        employee_id: employeeId,
        scheduled_date: date,
        ...(currentLat != null ? { current_lat: currentLat } : {}),
        ...(currentLng != null ? { current_lng: currentLng } : {}),
      },
    }),
  gpsEvent: (data: {
    schedule_id: string
    employee_id: string
    lat: number
    lng: number
    event_type: string
  }) => api.post('/schedules/gps-event', null, { params: data }),
}

// --- 체크리스트 ---
export const checklistApi = {
  get: (scheduleId: string) => api.get(`/checklists/${scheduleId}`),
  update: (scheduleId: string, data: any) =>
    api.patch(`/checklists/${scheduleId}`, data),
}

// --- 대시보드 ---
export const dashboardApi = {
  summary: (month?: string) =>
    api.get('/dashboard/summary', { params: month ? { month } : {} }),
  employeeStats: (month?: string) =>
    api.get('/dashboard/employee-stats', { params: month ? { month } : {} }),
  weeklyChart: () => api.get('/dashboard/weekly-chart'),
  taskList: (month?: string, status?: string) =>
    api.get('/dashboard/task-list', { params: { ...(month ? { month } : {}), ...(status ? { status } : {}) } }),
  annual: (year: number) =>
    api.get('/dashboard/annual', { params: { year } }),
  monthly: (year: number, month: number) =>
    api.get('/dashboard/monthly', { params: { year, month } }),
  daily: (date: string) =>
    api.get('/dashboard/daily', { params: { date } }),
  tasks: (params: { year?: number; month?: string; date?: string; status?: string }) =>
    api.get('/dashboard/tasks', { params }),
}

// --- 배분 ---
export const assignmentApi = {
  preview: (data: {
    start_date: string
    end_date: string
    employee_ids: string[]
    file_id?: string
  }) => api.post('/assignments/preview', data),
  confirm: (items: {
    station_id: string
    employee_id: string
    scheduled_date: string
    sort_order: number
  }[]) => api.post('/assignments/confirm', { items }),
  reassign: (data: {
    station_id: string
    new_employee_id: string
    scheduled_date: string
  }) => api.post('/assignments/reassign', data),
  updateCoords: (items: { station_id: string; lat: number; lng: number }[]) =>
    api.post('/assignments/update-coords', { items }),
  status: () => api.get('/assignments/status'),
  cancel: (fileId?: string) =>
    api.delete('/assignments/cancel', { params: fileId ? { file_id: fileId } : {} }),
  employeeExisting: (employeeIds: string[], startDate: string, endDate: string) =>
    api.get('/assignments/employee-existing', {
      params: { employee_ids: employeeIds.join(','), start_date: startDate, end_date: endDate },
    }),
}

export default api
