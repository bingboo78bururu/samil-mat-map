// 같은 가게 중복 등록 막기. 상호명을 '용산점'·'신용산점'처럼 다르게 써도 같은 가게인지 봅니다.
//   1) 카카오 장소 ID가 같으면 같은 가게 (DB 유일 인덱스가 최종 판정)
//   2) 장소 ID로 못 가리면: 30m 안 + 이름이 비슷하면 '혹시 이 식당인가요?'로 확인만 받습니다.
//      주소만으로는 못 가립니다(한강대로 100 에는 서로 다른 가게가 여럿).

const NEAR_M = 30;

export function samePlace(placeId, restaurants) {
  if (!placeId) return null;
  return restaurants.find((r) => r.kakao_place_id && String(r.kakao_place_id) === String(placeId)) || null;
}

// '소금제면소 용산점' → '소금제면소', '고청담 용산' → '고청담용산'
// 마지막 단어가 '…점'(지점명)이면 떼고, 공백을 없앱니다.
export function baseName(name) {
  const words = String(name || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length > 1 && /점$/.test(words.at(-1))) words.pop();
  return words.join('').replace(/(본점|직영점)$/, '');
}

export function similarName(a, b) {
  const x = baseName(a), y = baseName(b);
  if (x.length < 2 || y.length < 2) return false;
  return x.startsWith(y) || y.startsWith(x);
}

export function distanceM(a, b) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 새로 등록하려는 식당과 비슷한 기존 식당(가까운 순, 최대 3곳).
// 둘 다 장소 ID가 있는데 서로 다르면 카카오가 다른 가게로 본 것이라 제외합니다.
export function similarNearby(candidate, restaurants) {
  const hasCoords = (r) => Number.isFinite(r.lat) && Number.isFinite(r.lng);
  return restaurants
    .filter((r) => !(candidate.kakaoPlaceId && r.kakao_place_id && String(r.kakao_place_id) !== String(candidate.kakaoPlaceId)))
    .filter((r) => similarName(candidate.name, r.name))
    .map((r) => ({ r, d: hasCoords(candidate) && hasCoords(r) ? distanceM(candidate, r) : null }))
    .filter(({ r, d }) => (d != null ? d <= NEAR_M : sameAddress(candidate.address, r.address)))
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0))
    .slice(0, 3)
    .map(({ r }) => r);
}

// 좌표가 없을 때만 쓰는 보조 기준: 도로명·지번 + 번호가 같은지
function sameAddress(a, b) {
  const key = (s) => {
    const m = String(s || '').replace(/\(.*?\)/g, ' ').match(/([가-힣0-9]+(?:로|길|가|동))\s*(\d+(?:-\d+)?)/);
    return m ? `${m[1]} ${m[2]}` : '';
  };
  return Boolean(key(a)) && key(a) === key(b);
}
