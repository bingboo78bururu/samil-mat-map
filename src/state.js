// 앱 상태 한 곳. 필터 규칙(기획안 4장)은 전부 여기에만 있습니다.
import { fetchRestaurants } from './api.js';

export const state = {
  restaurants: [],
  status: 'idle',     // idle | loading | ready | error
  error: null,
  filters: emptyFilters(),
};

export function emptyFilters() {
  return { region: '전체', theme: '전체', cuisine: '전체', budget: '전체', walk: '전체', search: '' };
}

export function clearFilters() {
  state.filters = emptyFilters();
}

export function applyQuick(patch) {
  state.filters = { ...emptyFilters(), ...patch };
}

export async function loadRestaurants() {
  state.status = 'loading';
  state.error = null;
  try {
    state.restaurants = await fetchRestaurants();
    state.status = 'ready';
  } catch (err) {
    state.error = err;
    state.status = 'error';
  }
  return state.status;
}

export function getRestaurant(id) {
  return state.restaurants.find((r) => r.id === id) || null;
}

export function regionOptions() {
  return ['전체', ...new Set(state.restaurants.map((r) => r.region))];
}

export function cuisineOptions(base) {
  return ['전체', ...new Set([...base, ...state.restaurants.map((r) => r.cuisine)])];
}

/**
 * 기획안 4장의 규칙:
 *  - 지역·검색어·예산·음식 종류·식사 상황은 AND로 함께 적용한다.
 *  - 예산은 대표 메뉴 1인 가격 기준이며 15,000원 이하는 15,000원을 포함한다.
 *  - 가격 미확인은 예산 '전체'에서만 보이고, 특정 예산을 고르면 제외된다.
 *  - 등록 시 상황은 여러 개, 검색 시 상황은 하나. 그 태그가 붙어 있으면 충족.
 *
 * 목업 v8에서 더해진 규칙:
 *  - 본사에서 도보 N분 이내. 좌표(도보 시간)가 없는 식당은 거리 조건을 걸면 제외된다.
 *  - 검색어는 식당명·대표 메뉴·메뉴 설명·세분류·음식 종류를 대상으로 한다.
 *  - 결과는 본사에서 가까운 순. 거리를 모르는 식당은 맨 뒤.
 */
export function candidates() {
  const f = state.filters;
  const keyword = f.search.trim().toLowerCase();

  return state.restaurants
    .filter((r) => {
      if (f.region !== '전체' && r.region !== f.region) return false;
      if (f.theme !== '전체' && !(r.tags || []).includes(f.theme)) return false;
      if (f.cuisine !== '전체' && r.cuisine !== f.cuisine) return false;

      if (f.budget !== '전체') {
        if (r.price == null) return false;            // 가격 미확인은 예산 검색에서 제외
        if (r.price > Number(f.budget)) return false; // 15,000 포함 / 15,001 제외
      }

      if (f.walk !== '전체') {
        if (r.walk_min == null) return false;         // 위치 확인 중은 거리 검색에서 제외
        if (r.walk_min > Number(f.walk)) return false;
      }

      if (keyword) {
        const haystack = [r.name, r.menu, r.menus || '', r.sub || '', r.cuisine].join(' ').toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    })
    .sort((a, b) => (a.walk_min ?? 999) - (b.walk_min ?? 999));
}

// 목록 설명줄과 랜덤 결과에 같은 문구를 씁니다(기획안 S4: "선택한 조건"을 보여준다).
export function conditionLabel() {
  const f = state.filters;
  const parts = [];
  if (f.region !== '전체') parts.push(f.region);
  if (f.theme !== '전체') parts.push(f.theme);
  if (f.cuisine !== '전체') parts.push(f.cuisine);
  if (f.budget !== '전체') parts.push(Number(f.budget).toLocaleString('ko-KR') + '원 이하');
  if (f.walk !== '전체') parts.push(`도보 ${f.walk}분 이내`);
  if (f.search.trim()) parts.push(`“${f.search.trim()}”`);
  return parts.join(' · ');
}
