// 필터·요약·약도 로직 점검용 일회성 스크립트 (앱에는 포함되지 않습니다).
//   node reference/smoke.mjs
import { state, candidates, clearFilters, applyQuick, conditionLabel } from '../src/state.js';
import { summarize, walkLabel, priceLabel, kindLabel, shareText, groupOf, mapLink, googleMapsLink, googleLinkFor } from '../src/ui.js';
import { mapPanel } from '../src/map.js';
import { QUICK } from '../src/config.js';
import { regionFromAddress, cuisineFromCategory, placeLink, geocodeAddress } from '../src/kakao.js';
import { samePlace, similarNearby, similarName, baseName, distanceM } from '../src/dedupe.js';

const R = (o) => ({
  id: o.id, name: o.name, region: o.region ?? '용산', address: '서울 용산구 한강대로 100',
  cuisine: o.cuisine ?? '한식', sub: o.sub ?? null, menu: o.menu ?? '메뉴', menus: null,
  price: o.price ?? null, price_note: null, tags: o.tags ?? ['점심'], link: o.link ?? null,
  source_type: o.source_type ?? null, info_checked_on: null, hours: null, reserve: null, wait: null,
  walk_min: o.walk_min ?? null, dist_m: o.dist_m ?? null, icon: o.icon ?? null,
  lat: o.lat ?? null, lng: o.lng ?? null, kakao_place_id: null, created_at: '2026-10-01T00:00:00Z',
  reviews: o.reviews ?? [],
});

const rv = (body, extra = {}) => ({
  id: Math.random().toString(16).slice(2), author_name: extra.author ?? null, body,
  kind: extra.kind ?? 'member', situation: extra.situation ?? null,
  people: extra.people ?? null, paid: extra.paid ?? null,
  created_at: extra.at ?? '2026-10-01T00:00:00Z',
});

