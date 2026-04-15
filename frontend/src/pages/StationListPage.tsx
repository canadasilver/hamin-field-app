import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Header from '../components/common/Header'
import { stationApi } from '../services/api'
import { Search, Filter, X, ChevronLeft, Download, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Station, CoolingInfo } from '../types'
import * as XLSX from 'xlsx'

export default function StationListPage() {
  const { fileId } = useParams<{ fileId: string }>()
  const navigate = useNavigate()
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('')
  const [team, setTeam] = useState('')
  const [regions, setRegions] = useState<string[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [showFilter, setShowFilter] = useState(false)
  const [selected, setSelected] = useState<Station | null>(null)

  useEffect(() => {
    loadFilters()
  }, [fileId])

  useEffect(() => {
    loadStations()
  }, [fileId, search, region, team])

  const loadFilters = async () => {
    try {
      const res = await stationApi.filters(fileId)
      setRegions(res.data.regions)
      setTeams(res.data.teams)
    } catch {}
  }

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
      setStations(res.data)
    } catch {
      toast.error('기지국 목록 로딩 실패')
    } finally {
      setLoading(false)
    }
  }, [fileId, search, region, team])

  const handleExportExcel = () => {
    if (stations.length === 0) return
    const rows = stations.map((s, i) => ({
      '번호': s.no || i + 1,
      '국소명': s.station_name,
      '운용팀': s.operation_team || '',
      '담당자': s.manager || '',
      '연락처': s.contact || '',
      '주소': s.address || '',
      '작업내용(25년)': s.work_2025 || '',
      '점검결과': s.inspection_result || '',
      '상태': s.status,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '기지국 목록')
    XLSX.writeFile(wb, `기지국_목록_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  // 검색 디바운스
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header
        title="기지국 목록"
        left={
          <button onClick={() => navigate('/files')} className="p-2 text-gray-600">
            <ChevronLeft size={22} />
          </button>
        }
        right={
          <button onClick={handleExportExcel} className="p-2 text-kt-red" title="엑셀 다운로드">
            <Download size={20} />
          </button>
        }
      />

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {/* 검색 + 필터 */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="국소명, 주소, 담당자 검색"
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kt-red/30"
            />
          </div>
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={`px-3 py-2.5 rounded-xl border text-sm font-medium ${
              region || team ? 'bg-kt-red text-white border-kt-red' : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            <Filter size={16} />
          </button>
        </div>

        {/* 필터 패널 */}
        {showFilter && (
          <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">시/도</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">전체</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">운용팀</label>
              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">전체</option>
                {teams.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {(region || team) && (
              <button
                onClick={() => { setRegion(''); setTeam('') }}
                className="text-xs text-kt-red font-medium"
              >
                필터 초기화
              </button>
            )}
          </div>
        )}

        {/* 결과 수 */}
        <p className="text-xs text-gray-500">{loading ? '검색중...' : `${stations.length}개 기지국`}</p>

        {/* 기지국 카드 목록 */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 size={24} className="mx-auto animate-spin text-gray-300" />
          </div>
        ) : stations.length === 0 ? (
          <div className="text-center py-12 text-gray-400">검색 결과가 없습니다</div>
        ) : (
          <div className="space-y-3">
            {stations.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelected(s)}
                className="bg-white rounded-2xl p-4 border border-gray-100 active:bg-gray-50 cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {s.no && <span className="text-xs text-gray-400">#{s.no}</span>}
                      <h3 className="font-bold text-gray-900">{s.station_name}</h3>
                    </div>
                    {s.address && <p className="text-xs text-gray-500 mt-1">{s.address}</p>}
                  </div>
                  {s.inspection_result && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      s.inspection_result === '양호' ? 'bg-green-50 text-green-600' :
                      s.inspection_result === '불량' ? 'bg-red-50 text-red-600' :
                      'bg-gray-50 text-gray-500'
                    }`}>
                      {s.inspection_result}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                  {s.operation_team && <span>{s.operation_team}</span>}
                </div>

                {s.work_2025 && (
                  <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">
                    {s.work_2025}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 상세 팝업 */}
      {selected && (
        <StationDetailModal station={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

function StationDetailModal({ station: s, onClose }: { station: Station; onClose: () => void }) {
  const cooling: CoolingInfo[] = typeof s.cooling_info === 'string'
    ? JSON.parse(s.cooling_info)
    : s.cooling_info || []

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        {/* 헤더 */}
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-lg text-gray-900">{s.station_name}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={22} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 기본 정보 */}
          <Section title="기본 정보">
            <InfoRow label="고유번호" value={s.unique_no} />
            <InfoRow label="국소ID" value={s.station_id} />
            <InfoRow label="네트워크단" value={s.network_group} />
            <InfoRow label="장비유형" value={s.equipment_type} />
            <InfoRow label="옥내/외" value={s.indoor_outdoor} />
            <InfoRow label="운용수량" value={s.operation_count?.toString()} />
            <InfoRow label="바코드" value={s.barcode} />
            <InfoRow label="주소" value={s.address} />
            <InfoRow label="건물명" value={s.building_name} />
          </Section>

          {/* 담당 정보 */}
          <Section title="담당 정보">
            <InfoRow label="운용팀" value={s.operation_team} />
            <InfoRow label="점검자" value={s.inspector} />
          </Section>

          {/* 냉방기 정보 */}
          {cooling.length > 0 && (
            <Section title="냉방기 정보">
              {cooling.map((c, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                  <p className="font-medium text-gray-700">냉방기 {i + 1}</p>
                  <InfoRow label="용량" value={c.capacity} />
                  <InfoRow label="제조사" value={c.manufacturer} />
                  <InfoRow label="취득일" value={c.acquired} />
                </div>
              ))}
            </Section>
          )}

          {/* 작업 이력 */}
          <Section title="작업 이력">
            {[
              { year: 2021, value: s.work_2021 },
              { year: 2022, value: s.work_2022 },
              { year: 2023, value: s.work_2023 },
              { year: 2024, value: s.work_2024 },
              { year: 2025, value: s.work_2025 },
            ].filter(w => w.value).map(w => (
              <div key={w.year} className="flex text-xs">
                <span className="text-kt-red w-20 flex-shrink-0 font-medium">{w.year}년</span>
                <span className="text-gray-700 flex-1">{w.value}</span>
              </div>
            ))}
            <InfoRow label="불량사항" value={s.defect} />
            <InfoRow label="예정공정" value={s.planned_process} />
          </Section>

          {/* 점검 결과 */}
          <Section title="점검 결과">
            <InfoRow label="점검대상" value={s.inspection_target} />
            <InfoRow label="점검결과" value={s.inspection_result} />
            <InfoRow label="점검일자" value={s.inspection_date} />
            <InfoRow label="등록여부" value={s.registration_status} />
            <InfoRow label="등록일자" value={s.registration_date} />
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-900 mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex text-xs">
      <span className="text-gray-400 w-20 flex-shrink-0">{label}</span>
      <span className="text-gray-700 flex-1">{value}</span>
    </div>
  )
}
