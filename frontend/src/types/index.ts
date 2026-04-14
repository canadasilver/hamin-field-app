export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'employee'
  employee_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UploadedFile {
  id: string
  filename: string
  upload_date: string
  total_count: number
  uploaded_by: string | null
  created_at: string
}

export interface CoolingInfo {
  capacity: string | null
  manufacturer: string | null
  acquired: string | null
}

export interface CoolingUnit {
  id: string
  station_id: string
  unit_number: number
  capacity: string | null
  manufacturer: string | null
  acquisition_date: string | null
  created_at: string
  updated_at: string
}

export interface Station {
  id: string
  file_id: string | null
  no: number | null
  unique_no: string | null
  network_group: string | null
  location_code: string | null
  equipment_type: string | null
  station_id: string | null
  station_name: string
  indoor_outdoor: string | null
  operation_count: number | null
  cooling_info: CoolingInfo[] | null
  barcode: string | null
  work_2024: string | null
  work_2025: string | null
  defect: string | null
  operation_team: string | null
  manager: string | null
  contact: string | null
  address: string | null
  building_name: string | null
  planned_process: string | null
  inspector: string | null
  inspection_target: string | null
  inspection_result: string | null
  inspection_date: string | null
  registration_status: string | null
  registration_date: string | null
  lat: number | null
  lng: number | null
  status: string
  created_at: string
  updated_at: string
}

export interface Employee {
  id: string
  name: string
  contact: string
  username: string | null
  max_daily_tasks: number
  per_task_rate: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UnavailableDate {
  id: string
  employee_id: string
  unavailable_date: string
  reason: string | null
}

export interface Schedule {
  id: string
  station_id: string
  employee_id: string
  scheduled_date: string
  sort_order: number
  status: 'pending' | 'in_progress' | 'completed' | 'postponed'
  started_at: string | null
  completed_at: string | null
  postponed_to: string | null
  created_at: string
  updated_at: string
  stations?: Station
}

export interface Checklist {
  id: string
  schedule_id: string
  item_1: boolean
  item_1_label: string
  item_2: boolean
  item_2_label: string
  item_3: boolean
  item_3_label: string
  item_4: boolean
  item_4_label: string
  item_5: boolean
  item_5_label: string
  notes: string | null
  photo_urls: string[] | null
  created_at: string
  updated_at: string
}

export interface DashboardSummary {
  month: string
  tasks: {
    pending: number
    in_progress: number
    completed: number
    postponed: number
  }
  total: number
  completion_rate: number
  today: string
  today_tasks: {
    pending: number
    in_progress: number
    completed: number
    postponed: number
  }
  today_total: number
  stations: {
    pending: number
    assigned: number
    completed: number
  }
  stations_total: number
}

export interface EmployeeStat {
  employee_id: string
  name: string
  total_tasks: number
  completed_tasks: number
  pending_tasks: number
  completion_rate: number
  per_task_rate: number
  monthly_pay: number
}

export interface WeeklyChart {
  date: string
  total: number
  completed: number
}

export interface AssignmentStation {
  station_id: string
  station_name: string
  address: string
  lat: number
  lng: number
  scheduled_date: string
  sort_order: number
}

export interface AssignmentGroup {
  employee_id: string
  employee_name: string
  color: string
  stations: AssignmentStation[]
}

export interface AssignmentPreview {
  assignments: AssignmentGroup[]
  unassigned: Station[]
  stats: {
    total: number
    assigned: number
    no_coords: number
  }
  geocoded_count: number
  fallback_count: number
}