state.restaurants = [
  R({ id: 'a', name: '가상 식당 A', price: 15000, cuisine: '한식', tags: ['점심', '팀 회식'], walk_min: 5, dist_m: 400, lat: 37.5305, lng: 126.9700,
      reviews: [rv('첫 후기 = 추천 이유', { at: '2026-09-01T00:00:00Z' }),
                rv('최신 후기', { situation: '점심', people: '2~3명', paid: 13000, at: '2026-09-20T00:00:00Z' })] }),
  R({ id: 'b', name: '가상 식당 B', price: 15001, cuisine: '한식', tags: ['점심'], walk_min: 12, lat: 37.5250, lng: 126.9720 }),
  R({ id: 'c', name: '가상 식당 C', price: null,  cuisine: '한식', tags: ['점심'], walk_min: 3, lat: 37.5292, lng: 126.9690 }),
  R({ id: 'd', name: '가상 식당 D', price: 9000,  cuisine: '아시안', sub: '베트남', tags: ['퇴근 후'], walk_min: null }),
  R({ id: 'e', name: '가상 식당 E', price: 12000, cuisine: '카페·디저트', tags: ['점심', '팀 회식'], walk_min: 8, lat: 37.5270, lng: 126.9660,
      reviews: [rv('조사 메모입니다', { kind: 'research' }), rv('가상 후기', { kind: 'virtual', situation: '팀 회식', paid: 20000 })] }),
];

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${label}  →  ${JSON.stringify(got)}${ok ? '' : `  (기대: ${JSON.stringify(want)})`}`);
};

console.log('\n── 기획안 4장: 예산 경계 ──');
clearFilters();
state.filters.budget = '15000';
const b15 = candidates().map((r) => r.id);
eq('15,000원 이하 → A(15000) E(12000) D(9000), 가까운 순', b15, ['a', 'e', 'd']);
eq('  B(15,001원)는 제외 = 경계값 1원 초과', b15.includes('b'), false);
eq('  C(가격 미확인)는 제외', b15.includes('c'), false);

clearFilters();
eq('예산 전체 → 가격 미확인도 보인다', candidates().map((r) => r.id).includes('c'), true);

console.log('\n── 목업 v8: 도보 거리 ──');
clearFilters();
state.filters.walk = '10';
eq('도보 10분 이내 → c(3) a(5) e(8), 거리 모르는 d 제외', candidates().map((r) => r.id), ['c', 'a', 'e']);

clearFilters();
eq('정렬: 가까운 순, 거리 모르는 곳은 맨 뒤', candidates().map((r) => r.walk_min), [3, 5, 8, 12, null]);

console.log('\n── AND 결합 ──');
clearFilters();
Object.assign(state.filters, { budget: '15000', cuisine: '한식', theme: '점심' });
eq('15,000 + 한식 + 점심 → A만', candidates().map((r) => r.id), ['a']);

console.log('\n── 빠른 찾기 ──');
applyQuick(QUICK[0][2]);
eq("'점심 1시간 컷' → 점심 + 도보 10분", [state.filters.theme, state.filters.walk], ['점심', '10']);
eq('  결과', candidates().map((r) => r.id), ['c', 'a', 'e']);
eq('  조건 문구', conditionLabel(), '점심 · 도보 10분 이내');

console.log('\n── 검색어 (이름·메뉴·세분류·종류) ──');
clearFilters();
state.filters.search = '베트남';
eq("'베트남' → 세분류로 찾힌다", candidates().map((r) => r.id), ['d']);

console.log('\n── 후기 요약 ──');
const a = state.restaurants[0], e = state.restaurants[4];
eq('A: 동료 후기 2건, 실결제 1건 평균 13,000', [summarize(a).count, summarize(a).avg, summarize(a).paidN], [2, 13000, 1]);
eq('E: 조사 메모는 동료 후기에서 제외', summarize(e).count, 1);
eq('E: 가상 후기 포함 표시', summarize(e).hasVirtual, true);
eq('A: 많이 다녀온 자리', summarize(a).top, '점심 1');

console.log('\n── 표시 문구 ──');
eq('가격 미확인', priceLabel(state.restaurants[2]), '가격 미확인');
eq('도보 라벨', walkLabel(a), '본사에서 도보 약 5분');
eq('위치 확인 중', walkLabel(state.restaurants[3]), '위치 확인 중');
eq('음식 종류 + 세분류', kindLabel(state.restaurants[3]), '아시안 · 베트남');
eq('아이콘 그룹', [groupOf(a), groupOf(state.restaurants[3]), groupOf(e)], ['kor', 'asia', 'cafe']);
eq('공유 문구 첫 줄', shareText(a).split('\n')[0], '[삼일맛지도] 오늘은 여기 어때요? 가상 식당 A (메뉴)');

console.log('\n── 약도 ──');
clearFilters();
const panel = mapPanel(candidates(), state.restaurants);
eq('핀 개수 = 좌표 있는 식당 수', (panel.match(/class="pin"/g) || []).length, 4);
eq("좌표 없는 1곳은 '위치 확인 중'으로 안내", panel.includes('위치 확인 중 1곳'), true);
const noCoords = mapPanel([], []);
eq('좌표가 하나도 없으면 약도를 안 그린다', noCoords.includes('<svg'), false);

console.log('\n── 지도에서 보기 링크 ──');
const google = 'https://www.google.com/maps/place/?q=place_id:abc';
eq('카카오 장소 ID가 있으면 카카오맵 장소 페이지', mapLink({ name: '식당', kakao_place_id: '1171680157', lat: 37.5, lng: 126.9, link: google }), 'https://place.map.kakao.com/1171680157');
eq('좌표만 있으면 카카오맵 핀', mapLink({ name: '도마 스시', kakao_place_id: null, lat: 37.5291, lng: 126.97, link: google }), 'https://map.kakao.com/link/map/%EB%8F%84%EB%A7%88%20%EC%8A%A4%EC%8B%9C,37.5291,126.97');
eq('둘 다 없으면 등록된 링크', mapLink({ name: '식당', kakao_place_id: null, lat: null, lng: null, link: google }), google);
eq('아무것도 없으면 빈 값', mapLink({ name: '식당', kakao_place_id: null, lat: null, lng: null, link: null }), '');
eq('구글 지도 검색 링크', googleMapsLink({ name: '도마 스시', address: '서울 용산구 한강대로38길 29' }), 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('도마 스시 서울 용산구 한강대로38길 29'));
eq('길이 제한을 넘으면 빈 값', googleMapsLink({ name: '가'.repeat(60), address: '나'.repeat(150) }, 300), '');
eq('저장된 구글 지도 링크가 있으면 그대로', googleLinkFor({ name: '식당', address: '주소', link: google }), google);
eq('구글이 아닌 링크면 새로 만든다', googleLinkFor({ name: '식당', address: '주소', link: 'https://example.com' }).startsWith('https://www.google.com/maps/search/'), true);
eq('공유 문구도 카카오 링크', shareText({ name: '식당', menu: '메뉴', address: '주소', walk_min: 3, dist_m: 200, kakao_place_id: '9', lat: 37.5, lng: 126.9, link: google }).split('\n').at(-1), 'https://place.map.kakao.com/9');

console.log('\n── 도보 거리 표시 ──');
eq('좌표 없음 → 위치 확인 중', walkLabel({ walk_min: null, lat: null, lng: null }), '위치 확인 중');
eq('좌표 있고 도보 시간 없음(12km 밖) → 멀어요', walkLabel({ walk_min: null, lat: 35.1, lng: 129.0 }), '본사에서 멀어요');
eq('본사 건물 내', walkLabel({ walk_min: 1, dist_m: 0, lat: 37.5288, lng: 126.9686 }), '본사 건물 내');
eq('도보 N분', walkLabel({ walk_min: 7, dist_m: 450, lat: 37.53, lng: 126.97 }), '본사에서 도보 약 7분');

console.log('\n── 카카오 장소 → 등록 칸 ──');
eq('서울은 구 이름', regionFromAddress('서울 용산구 한강로2가 191'), '용산');
eq('광역시는 시 이름', regionFromAddress('부산 해운대구 우동 1411'), '부산');
eq('도는 시·군 이름', regionFromAddress('경기 성남시 분당구 정자동 178'), '성남');
eq('한식 + 세분류', JSON.stringify(cuisineFromCategory('음식점 > 한식 > 해장국')), JSON.stringify({ cuisine: '한식', sub: '해장국' }));
eq('아시아음식 → 아시안', cuisineFromCategory('음식점 > 아시아음식 > 베트남음식').cuisine, '아시안');
eq('카페 → 카페·디저트', cuisineFromCategory('음식점 > 카페 > 커피전문점').cuisine, '카페·디저트');
eq('술집은 음식 종류를 정하지 않는다', cuisineFromCategory('음식점 > 술집 > 호프,요리주점').cuisine, null);
eq('지도 링크', placeLink({ id: '12345' }), 'https://place.map.kakao.com/12345');
eq('키가 없으면 주소 변환은 건너뛴다(null)', await geocodeAddress('서울 용산구 한강대로48길 18'), null);
eq('이상한 ID면 링크 없음', placeLink({ id: '12a' }), '');

console.log('\n── 중복 등록 막기 ──');
const salt = { id: 's', name: '소금제면소 용산', address: '서울 용산구 한강대로40길 32 1층', lat: 37.53008, lng: 126.97107, kakao_place_id: '1276387489' };
const goch = { id: 'g', name: '고청담 용산', address: '서울 용산구 한강대로 100', lat: 37.52879, lng: 126.96867, kakao_place_id: '1924399542' };
const kont = { id: 'k', name: '콘타이', address: '서울 용산구 한강대로 100', lat: 37.52927, lng: 126.96855, kakao_place_id: '27320968' };
const pool = [salt, goch, kont];
eq('지점명 떼기: 소금제면소 용산점 → 소금제면소', baseName('소금제면소 용산점'), '소금제면소');
eq('같은 장소 ID → 같은 가게', samePlace('1276387489', pool)?.id, 's');
eq('장소 ID 없으면 판단 안 함', samePlace(null, pool), null);
eq('용산점 / 용산 / 신용산점은 비슷한 이름', [similarName('소금제면소 용산점', '소금제면소 용산'), similarName('소금제면소 신용산점', '소금제면소 용산')], [true, true]);
eq('같은 건물의 다른 가게는 비슷하지 않음', similarName('고청담 용산', '콘타이'), false);
eq('장소 ID 없이 직접 입력 + 30m 안 + 비슷한 이름 → 확인 요청',
  similarNearby({ name: '소금제면소 신용산점', lat: 37.53010, lng: 126.97110 }, pool).map((r) => r.id), ['s']);
eq('비슷한 이름이라도 30m 밖이면 묻지 않음',
  similarNearby({ name: '소금제면소 숙대점', lat: 37.5454, lng: 126.9730 }, pool).length, 0);
eq('둘 다 장소 ID가 있고 다르면 다른 가게',
  similarNearby({ name: '소금제면소 용산점', lat: 37.53008, lng: 126.97107, kakaoPlaceId: '999' }, pool).length, 0);
eq('좌표가 없으면 같은 주소 + 비슷한 이름으로',
  similarNearby({ name: '고청담', address: '서울 용산구 한강대로 100 2층' }, pool).map((r) => r.id), ['g']);
eq('거리 계산 (본사 → 소금제면소 약 255m)', Math.round(distanceM({ lat: 37.528837, lng: 126.968647 }, salt) / 10) * 10, 250);

console.log(`\n${fail ? '❌' : '✅'}  통과 ${pass} / 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
