declare global {
  interface Window {
    kakao: any
  }
}

const KAKAO_SDK_ID = 'kakao-map-sdk'
const FALLBACK_KAKAO_JS_KEY = '92b199181912975f5c10cc85d977abdf'

function getKakaoJsKey() {
  return import.meta.env.VITE_KAKAO_MAP_KEY || import.meta.env.VITE_KAKAO_JS_KEY || FALLBACK_KAKAO_JS_KEY
}

export async function loadKakaoMapSdk(): Promise<any> {
  if (window.kakao?.maps?.LatLng) {
    return window.kakao
  }

  if (window.kakao?.maps?.load) {
    return new Promise((resolve) => {
      window.kakao.maps.load(() => resolve(window.kakao))
    })
  }

  const existing = document.getElementById(KAKAO_SDK_ID) as HTMLScriptElement | null
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener(
        'load',
        () => window.kakao?.maps?.load(() => resolve(window.kakao)),
        { once: true },
      )
      existing.addEventListener(
        'error',
        () => reject(new Error('카카오 지도 SDK를 불러오지 못했습니다.')),
        { once: true },
      )
    })
  }

  const script = document.createElement('script')
  script.id = KAKAO_SDK_ID
  script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${getKakaoJsKey()}&libraries=services&autoload=false`
  script.async = true

  return new Promise((resolve, reject) => {
    script.onload = () => {
      window.kakao.maps.load(() => resolve(window.kakao))
    }
    script.onerror = () => reject(new Error('카카오 지도 SDK를 불러오지 못했습니다.'))
    document.head.appendChild(script)
  })
}

export function geocodeWithKakaoJs(address: string): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!window.kakao?.maps?.services) {
      resolve(null)
      return
    }

    const geocoder = new window.kakao.maps.services.Geocoder()
    geocoder.addressSearch(address, (result: any[], status: string) => {
      if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
        resolve({
          lat: parseFloat(result[0].y),
          lng: parseFloat(result[0].x),
        })
        return
      }

      resolve(null)
    })
  })
}
