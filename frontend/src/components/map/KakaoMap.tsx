import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    kakao: any
  }
}

interface MapMarker {
  lat: number
  lng: number
  label: string
  order?: number
  status?: string
}

interface KakaoMapProps {
  markers: MapMarker[]
  showRoute?: boolean
  onMarkerClick?: (index: number) => void
  className?: string
}

export default function KakaoMap({ markers, showRoute = false, onMarkerClick, className = '' }: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current) return

    const init = () => {
      if (!window.kakao?.maps?.LatLng) return
      renderMap()
    }

    if (window.kakao?.maps?.LatLng) {
      init()
    } else if (window.kakao?.maps?.load) {
      window.kakao.maps.load(init)
    }
  }, [markers, showRoute])

  const renderMap = () => {
    if (!mapRef.current || !window.kakao?.maps) return

    const kakao = window.kakao

    // 지도 초기화
    const center = markers.length > 0
      ? new kakao.maps.LatLng(markers[0].lat, markers[0].lng)
      : new kakao.maps.LatLng(37.5665, 126.978) // 서울 기본

    const map = new kakao.maps.Map(mapRef.current, {
      center,
      level: markers.length > 1 ? 7 : 5,
    })
    mapInstanceRef.current = map

    const bounds = new kakao.maps.LatLngBounds()

    // 마커 표시
    markers.forEach((m, i) => {
      const position = new kakao.maps.LatLng(m.lat, m.lng)
      bounds.extend(position)

      const markerColor = m.status === 'completed' ? '#22c55e'
        : m.status === 'in_progress' ? '#eab308'
        : '#E4002B'

      const content = `
        <div style="
          display:flex;align-items:center;justify-content:center;
          width:28px;height:28px;border-radius:50%;
          background:${markerColor};color:white;font-size:12px;font-weight:bold;
          border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);
          cursor:pointer;
        ">${m.order !== undefined ? m.order + 1 : i + 1}</div>
      `

      const overlay = new kakao.maps.CustomOverlay({
        position,
        content,
        yAnchor: 1,
      })
      overlay.setMap(map)

      // 인포윈도우
      const infoContent = `
        <div style="padding:8px 12px;font-size:13px;min-width:120px;border-radius:8px;">
          <strong>${m.label}</strong>
        </div>
      `
      const infowindow = new kakao.maps.InfoWindow({ content: infoContent })

      kakao.maps.event.addListener(map, 'click', () => {
        infowindow.close()
      })
    })

    // 경로 그리기
    if (showRoute && markers.length > 1) {
      const path = markers.map(m => new kakao.maps.LatLng(m.lat, m.lng))
      const polyline = new kakao.maps.Polyline({
        path,
        strokeWeight: 4,
        strokeColor: '#E4002B',
        strokeOpacity: 0.8,
        strokeStyle: 'solid',
      })
      polyline.setMap(map)
    }

    // 모든 마커가 보이도록 bounds 조정
    if (markers.length > 1) {
      map.setBounds(bounds)
    }
  }

  return <div ref={mapRef} className={`kakao-map ${className}`} />
}
