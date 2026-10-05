// S2. 식당 상세
import { THEMES, PEOPLE, MSG } from '../config.js';
import { state, getRestaurant, loadRestaurants } from '../state.js';
import { fetchRestaurant, createReview, describeError } from '../api.js';
import { toList } from '../router.js';
import {
  esc, glyph, groupOf, won, priceLabel, tagsHtml, kindLabel, walkLabel,
  dateLabel, authorLabel, options, mapLink, peerReviews, summarize,
  scrollToTop, clearFieldErrors, showFieldError, focusFirstError, notify,
} from '../ui.js';

export async function renderDetail(app, id) {
  let restaurant = getRestaurant(id);

  // 목록을 아직 못 불러온 상태에서 상세 링크로 바로 들어온 경우에만 한 건을 직접 조회합니다.
  // 목록이 이미 준비됐는데 없는 id라면 조회해봐야 결과가 같으므로 바로 안내합니다.
  if (!restaurant && state.status !== 'ready') {
    app.innerHTML = `<div class="state"><h3>${MSG.loading}</h3></div>`;
    try {
      restaurant = await fetchRestaurant(id);
    } catch {
      app.innerHTML = `
        <div class="state">
          <h3>${MSG.loadFailed}</h3>
          <button class="primary retry" id="retry">다시 시도</button>
        </div>`;
      document.getElementById('retry').onclick = () => renderDetail(app, id);
      return;
    }
  }

  if (!restaurant) {
    // 다른 동료가 방금 올린 추천이라 내 목록에 없을 수도 있어서 새로고침 수단을 함께 둡니다.
    app.innerHTML = `
      <div class="state">
        <h3>${MSG.notFound}</h3>
        <p class="muted">다른 동료가 방금 올린 추천이라면 목록을 새로 불러와 보세요.</p>
        <button class="primary retry" id="to-list">추천 목록으로</button>
        <button class="retry" id="reload-list">목록 새로 불러오기</button>
      </div>`;
    document.getElementById('to-list').onclick = toList;
    document.getElementById('reload-list').onclick = async () => {
      await loadRestaurants();
      renderDetail(app, id);
    };
    return;
  }

  paint(app, restaurant);
  scrollToTop();
}

function paint(app, r) {
  const peers = peerReviews(r);
  const s = summarize(r);
  // 조사 메모를 맨 아래로 내려 동료 후기가 먼저 보이게 합니다.
  const ordered = [...(r.reviews || [])].sort((a, b) => (a.kind === 'research' ? 1 : 0) - (b.kind === 'research' ? 1 : 0));

  app.innerHTML = `
    <button class="back" id="back-list">← 추천 목록으로</button>

    <div class="detail-layout">
      <section class="detail-main">
        <div class="detail-cover g-${groupOf(r)}">
          ${glyph(r)}
          <p>${esc(r.region)} · ${esc(kindLabel(r))}${r.source_type ? `<br>${esc(r.source_type)}` : ''}</p>
        </div>
        <div class="eyebrow">동료의 경험이 쌓이는 곳</div>
        <h1>${esc(r.name)}</h1>
        <p class="detail-price">${esc(walkLabel(r))} · ${esc(kindLabel(r))}${r.menu !== r.sub ? ' · ' + esc(r.menu) : ''} · ${priceLabel(r)}</p>
        <div class="tags">${tagsHtml(r)}</div>

        <div class="summary-box" aria-label="삼일 후기 요약">
          <div>동료 후기<strong>${s.count}개</strong>${s.hasVirtual ? '<small>가상 후기 포함</small>' : ''}</div>
          <div>1인 실결제 평균<strong>${s.avg ? won(s.avg) : '기록 없음'}</strong>${s.paidN ? `<small>${s.paidN}건 기준</small>` : ''}</div>
          <div>많이 다녀온 자리<strong>${esc(s.top || '아직 없음')}</strong></div>
        </div>

        <button type="button" class="quiet jump-reviews" id="jump-reviews">후기 읽고 남기기 ↓</button>
      </section>

      <section class="detail-reviews">
        <section class="reviews">
          <h2>동료 후기 <span class="count" id="review-count">${peers.length}</span></h2>
          <div id="reviews">${ordered.map(reviewItem).join('')}</div>

          <form class="review-form" id="review-form" novalidate>
            <h3>어떤 자리였나요?</h3>
            <div class="notice">${MSG.privacy}</div>

            <div class="field-row">
              <label class="field">어떤 자리
                <select class="control" name="situation"><option value="">선택 안 함</option>${options(THEMES, '')}</select>
              </label>
              <label class="field">인원
                <select class="control" name="people"><option value="">선택 안 함</option>${options(PEOPLE, '')}</select>
              </label>
            </div>

            <label class="field">1인 실결제 금액
              <input class="control" name="paid" inputmode="numeric" placeholder="예: 12000">
              <small>선택 · 1인당 실제로 낸 금액. 메뉴판 가격이 아니어도 돼요.</small>
            </label>

            <label class="field">표시 이름
              <input class="control" name="author" maxlength="30" placeholder="선택 · 비워두면 동료로 표시">
            </label>

            <label class="field">후기 <span class="muted">*</span>
              <textarea class="control" name="text" maxlength="1000"
                        placeholder="어떤 자리에서 좋았나요? 다음 동료에게 알려주세요."></textarea>
            </label>

            <p class="error" id="review-error" role="alert"></p>
            <button class="primary" type="submit">후기 남기기</button>
          </form>
        </section>
      </section>

      <aside class="detail-info">
        <h3>식당 정보</h3>
        <dl class="info-list">
          <div><dt>음식 종류</dt><dd>${esc(r.sub ? r.cuisine + ' > ' + r.sub : r.cuisine)}</dd></div>
          <div><dt>대표 메뉴</dt><dd>${esc(r.menus || r.menu)}</dd></div>
          <div><dt>대표 메뉴 1인 가격</dt><dd>${priceLabel(r)}${r.price_note ? ` <span class="muted">(${esc(r.price_note)})</span>` : ''}</dd></div>
          <div><dt>지역·주소</dt><dd>${esc(r.region)} · ${esc(r.address)}</dd></div>
          <div><dt>본사에서 거리</dt><dd>${esc(walkLabel(r))}${r.dist_m ? ` <span class="muted">(약 ${r.dist_m.toLocaleString('ko-KR')}m, 직선거리×1.3 추정)</span>` : ''}</dd></div>
          ${r.hours ? `<div><dt>영업시간 (확인 필요)</dt><dd>${esc(r.hours)}</dd></div>` : ''}
          ${r.reserve ? `<div><dt>예약 · 웨이팅</dt><dd>${esc(r.reserve)}${r.wait ? ' · ' + esc(r.wait) : ''}</dd></div>` : ''}
          <div><dt>추천 상황</dt><dd>${esc((r.tags || []).join(', '))}</dd></div>
          ${r.source_type ? `<div><dt>추천 근거</dt><dd>${esc(r.source_type)}</dd></div>` : ''}
        </dl>
        ${mapLink(r)
          ? `<a href="${esc(mapLink(r))}" target="_blank" rel="noopener noreferrer">지도에서 보기 ↗</a>`
          : '<p class="muted">지도 링크가 아직 없어요. 위 주소를 확인해주세요.</p>'}
        <p class="footnote">${r.info_checked_on ? `정보 확인일 ${esc(r.info_checked_on)}. ` : ''}좌석·가격·영업 정보는 방문 전에 확인해주세요. 후기는 구성원의 경험과 의견입니다.</p>
      </aside>
    </div>`;

  document.getElementById('jump-reviews').onclick = () =>
    document.querySelector('.detail-reviews').scrollIntoView({ block: 'start', behavior: 'smooth' });

  // 목록 조건은 state.filters에 그대로 남아 있으므로 조건이 유지된 채 돌아갑니다.
  document.getElementById('back-list').onclick = toList;

  bindReviewForm(r);
}

