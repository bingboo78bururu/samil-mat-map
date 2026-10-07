// 화면 조각을 만드는 공용 함수들. 목업 v8의 헬퍼를 그대로 옮겼습니다.
import { ICONS, ICON_GROUP } from './icons.js';

// innerHTML에 들어가는 모든 사용자 입력은 반드시 esc()를 거칩니다.
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const won = (n) => Number(n).toLocaleString('ko-KR') + '원';

export const priceLabel = (r) => (r.price == null ? '가격 미확인' : won(r.price));

// 음식 종류 + 세분류. 예: '한식 · 국밥'
export const kindLabel = (r) => (r.sub ? `${r.cuisine} · ${r.sub}` : r.cuisine);

// 본사 기준 도보 거리. 좌표가 없으면 '위치 확인 중'. 임의 값을 만들지 않습니다.
// 좌표는 있는데 도보 시간이 없으면 DB가 '도보로 갈 거리가 아님'(12km 밖)으로 판단한 곳입니다.
const farAway = (r) => r.walk_min == null && r.lat != null && r.lng != null;

export const walkLabel = (r) =>
  farAway(r)
    ? '본사에서 멀어요'
    : r.walk_min == null
      ? '위치 확인 중'
      : r.walk_min <= 1 && r.dist_m === 0
        ? '본사 건물 내'
        : `본사에서 도보 약 ${r.walk_min}분`;

export const walkShort = (r) =>
  farAway(r) ? '본사에서 멀어요' : r.walk_min == null ? '위치 확인 중' : `도보 ${r.walk_min}분`;

export const tagsHtml = (r) => (r.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');

export const options = (values, selected) =>
  values.map((x) => `<option${x === selected ? ' selected' : ''}>${esc(x)}</option>`).join('');

export const selectOptions = (pairs, selected) =>
  pairs.map(([v, t]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(t)}</option>`).join('');

export const validLink = (u) => {
  try { return ['https:', 'http:'].includes(new URL(u).protocol); } catch { return false; }
};

// --- 아이콘 ---------------------------------------------------------------
const CUISINE_ICON = { 한식: 'bapsang', 중식: 'wok', 일식: 'sushi', 양식: 'pasta', 아시안: 'pho', '카페·디저트': 'cake' };
export const iconOf = (r) => (ICONS[r.icon] ? r.icon : CUISINE_ICON[r.cuisine] || 'bapsang');
export const groupOf = (r) => ICON_GROUP[iconOf(r)];
export const glyph = (r) =>
  `<svg class="food-glyph" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${esc(ICONS[iconOf(r)][0])}">${ICONS[iconOf(r)][1]}</svg>`;

// --- 후기 -----------------------------------------------------------------
// kind: member = 구성원 실제 후기 / research = 조사 메모 / virtual = 시연용 가상 후기
export const isPeer = (v) => v.kind !== 'research';
export const peerReviews = (r) => (r.reviews || []).filter(isPeer);
export const researchMemo = (r) => (r.reviews || []).find((v) => v.kind === 'research') || null;

export const authorLabel = (v) => v.author_name || '동료';

// 후기 날짜는 DB의 서버 시각(created_at)을 씁니다. 사용자 PC 시계를 믿지 않습니다.
export const dateLabel = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ko-KR');
};

/**
 * 삼일 후기 요약 (목업 v8 상세 화면 상단 박스)
 *  - 1인 실결제 평균은 금액이 적힌 후기만으로 계산하고, 100원 단위로 반올림합니다.
 *  - 조사 메모는 제외합니다. 동료가 남긴 후기만 셉니다.
 */
export function summarize(r) {
  const peers = peerReviews(r);
  const paid = peers.filter((v) => v.paid > 0);
  const avg = paid.length
    ? Math.round(paid.reduce((s, v) => s + v.paid, 0) / paid.length / 100) * 100
    : null;

  const counts = {};
  peers.forEach((v) => { if (v.situation) counts[v.situation] = (counts[v.situation] || 0) + 1; });
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ');

  return { count: peers.length, avg, paidN: paid.length, top, hasVirtual: peers.some((v) => v.kind === 'virtual') };
}

// 카카오맵 장소와 연결된 식당인지(카카오 장소 ID가 있는지).
// 없으면 상세 화면에 '카카오맵 장소와 연결되지 않은 식당이에요'와 구글 지도 링크를 보여줍니다.
export const onKakao = (r) => /^\d{1,20}$/.test(String(r.kakao_place_id ?? ''));

// 구글 지도 검색 링크(키·비용 없음). 식당명 + 주소로 검색합니다.
// maxLength를 주면 그보다 길 때 '' — DB의 링크 길이 제한(308자)에 맞추기 위해서입니다.
export function googleMapsLink({ name, address }, maxLength = Infinity) {
  const query = [name, address].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
  if (!query) return '';
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return url.length <= maxLength ? url : '';
}

const isGoogleMaps = (u) => {
  try { return /(^|\.)google\.[a-z.]+$/.test(new URL(u).hostname) && new URL(u).pathname.startsWith('/maps'); } catch { return false; }
};

// 카카오맵 장소가 없는 식당의 구글 지도 링크: 저장된 구글 지도 링크가 있으면 그것, 없으면 새로 만듭니다.
export const googleLinkFor = (r) => (r.link && isGoogleMaps(r.link) ? r.link : googleMapsLink(r));

// '지도에서 보기' 주소. 카카오 장소 ID → 카카오맵 장소 페이지, 좌표만 있으면 → 카카오맵 핀,
// 둘 다 없을 때만 등록된 출처 링크(구글 지도 등)를 씁니다.
export function mapLink(r) {
  if (onKakao(r)) return `https://place.map.kakao.com/${r.kakao_place_id}`;
  if (Number.isFinite(r.lat) && Number.isFinite(r.lng)) {
    return `https://map.kakao.com/link/map/${encodeURIComponent(String(r.name).replace(/,/g, ' '))},${r.lat},${r.lng}`;
  }
  return r.link && validLink(r.link) ? r.link : '';
}

// 팀 메신저로 보낼 공유 문구
export function shareText(r) {
  const url = mapLink(r);
  const link = url ? '\n' + url : '';
  return `[삼일맛지도] 오늘은 여기 어때요? ${r.name} (${r.menu})\n${r.address} · ${walkLabel(r)}${link}`;
}

// --- 토스트 / 스크롤 -------------------------------------------------------
let toastTimer;
export function notify(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.textContent = ''; }, 4000);
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// --- 입력 오류 (기획안 S3: 해당 입력 아래에 안내) ---------------------------
export function clearFieldErrors(form) {
  form.querySelectorAll('.field-error').forEach((el) => el.remove());
  form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
}

export function showFieldError(form, name, message) {
  const input = form.elements[name];
  const target = input instanceof RadioNodeList ? input[0] : input;
  if (!target) return;
  target.setAttribute('aria-invalid', 'true');
  const holder = target.closest('.field') || target.closest('fieldset') || target.parentElement;
  if (holder.querySelector('.field-error')) return;
  const p = document.createElement('p');
  p.className = 'field-error';
  p.setAttribute('role', 'alert');
  p.textContent = message;
  holder.appendChild(p);
}

export function focusFirstError(form) {
  const first = form.querySelector('[aria-invalid="true"]');
  if (first) {
    first.focus({ preventScroll: true });
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
