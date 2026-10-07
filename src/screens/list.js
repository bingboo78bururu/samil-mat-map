// S1. 목록 · 약도
import { THEMES, CUISINES, BUDGETS, WALKS, QUICK, MSG } from '../config.js';
import {
  state, candidates, clearFilters, applyQuick, loadRestaurants,
  regionOptions, cuisineOptions, conditionLabel,
} from '../state.js';
import { toDetail, toList, toAll } from '../router.js';
import { openRandom } from './random.js';
import { mapPanel, mountKakaoMap } from '../map.js';
import {
  esc, glyph, groupOf, priceLabel, tagsHtml, kindLabel, walkLabel, walkShort,
  options, selectOptions, peerReviews, researchMemo,
} from '../ui.js';

// 메인(#/)은 카드를 4줄까지만, 전체 목록(#/all)은 모두 보여줍니다.
const MAIN_ROWS = 4;
let fullList = false;

export function renderList(app, opts) {
  if (opts) {
    if (Boolean(opts.full) !== fullList) window.scrollTo?.(0, 0);
    fullList = Boolean(opts.full);
  }
  const f = state.filters;

  app.innerHTML = `
    <section class="hero">
      <div>
        <div class="eyebrow">동료의 추천, 쌓이는 경험</div>
        <h1>오늘은 어디서 먹을까요?</h1>
        <p>점심부터 회식, 출장지의 한 끼까지.<br>동료가 남긴 경험을 보고, 상황에 맞는 식당을 찾아보세요.</p>
      </div>
      <button class="primary" id="hero-random">오늘 한 곳 골라줘 ↗</button>
    </section>

    <section class="filters" aria-label="식당 탐색 조건">
      <div class="filter-top">
        <select id="region" class="control" aria-label="지역">${options(regionOptions(), f.region)}</select>
        <input id="search" class="control search" aria-label="식당명 또는 메뉴 검색"
               placeholder="식당·메뉴 검색" value="${esc(f.search)}">
      </div>

      <div class="quick" aria-label="빠른 찾기">
        <span>빠른 찾기</span>
        ${QUICK.map(([k, t, , hint]) =>
          `<button type="button" class="quick-btn" data-quick="${k}"${hint ? ` title="${esc(hint)}"` : ''}>${esc(t)}</button>`).join('')}
      </div>

      <div class="chips" id="theme-chips">
        ${['전체', ...THEMES].map((t) => `
          <button class="chip${t === f.theme ? ' active' : ''}" data-theme="${esc(t)}"
                  aria-pressed="${t === f.theme}">${esc(t)}</button>`).join('')}
      </div>

      <div class="filter-bottom">
        <details id="extra"${f.cuisine !== '전체' || f.budget !== '전체' || f.walk !== '전체' ? ' open' : ''}>
          <summary>음식 종류·예산·거리로 더 좁히기</summary>
          <div class="extra-filter">
            <label>음식 종류
              <select id="cuisine" class="control">${options(cuisineOptions(CUISINES), f.cuisine)}</select>
            </label>
            <label>대표 메뉴 1인 가격
              <select id="budget" class="control">${selectOptions(BUDGETS, f.budget)}</select>
            </label>
            <label>본사에서 도보
              <select id="walk" class="control">${selectOptions(WALKS, f.walk)}</select>
            </label>
          </div>
          <p class="extra-note">${MSG.budgetNote} 거리 검색에서는 위치 확인 중인 추천이 제외됩니다.</p>
        </details>
        <button id="clear-filters" class="quiet">조건 초기화</button>
      </div>
    </section>

    <section id="list-section">
      ${fullList ? '<button type="button" class="back" id="to-home">← 메인으로</button>' : ''}
      <div class="section-line">
        <div>
          <h2>동료가 남긴 추천 <span class="count" id="count"></span></h2>
          <p id="result-caption"></p>
        </div>
      </div>

      <button type="button" class="mobile-map-jump" id="mobile-map-jump">지도로 한 눈에 보기 ↓</button>

      <div class="content-grid">
        <div class="cards" id="cards"></div>
        <aside class="side">
          <div id="map-slot"></div>
          <div class="side-note">
            <strong>후기는 다음 동료의 길잡이</strong><br>
            어떤 자리였는지, 1인당 얼마였는지.<br>식사 후 경험을 한 줄 더 남겨주세요.
          </div>
        </aside>
      </div>
    </section>`;

  document.getElementById('mobile-map-jump').onclick = () =>
    document.querySelector('.map-panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  document.getElementById('region').onchange = (e) => { state.filters.region = e.target.value; update(); };
  document.getElementById('search').oninput = (e) => { state.filters.search = e.target.value; update(); };
  document.getElementById('cuisine').onchange = (e) => { state.filters.cuisine = e.target.value; update(); };
  document.getElementById('budget').onchange = (e) => { state.filters.budget = e.target.value; update(); };
  document.getElementById('walk').onchange = (e) => { state.filters.walk = e.target.value; update(); };

  document.querySelectorAll('[data-quick]').forEach((b) => {
    b.onclick = () => {
      const preset = QUICK.find(([k]) => k === b.dataset.quick);
      if (!preset) return;
      applyQuick(preset[2]);
      renderList(app);
    };
  });

  document.querySelectorAll('[data-theme]').forEach((b) => {
    b.onclick = () => {
      state.filters.theme = b.dataset.theme;
      document.querySelectorAll('[data-theme]').forEach((x) => {
        const on = x.dataset.theme === state.filters.theme;
        x.classList.toggle('active', on);
        x.setAttribute('aria-pressed', String(on));
      });
      update();
    };
  });

  if (fullList) document.getElementById('to-home').onclick = toList;

  document.getElementById('clear-filters').onclick = () => { clearFilters(); renderList(app); };
  document.getElementById('hero-random').onclick = openRandom;

  update();
}

function update() {
  const cards = document.getElementById('cards');
  const count = document.getElementById('count');
  const caption = document.getElementById('result-caption');
  const slot = document.getElementById('map-slot');

  if (state.status === 'loading' || state.status === 'idle') {
    count.textContent = '';
    caption.textContent = '';
    cards.innerHTML = `<div class="state"><h3>${MSG.loading}</h3></div>`;
    slot.innerHTML = '';
    return;
  }

  if (state.status === 'error') {
    count.textContent = '';
    caption.textContent = '';
    cards.innerHTML = `
      <div class="state">
        <h3>${MSG.loadFailed}</h3>
        <button class="primary retry" id="retry-load">다시 시도</button>
      </div>`;
    slot.innerHTML = '';
    document.getElementById('retry-load').onclick = async () => {
      state.status = 'loading';
      update();
      await loadRestaurants();
      renderList(document.getElementById('app'));
    };
    return;
  }

  const rows = candidates();
  count.textContent = rows.length + '곳';
  caption.textContent = conditionLabel() || '본사에서 가까운 순으로 보여드려요';

  cards.innerHTML = rows.length
    ? rows.map(card).join('')
    : `<div class="empty">
         <h3>${MSG.emptyResult}</h3>
         <p class="muted">새로 알게 된 곳이 있다면 첫 추천을 남겨주세요.</p>
         <button id="empty-reset">조건 초기화</button>
       </div>`;

  if (!fullList) limitRows(cards, rows.length);
  slot.innerHTML = mapPanel(rows, state.restaurants);
  mountKakaoMap(slot.querySelector('.map-panel'), rows, state.restaurants, toDetail);

  if (!rows.length) {
    document.getElementById('empty-reset').onclick = () => {
      clearFilters();
      renderList(document.getElementById('app'));
    };
  }

  bindDetail();
}

// 메인에서는 지금 화면의 한 줄 카드 수 × 4줄만 보이고, 나머지는 '+ 더보기'(전체 목록)로.
// 한 줄 카드 수는 화면 폭에 따라 CSS가 정하므로 그려진 그리드에서 읽습니다.
function limitRows(cards, total) {
  const cols = gridColumns(getComputedStyle(cards).gridTemplateColumns);
  const limit = cols * MAIN_ROWS;
  // 그리드 칸은 카드를 감싼 바깥 요소라, 그것을 숨겨야 빈 줄 간격이 생기지 않습니다.
  const items = [...cards.children].filter((el) => !el.classList.contains('more-cards'));
  items.forEach((el, i) => { el.hidden = i >= limit; });
  cards.querySelector('.more-cards')?.remove();
  if (total > limit) {
    cards.insertAdjacentHTML('beforeend',
      `<button type="button" class="more-cards" id="more-cards">+ 더보기 <span>(${total - limit}곳 더)</span></button>`);
    document.getElementById('more-cards').onclick = toAll;
  }
}

// 브라우저는 '170px 170px'처럼 계산된 값을, 일부 환경은 'repeat(2, …)'를 돌려줍니다.
function gridColumns(value) {
  const repeat = String(value).match(/^repeat\((\d+)/);
  if (repeat) return Number(repeat[1]);
  return String(value).split(/\s+/).filter((t) => /px$|fr$|%$/.test(t)).length || 2;
}

// 화면 폭이 바뀌면(회전 등) 한 줄 카드 수가 달라질 수 있어 다시 맞춥니다.
let resizeTimer = 0;
window.addEventListener?.('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const cards = document.getElementById('cards');
    if (cards && !fullList) limitRows(cards, cards.querySelectorAll('.card').length);
  }, 150);
});

