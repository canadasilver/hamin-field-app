import { create } from 'zustand'
import type { Station, Employee, Schedule } from '../types'

interface AppState {
  // 기지국
  stations: Station[]
  setStations: (stations: Station[]) => void

  // 직원
  employees: Employee[]
  setEmployees: (employees: Employee[]) => void

  // 일정
  schedules: Schedule[]
  setSchedules: (schedules: Schedule[]) => void

  // 선택된 날짜
  selectedDate: string
  setSelectedDate: (date: string) => void

  // 선택된 직원
  selectedEmployeeId: string | null
  setSelectedEmployeeId: (id: string | null) => void
}

const today = new Date().toISOString().split('T')[0]

export const useStore = create<AppState>((set) => ({
  stations: [],
  setStations: (stations) => set({ stations }),

  employees: [],
  setEmployees: (employees) => set({ employees }),

  schedules: [],
  setSchedules: (schedules) => set({ schedules }),

  selectedDate: today,
  setSelectedDate: (date) => set({ selectedDate: date }),

  selectedEmployeeId: null,
  setSelectedEmployeeId: (id) => set({ selectedEmployeeId: id }),
}))
