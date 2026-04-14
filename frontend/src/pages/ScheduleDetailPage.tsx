import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Header from '../components/common/Header'
import ChecklistForm from '../components/checklist/ChecklistForm'
import StatusBadge from '../components/common/StatusBadge'
import { scheduleApi, coolingUnitApi } from '../services/api'
import { MapPin, Phone, User, Wrench, Wind, Calendar, Package, Factory } from 'lucide-react'
import type { Schedule, CoolingUnit } from '../types'

export default function ScheduleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [coolingUnits, setCoolingUnits] = useState<CoolingUnit[]>([])
  const [coolingLoading, setCoolingLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    scheduleApi.list({}).then(res => {
      const found = res.data.find((s: Schedule) => s.id === id)
      if (found) setSchedule(found)
    })
  }, [id])

  useEffect(() => {
    if (!schedule?.station_id) return
    setCoolingLoading(true)
    coolingUnitApi.list(schedule.station_id)
      .then(res => setCoolingUnits(res.data ?? []))
      .catch(() => setCoolingUnits([]))
      .finally(() => setCoolingLoading(false))
  }, [schedule?.station_id])

  if (!schedule) return <div className="p-8 text-center text-gray-400">로딩중...</div>

  const station = schedule.stations

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header title="작업 상세" showBack />

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* 기지국 정보 */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">{station?.station_name}</h2>
            <StatusBadge status={schedule.status} />
          </div>
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin size={16} className="text-gray-400" />
              {station?.address}
            </p>
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <User size={16} className="text-gray-400" />
              {station?.manager}
            </p>
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <Phone size={16} className="text-gray-400" />
              <a href={`tel:${station?.contact}`} className="text-blue-600 underline">
                {station?.contact}
              </a>
            </p>
            {station?.work_2025 && (
              <p className="flex items-start gap-2 text-sm text-gray-600">
                <Wrench size={16} className="text-gray-400 mt-0.5" />
                {station.work_2025}
              </p>
            )}
          </div>
        </div>

        {/* 냉방기 정보 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center gap-2 px-4 py-3 bg-[#215288]">
            <Wind size={16} className="text-white" />
            <h3 className="text-sm font-bold text-white">냉방기 정보</h3>
            {!coolingLoading && (
              <span className="ml-auto text-xs text-blue-200 font-medium">
                총 {coolingUnits.length}대
              </span>
            )}
          </div>

          <div className="p-4">
            {coolingLoading ? (
              <p className="text-sm text-gray-400 text-center py-4">불러오는 중...</p>
            ) : coolingUnits.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">등록된 냉방기 정보가 없습니다</p>
            ) : (
              <div className="space-y-3">
                {coolingUnits.map((unit) => (
                  <div
                    key={unit.id}
                    className="rounded-xl border border-[#215288]/20 overflow-hidden"
                  >
                    {/* 냉방기 번호 헤더 */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#215288]/8">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#215288] text-white text-xs font-bold flex-shrink-0">
                        {unit.unit_number}
                      </span>
                      <span className="text-sm font-semibold text-[#215288]">
                        냉방기 {unit.unit_number}
                      </span>
                    </div>

                    {/* 냉방기 상세 정보 */}
                    <div className="grid grid-cols-2 gap-0 divide-x divide-y divide-gray-100">
                      <div className="flex items-start gap-2 px-3 py-2.5">
                        <Package size={14} className="text-[#215288] mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] text-gray-400 leading-none mb-0.5">용량</p>
                          <p className="text-sm font-medium text-gray-800">{unit.capacity || '-'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 px-3 py-2.5">
                        <Factory size={14} className="text-[#215288] mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] text-gray-400 leading-none mb-0.5">제조사</p>
                          <p className="text-sm font-medium text-gray-800">{unit.manufacturer || '-'}</p>
                        </div>
                      </div>
                      <div className="col-span-2 flex items-start gap-2 px-3 py-2.5 border-t border-gray-100">
                        <Calendar size={14} className="text-[#215288] mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] text-gray-400 leading-none mb-0.5">취득일</p>
                          <p className="text-sm font-medium text-gray-800">{formatDate(unit.acquisition_date)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 체크리스트 */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <ChecklistForm scheduleId={schedule.id} status={schedule.status} />
        </div>
      </div>
    </div>
  )
}
