// 화면이 실제로 그려지는지 jsdom으로 확인하는 일회성 스크립트 (앱에 포함되지 않습니다).
//   node reference/render.mjs
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });

// 모듈들이 기대하는 브라우저 전역을 심어줍니다.
for (const k of ['window', 'document', 'navigator', 'location', 'HTMLElement', 'Node',
                 'RadioNodeList', 'CSS', 'getComputedStyle', 'localStorage']) {
  // Node 24는 navigator 등을 getter 전용으로 들고 있어서 덮어쓰기가 막힙니다.
  Object.defineProperty(globalThis, k, { value: dom.window[k], writable: true, configurable: true });
}
globalThis.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };

const { state, clearFilters } = await import('../src/state.js');
const { renderList } = await import('../src/screens/list.js');
const { renderDetail } = await import('../src/screens/detail.js');
const { renderRegister } = await import('../src/screens/register.js');
const { renderLogin } = await import('../src/screens/login.js');
const { openRandom, initRandomDialog } = await import('../src/screens/random.js');

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '  OK  ' : ' FAIL '} ${label}${cond || !extra ? '' : `  → ${extra}`}`);
};

const app = document.getElementById('app');
const errors = [];
dom.window.addEventListener('error', (e) => errors.push(e.message));

const sample = {
  id: 'a', name: '가상 식당 A', region: '용산', address: '서울 용산구 한강대로 100',
  cuisine: '한식', sub: '국밥', menu: '돼지국밥', menus: '돼지국밥·순대국', price: 12000,
  price_note: '런치 기준', tags: ['점심', '팀 회식'], link: 'https://example.com',
  source_type: '자료 조사', info_checked_on: '2026-10-02', hours: '평일 11:00–22:00',
  reserve: '예약 권장', wait: '확인 필요', walk_min: 5, dist_m: 400, icon: 'soup',
  lat: 37.5305, lng: 126.97, kakao_place_id: null, created_at: '2026-10-01T00:00:00Z',
  reviews: [
    { id: 'r1', author_name: null, body: '첫 후기 = 추천 이유', kind: 'member', situation: '점심', people: '2~3명', paid: 11000, created_at: '2026-09-01T00:00:00Z' },
    { id: 'r2', author_name: '조사 메모', body: '구글 조사 메모', kind: 'research', situation: null, people: null, paid: null, created_at: '2026-09-02T00:00:00Z' },
    { id: 'r3', author_name: 'Tax · Senior Associate', body: '가상 후기예요', kind: 'virtual', situation: '팀 회식', people: '4~6명', paid: 19000, created_at: '2026-09-03T00:00:00Z' },
  ],
};

console.log('\n── S0 로그인 ──');
renderLogin(app);
check('로그인 폼이 그려진다', !!app.querySelector('#auth-form'));
check('회사 이메일·비밀번호 칸이 있다', !!app.querySelector('[name=email]') && !!app.querySelector('[name=password]'));
check('사내 메일 인증 미연결 고지가 있다', app.textContent.includes('삼일 구성원임을 확인해주지는 않습니다'));

console.log('\n── S1 목록 ──');
state.restaurants = [sample];
state.status = 'ready';
clearFilters();
renderList(app);
check('식당 카드가 1개', app.querySelectorAll('.card').length === 1);
check('결과 수 표시', app.querySelector('#count')?.textContent === '1곳');
check('빠른 찾기 버튼 4개', app.querySelectorAll('[data-quick]').length === 4);
check('상황 칩 8개(전체+7)', app.querySelectorAll('[data-theme]').length === 8);
check('도보 거리 필터 존재', !!app.querySelector('#walk'));
check('약도 핀이 그려진다', app.querySelectorAll('.pin').length === 1);
check('예산 안내 문구', app.textContent.includes('예산 검색에서 가격 미확인 추천은 제외됩니다'));
check('카드에 최신 후기 발췌', app.querySelector('.review-snippet')?.textContent.includes('가상 후기예요'));
check('가상 후기 포함 표시', app.querySelector('.card-foot')?.textContent.includes('가상 포함'));

console.log('\n── S1 빈 결과 / 로딩 / 실패 ──');
state.filters.search = '없는식당이름';
renderList(app);
check('빈 결과 문구(기획안 문장 그대로)', app.textContent.includes('이 조건에 맞는 추천이 없어요. 조건을 바꿔보세요.'));
check('조건 초기화 버튼', !!app.querySelector('#empty-reset'));
clearFilters();

state.status = 'loading';
renderList(app);
check('불러오는 중 문구', app.textContent.includes('추천을 불러오는 중이에요.'));

state.status = 'error';
renderList(app);
check('실패 문구', app.textContent.includes('추천을 불러오지 못했어요. 다시 시도해주세요.'));
check('재시도 버튼', !!app.querySelector('#retry-load'));
state.status = 'ready';
renderList(app);

console.log('\n── S2 상세 ──');
await renderDetail(app, 'a');
check('식당명 표시', app.querySelector('h1')?.textContent === '가상 식당 A');
check('후기 3건 전부 표시', app.querySelectorAll('.review').length === 3);
check('조사 메모 배지', app.textContent.includes('조사 메모 · 실제 구성원 후기가 아니에요'));
check('가상 후기 배지', app.textContent.includes('가상 후기 · 시연용 예시'));
check('동료 후기 수는 조사 메모 제외(2건)', app.querySelector('#review-count')?.textContent === '2');
const summaryText = app.querySelector('.summary-box')?.textContent || '';
check('1인 실결제 평균 15,000원 (11000+19000)/2', summaryText.includes('15,000원'), summaryText);
check('개인정보 주의 문구', app.textContent.includes('고객사명, 프로젝트명'));
check('어떤 자리·인원·실결제 입력칸', !!app.querySelector('[name=situation]') && !!app.querySelector('[name=people]') && !!app.querySelector('[name=paid]'));
check('영업시간·예약 표시', app.textContent.includes('평일 11:00–22:00') && app.textContent.includes('예약 권장'));
check('정보 확인일 표시', app.textContent.includes('정보 확인일 2026-10-02'));
check('지도 링크는 카카오맵 (좌표가 있으면 등록 링크보다 우선)', app.querySelector('a[href^="https://map.kakao.com/link/map/"]')?.rel === 'noopener noreferrer');

console.log('\n── S2 찾을 수 없음 ──');
await renderDetail(app, 'nope');
check('없는 식당 문구', app.textContent.includes('추천 정보를 찾을 수 없어요.'));
check('목록으로 버튼', !!app.querySelector('#to-list'));

console.log('\n── S3 등록 ──');
renderRegister(app);
check('필수 입력칸이 모두 있다',
  ['name', 'region', 'address', 'cuisine', 'menu', 'reason'].every((n) => !!app.querySelector(`[name=${n}]`)));
check('세분류 칸', !!app.querySelector('[name=sub]'));
check('음식 종류 6종', app.querySelectorAll('[name=cuisine] option').length === 6);
check("'기타' 없음 / '아시안' 있음",
  !app.querySelector('[name=cuisine]').textContent.includes('기타') &&
  app.querySelector('[name=cuisine]').textContent.includes('아시안'));
check('상황 체크박스 7개', app.querySelectorAll('[name=tags]').length === 7);
check('지역 기본값 용산', app.querySelector('[name=region]')?.value === '용산');

console.log('\n── S3 입력 오류가 해당 칸 아래 뜬다 ──');
const form = app.querySelector('#register-form');
form.dispatchEvent(new dom.window.Event('submit', { cancelable: true, bubbles: true }));
await new Promise((r) => setTimeout(r, 10));
check('오류가 입력칸별로 붙는다', app.querySelectorAll('.field-error').length >= 5,
  `${app.querySelectorAll('.field-error').length}개`);
check('식당명 칸에 오류 표시', app.querySelector('[name=name]')?.getAttribute('aria-invalid') === 'true');
check('상황 미선택 오류', app.querySelector('fieldset .field-error')?.textContent.includes('추천 상황'));

const fillValid = (f, name, address) => {
  f.elements.name.value = name; f.elements.address.value = address;
  f.elements.menu.value = '국밥'; f.elements.reason.value = '중복 확인용';
  f.querySelector('[name=tags]').checked = true;
};
const submitAndWait = async (f) => {
  f.dispatchEvent(new dom.window.Event('submit', { cancelable: true, bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
};

console.log('\n── S3 이미 등록된 가게 → 팝업 ──');
state.restaurants[0].kakao_place_id = '777';
renderRegister(app);
const f1 = app.querySelector('#register-form');
fillValid(f1, '가상 식당 A', '서울 용산구 한강대로 100');
// 카카오 검색에서 같은 장소(777)를 고른 것처럼
Object.assign(f1.dataset, { placeLat: '37.5305', placeLng: '126.97', placeId: '777', placeAddress: '서울 용산구 한강대로 100' });
await submitAndWait(f1);
const dlg = app.querySelector('#dup-dialog');
check('팝업이 뜬다', dlg?.open === true);
check('팝업 문구', dlg?.textContent.includes('이미 등록된 가게예요') && dlg.textContent.includes('후기를 등록할 수 있어요'));
check('예 / 아니오 버튼', !!app.querySelector('#dup-yes') && !!app.querySelector('#dup-no'));
app.querySelector('#dup-yes').click();
await new Promise((r) => setTimeout(r, 10));
check('예 → 그 가게 상세로', dom.window.location.hash === '#/r/a' && dlg.open === false, dom.window.location.hash);
state.restaurants[0].kakao_place_id = null;

console.log('\n── S3 비슷한 식당이 있으면 저장하지 않음 ──');
renderRegister(app);
const f2 = app.querySelector('#register-form');
fillValid(f2, '가상 식당 A 신용산점', '서울 용산구 한강대로 100 1층');
await submitAndWait(f2);
const dupBox = app.querySelector('#dup-box');
check("'해당 장소를 찾을 수 없습니다'만 뜬다", dupBox && !dupBox.hidden && dupBox.textContent === '해당 장소를 찾을 수 없습니다');
check('팝업은 뜨지 않는다', app.querySelector('#dup-dialog')?.open !== true);
check('저장 버튼이 다시 눌린다', app.querySelector('#register-form button[type=submit]')?.disabled === false);

console.log('\n── S4 랜덤 ──');
state.status = 'ready';
clearFilters();
renderList(app);
initRandomDialog();
openRandom();
const rc = document.getElementById('random-content').textContent;
check('랜덤 창이 열린다', document.getElementById('random-dialog').open === true);
check('선택한 조건을 보여준다', rc.includes('선택한 조건'));
check('후보 수를 보여준다', rc.includes('후보 1곳'));
check('후보 1곳 안내 문구', rc.includes('이 조건에 맞는 추천이 한 곳이에요.'));
check('추천 이유 = 첫 후기', rc.includes('첫 후기 = 추천 이유'), rc.slice(0, 200));
check('공유 버튼', !!document.getElementById('share-random'));

console.log('\n── S1 메인은 4줄까지만, 더보기 → 전체 목록 ──');
{
  const saved = state.restaurants;
  state.restaurants = Array.from({ length: 12 }, (_, i) => ({ ...saved[0], id: 'm' + i, name: '가상 식당 ' + i, reviews: [] }));
  clearFilters();
  renderList(app, { full: false });
  const shown = () => [...app.querySelectorAll('.card')].filter((c) => !c.closest('[hidden]')).length;
  check('메인: 4줄(2열 × 4 = 8곳)만 보인다', shown() === 8, `${shown()}곳`);
  check("'+ 더보기 (4곳 더)'", app.querySelector('#more-cards')?.textContent.includes('4곳 더'));
  check('메인에는 ← 메인으로 없음', !app.querySelector('#to-home'));
  app.querySelector('#more-cards').click();
  await new Promise((r) => setTimeout(r, 10));
  check('더보기 → #/all', dom.window.location.hash === '#/all', dom.window.location.hash);
  renderList(app, { full: true });
  check('전체 목록: 12곳 모두', shown() === 12, `${shown()}곳`);
  check('전체 목록: 더보기 없음 / ← 메인으로 있음', !app.querySelector('#more-cards') && !!app.querySelector('#to-home'));
  state.restaurants = saved;
  renderList(app, { full: false });
}

console.log('\n── 런타임 오류 ──');
check('처리되지 않은 오류 없음', errors.length === 0, errors.join(' | '));

console.log(`\n${fail ? '❌' : '✅'}  통과 ${pass} / 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
