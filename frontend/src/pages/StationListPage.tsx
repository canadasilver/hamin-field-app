import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Download, Filter, Loader2, Search, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import Header from '../components/common/Header'
import { stationApi } from '../services/api'
import type { CoolingInfo, Station } from '../types'

const STATUS_STYLES: Record<string, string> = {
  양호: 'bg-green-50 text-green-600',
  불량: 'bg-red-50 text-red-600',
}

function parseCoolingInfo(coolingInfo: Station['cooling_info']): CoolingInfo[] {
  if (!coolingInfo) return []

  if (typeof coolingInfo === 'string') {
    try {
      return JSON.parse(coolingInfo) as CoolingInfo[]
    } catch {
      return []
    }
  }

  return coolingInfo
}

export default function StationListPage() {
  const { fileId } = useParams<{ fileId: string }>()
  const navigate = useNavigate()
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('')
  const [team, setTeam] = useState('')
  const [regions, setRegions] = useState<string[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [showFilter, setShowFilter] = useState(false)
  const [selected, setSelected] = useState<Station | null>(null)

  const loadFilters = useCallback(async () => {
    try {
      const res = await stationApi.filters(fileId)
      setRegions(res.data.regions ?? [])
      setTeams(res.data.teams ?? [])
    } catch {
      toast.error('필터 정보를 불러오지 못했습니다.')
    }
  }, [fileId])

  const loadStations = useCallback(async () => {
    setLoading(true)

    try {
      const res = await stationApi.list({
        file_id: fileId,
        search: search || undefined,
        region: region || undefined,
        team: team || undefined,
        limit: 200,
      })

      setStations(res.data ?? [])
    } catch {
      toast.error('기지국 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [fileId, region, search, team])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  useEffect(() => {
    loadStations()
  }, [loadStations])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const rowCountLabel = useMemo(() => {
    if (loading) return '검색 중...'
    return `${stations.length}개 기지국`
  }, [loading, stations.length])

  const handleExportExcel = () => {
    if (stations.length === 0) {
      toast.error('내보낼 기지국이 없습니다.')
      return
    }

    const rows = stations.map((station, index) => ({
      번호: station.no ?? index + 1,
      기지국명: station.station_name,
      운용팀: station.operation_team ?? '',
      담당자: station.manager ?? '',
      연락처: station.contact ?? '',
      주소: station.address ?? '',
      작업내용: station.work_2025 ?? '',
      점검결과: station.inspection_result ?? '',
      상태: station.status,
    }))

    const sheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, '기지국 목록')
    XLSX.writeFile(workbook, `기지국목록_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header
        title="기지국 목록"
        left={(
          <button onClick={() => navigate('/files')} className="p-2 text-gray-600" aria-label="뒤로가기">
            <ChevronLeft size={22} />
          </button>
        )}
        right={(
          <button
            onClick={handleExportExcel}
            className="p-2 text-kt-red"
            title="엑셀 다운로드"
            aria-label="엑셀 다운로드"
          >
            <Download size={20} />
          </button>
        )}
      />

      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="기지국명, 주소, 담당자 검색"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
            />
          </div>

          <button
            onClick={() => setShowFilter((prev) => !prev)}
            className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
              region || team ? 'border-kt-red bg-kt-red text-white' : 'border-gray-200 bg-white text-gray-600'
            }`}
            aria-label="필터 열기"
          >
            <Filter size={16} />
          </button>
        </div>

        {showFilter && (
          <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">지역</label>
              <select
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">전체</option>
                {regions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">운용팀</label>
              <select
                value={team}
                onChange={(event) => setTeam(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">전체</option>
                {teams.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            {(region || team) && (
              <button
                onClick={() => {
                  setRegion('')
                  setTeam('')
                }}
                className="text-xs font-medium text-kt-red"
              >
                필터 초기화
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-gray-500">{rowCountLabel}</p>

        {loading ? (
          <div className="py-12 text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-gray-300" />
          </div>
        ) : stations.length === 0 ? (
          <div className="py-12 text-center text-gray-400">검색 결과가 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {stations.map((station) => (
              <button
                key={station.id}
                type="button"
                onClick={() => setSelected(station)}
                className="w-full cursor-pointer rounded-2xl border border-gray-100 bg-white p-4 text-left active:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      {station.no != null && <span className="text-xs text-gray-400">#{station.no}</span>}
                      <h3 className="font-bold text-gray-900">{station.station_name}</h3>
                    </div>
                    {station.address && <p className="mt-1 text-xs text-gray-500">{station.address}</p>}
                  </div>

                  {station.inspection_result && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        STATUS_STYLES[station.inspection_result] ?? 'bg-gray-50 text-gray-500'
                      }`}
                    >
                      {station.inspection_result}
                    </span>
                  )}
                </div>

                {station.operation_team && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>{station.operation_team}</span>
                  </div>
                )}

                {station.work_2025 && (
                  <p className="mt-2 line-clamp-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    {station.work_2025}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && <StationDetailModal station={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function StationDetailModal({ station, onClose }: { station: Station; onClose: () => void }) {
  const coolingInfo = parseCoolingInfo(station.cooling_info)
  const workHistoryEntries: Array<[string, string]> = (
    station.work_history && Object.keys(station.work_history).length > 0
      ? Object.entries(station.work_history)
      : [
          ['2021', station.work_2021],
          ['2022', station.work_2022],
          ['2023', station.work_2023],
          ['2024', station.work_2024],
          ['2025', station.work_2025],
        ]
  )
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .sort(([yearA], [yearB]) => yearA.localeCompare(yearB))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">{station.station_name}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="닫기">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <Section title="기본 정보">
            <InfoRow label="고유번호" value={station.unique_no} />
            <InfoRow label="기지국 ID" value={station.station_id} />
            <InfoRow label="네트워크군" value={station.network_group} />
            <InfoRow label="장비유형" value={station.equipment_type} />
            <InfoRow label="실내외" value={station.indoor_outdoor} />
            <InfoRow label="운용수량" value={station.operation_count?.toString()} />
            <InfoRow label="바코드" value={station.barcode} />
            <InfoRow label="주소" value={station.address} />
            <InfoRow label="건물명" value={station.building_name} />
          </Section>

          <Section title="담당 정보">
            <InfoRow label="운용팀" value={station.operation_team} />
            <InfoRow label="점검자" value={station.inspector} />
            <InfoRow label="담당자" value={station.manager} />
            <InfoRow label="연락처" value={station.contact} />
          </Section>

          {coolingInfo.length > 0 && (
            <Section title="냉방기 정보">
              {coolingInfo.map((item, index) => (
                <div key={`${item.capacity ?? 'unit'}-${index}`} className="space-y-1 rounded-lg bg-gray-50 p-3 text-xs">
                  <p className="font-medium text-gray-700">냉방기 {index + 1}</p>
                  <InfoRow label="용량" value={item.capacity} />
                  <InfoRow label="제조사" value={item.manufacturer} />
                  <InfoRow label="취득일" value={item.acquired} />
                </div>
              ))}
            </Section>
          )}

          <Section title="작업 이력">
            {workHistoryEntries.map(([year, value]) => (
              <div key={year} className="flex text-xs">
                <span className="w-20 flex-shrink-0 font-medium text-[#215288]">{year}년</span>
                <span className="flex-1 text-gray-700">{value}</span>
              </div>
            ))}
            <InfoRow label="불량사항" value={station.defect} />
            <InfoRow label="예정공정" value={station.planned_process} />
          </Section>

          <Section title="점검 결과">
            <InfoRow label="점검대상" value={station.inspection_target} />
            <InfoRow label="점검결과" value={station.inspection_result} />
            <InfoRow label="점검일자" value={station.inspection_date} />
            <InfoRow label="등록여부" value={station.registration_status} />
            <InfoRow label="등록일자" value={station.registration_date} />
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-gray-900">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null

  return (
    <div className="flex text-xs">
      <span className="w-20 flex-shrink-0 text-gray-400">{label}</span>
      <span className="flex-1 text-gray-700">{value}</span>
    </div>
  )
}