function reviewItem(v) {
  const meta = [v.situation, v.people, v.paid ? '1인 ' + won(v.paid) : '']
    .filter(Boolean)
    .map((x) => `<span>${esc(x)}</span>`)
    .join('');

  // 구성원이 직접 남긴 후기가 아니면 반드시 배지를 붙입니다.
  const flag =
    v.kind === 'research' ? '<div class="research-flag">조사 메모 · 실제 구성원 후기가 아니에요</div>'
    : v.kind === 'virtual' ? '<div class="virtual-flag">가상 후기 · 시연용 예시</div>'
    : '';

  return `
    <article class="review${v.kind === 'research' ? ' research' : ''}">
      <header>
        <span class="review-author">${esc(authorLabel(v))}</span>
        <span>${esc(dateLabel(v.created_at))}</span>
      </header>
      ${flag}
      <p>${esc(v.body)}</p>
      ${meta ? `<div class="review-meta">${meta}</div>` : ''}
    </article>`;
}

function bindReviewForm(r) {
  const form = document.getElementById('review-form');
  const errorBox = document.getElementById('review-error');

  form.onsubmit = async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    errorBox.textContent = '';

    const body = form.elements.text.value.trim();
    const rawPaid = form.elements.paid.value.trim().replace(/,/g, '');
    let ok = true;

    if (!body) { showFieldError(form, 'text', '후기를 입력해주세요.'); ok = false; }
    if (rawPaid && (!/^\d+$/.test(rawPaid) || Number(rawPaid) <= 0 || !Number.isSafeInteger(Number(rawPaid)))) {
      showFieldError(form, 'paid', '1인 실결제 금액은 0보다 큰 원 단위 숫자로 입력해주세요.');
      ok = false;
    }
    if (!ok) { focusFirstError(form); return; }

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = MSG.saving;

    try {
      // 공동 저장소에 먼저 저장하고, 성공한 뒤에만 화면에 반영합니다(기획안 S2).
      const saved = await createReview({
        restaurantId: r.id,
        authorName: form.elements.author.value.trim(),
        body,
        situation: form.elements.situation.value,
        people: form.elements.people.value,
        paid: rawPaid ? Number(rawPaid) : null,
      });

      r.reviews.push(saved);
      const cached = getRestaurant(r.id);
      if (cached && cached !== r) cached.reviews.push(saved);

      // 요약 박스까지 다시 계산해야 해서 화면을 새로 그립니다.
      paint(document.getElementById('app'), r);
      document.querySelector('.detail-reviews').scrollIntoView({ block: 'start' });
      notify('후기가 등록됐어요. 다음 동료의 선택이 쉬워졌어요!');
    } catch (err) {
      // 실패하면 입력한 값을 그대로 둡니다.
      errorBox.textContent = describeError(err) || MSG.saveFailed;
      submit.disabled = false;
      submit.textContent = '후기 남기기';
    }
  };
}
