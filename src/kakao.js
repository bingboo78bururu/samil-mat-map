// 카카오 SDK. 추천 등록(S3)의 장소 검색과 목록(S1)의 지도에 씁니다.
// JavaScript 키는 공개 키입니다. 카카오 콘솔에 등록한 도메인에서만 동작합니다.
// 키가 없거나 SDK를 못 불러오면 검색 없이 직접 입력으로 동작합니다.
import { KAKAO_JS_KEY, CUISINES, HQ } from './config.js';

let sdkPromise = null;

export function loadSdk() {
  if (!KAKAO_JS_KEY) return Promise.reject(new Error('NO_KAKAO_KEY'));
  if (window.kakao?.maps?.services) return Promise.resolve(window.kakao);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    // SDK가 내부 스크립트를 못 받으면(CSP·네트워크) load 콜백이 영영 안 와서 시간 제한을 둡니다.
    const timer = setTimeout(() => reject(new Error('KAKAO_SDK_TIMEOUT')), 8000);
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_JS_KEY)}&libraries=services&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => { clearTimeout(timer); resolve(window.kakao); });
    s.onerror = () => { clearTimeout(timer); reject(new Error('KAKAO_SDK_FAILED')); };
    document.head.appendChild(s);
  }).catch((err) => {
    sdkPromise = null; // 다음 검색 때 다시 시도
    throw err;
  });
  return sdkPromise;
}

export const kakaoEnabled = () => Boolean(KAKAO_JS_KEY);

// 본사 근처 결과가 먼저 오도록 기준점을 줍니다(멀리 있는 곳도 검색은 됩니다).
export async function searchPlaces(query) {
  const kakao = await loadSdk();
  const places = new kakao.maps.services.Places();
  return new Promise((resolve, reject) => {
    places.keywordSearch(query, (data, status) => {
      if (status === kakao.maps.services.Status.OK) resolve(data);
      else if (status === kakao.maps.services.Status.ZERO_RESULT) resolve([]);
      else reject(new Error('KAKAO_SEARCH_FAILED'));
    }, { location: new kakao.maps.LatLng(HQ.lat, HQ.lng), size: 8 });
  });
}

// 주소 → 좌표. 검색 결과를 고르지 않고 직접 입력한 식당에 씁니다.
// 찾지 못하거나 SDK가 안 되면 null — 좌표 없이 저장하고 '위치 확인 중'으로 둡니다.
export async function geocodeAddress(address) {
  if (!kakaoEnabled() || !String(address || '').trim()) return null;
  try {
    const kakao = await loadSdk();
    const geocoder = new kakao.maps.services.Geocoder();
    const docs = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve([]), 5000);
      geocoder.addressSearch(address, (data, status) => {
        clearTimeout(timer);
        resolve(status === kakao.maps.services.Status.OK ? data : []);
      });
    });
    const lat = Number(docs[0]?.y), lng = Number(docs[0]?.x);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

const METRO = ['부산', '대구', '인천', '광주', '대전', '울산', '세종'];

// '서울 용산구 한강대로 100' → '용산', '부산 해운대구 …' → '부산', '경기 성남시 분당구 …' → '성남'
export function regionFromAddress(address) {
  const [first = '', second = ''] = String(address || '').trim().split(/\s+/);
  if (first.startsWith('서울')) return second.replace(/구$/, '') || '서울';
  if (METRO.some((m) => first.startsWith(m))) return first.replace(/(특별자치시|광역시|특별시|시)$/, '');
  return second.replace(/[시군]$/, '') || first;
}

// 카카오 분류 '음식점 > 한식 > 해장국' → { cuisine: '한식', sub: '해장국' }
// 앱의 음식 종류 6개로 확실히 옮길 수 있을 때만 값을 줍니다.
export function cuisineFromCategory(category) {
  const parts = String(category || '').split('>').map((s) => s.trim()).filter(Boolean);
  const [top, mid, ...rest] = parts;
  let cuisine = null;
  if (top === '음식점') {
    if (CUISINES.includes(mid)) cuisine = mid;
    else if (mid === '아시아음식') cuisine = '아시안';
    else if (mid === '간식' || mid === '카페') cuisine = '카페·디저트';
  } else if (top === '카페') {
    cuisine = '카페·디저트';
  }
  const last = rest.at(-1) || '';
  const sub = last && last !== mid ? last.slice(0, 20) : '';
  return { cuisine, sub };
}

export function placeLink(place) {
  return /^\d{1,20}$/.test(String(place?.id)) ? `https://place.map.kakao.com/${place.id}` : '';
}