// 카드와 약도 핀 둘 다 상세로 이동합니다.
function bindDetail() {
  document.querySelectorAll('[data-detail]').forEach((el) => {
    el.onclick = () => toDetail(el.dataset.detail);
    if (el.tagName === 'g') {
      el.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toDetail(el.dataset.detail); }
      };
    }
  });
}

function card(r) {
  const peers = peerReviews(r);
  const last = peers.at(-1);
  const memo = researchMemo(r);
  const snippet = last ? last.body : memo ? '조사 메모: ' + memo.body : '첫 후기를 남겨주세요.';

  return `
    <article class="card-wrap">
      <button class="card" data-detail="${esc(r.id)}" aria-label="${esc(r.name)} 상세 보기">
        <div class="card-art g-${groupOf(r)}">${glyph(r)}<span class="art-context">${esc(r.walk_min == null ? r.region : walkShort(r))}</span></div>
        <div class="card-body">
          <div class="card-title">${esc(r.name)}</div>
          <div class="card-mini">${esc(walkShort(r))} · ${esc(r.sub || r.cuisine)}</div>
          <div class="card-meta">${esc(walkLabel(r))} · ${esc(kindLabel(r))}${r.menu !== r.sub ? ' · ' + esc(r.menu) : ''} · ${priceLabel(r)}</div>
          <div class="tags">${tagsHtml(r)}</div>
          <p class="review-snippet">“${esc(snippet)}”</p>
          <div class="card-foot">
            <strong>동료 후기 ${peers.length}개</strong>
            <span>↗</span>
          </div>
        </div>
      </button>
    </article>`;
}
