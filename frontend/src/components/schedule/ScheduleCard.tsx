import { useState } from 'react'
import { MapPin, Clock, ChevronRight, CalendarX2, Navigation, CheckCircle2, RefreshCw } from 'lucide-react'
import StatusBadge from '../common/StatusBadge'
import ReassignModal from './ReassignModal'
import type { Schedule } from '../../types'
import { scheduleApi } from '../../services/api'
import toast from 'react-hot-toast'

const FALLBACK_COORDS = new Set([
  '37.5665,126.978', '37.4563,126.7052', '37.4138,127.5183',
  '37.8228,128.1555', '36.6357,127.4912', '36.6588,126.6728',
  '36.3504,127.3845', '36.48,127.26', '35.8203,127.1088',
  '34.8679,126.991', '35.1595,126.8526', '36.4919,128.8889',
  '35.4606,128.2132', '35.8714,128.6014', '35.5384,129.3114',
  '35.1796,129.0756', '33.489,126.4983',
])

function isFallbackCoord(lat: number, lng: number): boolean {
  return FALLBACK_COORDS.has(`${lat},${lng}`)
}

// 상태별 스타일
const STATUS_STYLES: Record<string, { bg: string; circle: string }> = {
  pending:     { bg: 'bg-white',             circle: 'bg-[#E53935]' },
  in_progress: { bg: 'bg-[#F0F7FF]',        circle: 'bg-[#1976D2]' },
  completed:   { bg: 'bg-[#F1F8F1]',        circle: 'bg-[#4CAF50]' },
  postponed:   { bg: 'bg-orange-50',         circle: 'bg-orange-500' },
}

interface ScheduleCardProps {
  schedule: Schedule
  displayOrder: number
  isAdmin?: boolean
  onPostpone?: () => void
  onReassigned?: (newDate: string) => void
  onClick?: () => void
}

export default function ScheduleCard({ schedule, displayOrder, isAdmin, onPostpone, onReassigned, onClick }: ScheduleCardProps) {
  const station = schedule.stations
  const style = STATUS_STYLES[schedule.status] || STATUS_STYLES.pending
  const [showReassign, setShowReassign] = useState(false)

  const handlePostpone = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('이 일정을 내일로 미루시겠습니까?')) return
    try {
      await scheduleApi.postpone(schedule.id)
      toast.success('내일로 미루었습니다')
      onPostpone?.()
    } catch {
      toast.error('미루기 실패')
    }
  }

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!station) {
      toast.error('기지국 정보가 없습니다')
      return
    }

    if (station.lat && station.lng && !isFallbackCoord(station.lat, station.lng)) {
      window.open(
        `https://map.kakao.com/link/to/${encodeURIComponent(station.station_name)},${station.lat},${station.lng}`,
        '_blank'
      )
    } else if (station.address) {
      window.open(
        `https://map.kakao.com/link/search/${encodeURIComponent(station.address)}`,
        '_blank'
      )
    } else {
      toast.error('좌표/주소 정보가 없습니다')
    }
  }

  return (
    <div
      onClick={onClick}
      className={`${style.bg} rounded-2xl p-4 shadow-sm border border-gray-100 active:bg-gray-50 transition-colors cursor-pointer`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`flex items-center justify-center w-7 h-7 rounded-full ${style.circle} text-white text-xs font-bold`}>
            {schedule.status === 'completed' ? (
              <CheckCircle2 size={18} />
            ) : (
              displayOrder
            )}
          </span>
          <h3 className="font-bold text-gray-900">{station?.station_name || '기지국'}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowReassign(true) }}
              className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-[11px] font-medium hover:bg-gray-200"
            >
              <RefreshCw size={12} />
              재배정
            </button>
          )}
          <StatusBadge status={schedule.status} />
          {schedule.status === 'completed' && (
            <CheckCircle2 size={18} className="text-green-500" />
          )}
        </div>
      </div>

      {station && (
        <div className="space-y-1 ml-9 mb-3">
          <p className="flex items-center gap-1.5 text-sm text-gray-500">
            <MapPin size={14} />
            {station.address}
          </p>
          {station.work_2025 && (
            <p className="text-sm text-gray-600">{station.work_2025}</p>
          )}
          {schedule.started_at && (
            <p className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock size={12} />
              시작: {new Date(schedule.started_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {schedule.completed_at && (
            <p className="flex items-center gap-1.5 text-xs text-green-600">
              <Clock size={12} />
              완료: {new Date(schedule.completed_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 ml-9">
        <button
          onClick={handleNavigate}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium"
        >
          <Navigation size={14} />
          네비
        </button>
        {schedule.status !== 'completed' && schedule.status !== 'postponed' && (
          <button
            onClick={handlePostpone}
            className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-xs font-medium"
          >
            <CalendarX2 size={14} />
            내일로
          </button>
        )}
        <div className="flex-1" />
        <ChevronRight size={18} className="text-gray-300" />
      </div>

      {showReassign && (
        <ReassignModal
          scheduleId={schedule.id}
          currentEmployeeId={schedule.employee_id}
          currentDate={schedule.scheduled_date}
          stationName={station?.station_name || '기지국'}
          onClose={() => setShowReassign(false)}
          onDone={(newDate) => {
            setShowReassign(false)
            onReassigned?.(newDate)
          }}
        />
      )}
    </div>
  )
}
