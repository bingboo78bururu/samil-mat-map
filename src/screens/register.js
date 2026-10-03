// S3. 추천 등록
import { THEMES, CUISINES, DEFAULT_REGION, MSG } from '../config.js';
import { createRestaurant, describeError } from '../api.js';
import { clearFilters, loadRestaurants } from '../state.js';
import { toList } from '../router.js';
import {
  options, esc, validLink, scrollToTop,
  clearFieldErrors, showFieldError, focusFirstError, notify,
} from '../ui.js';

const SOURCE_TYPES = ['직접 방문', '동료 추천', '자료 조사'];

export function renderRegister(app) {
  app.innerHTML = `
    <div class="register-header">
      <button class="back" id="cancel-top">← 추천 목록으로</button>
      <div class="eyebrow">나의 경험을 동료에게</div>
      <h1>추천 식당을 하나 더해요</h1>
      <p class="muted">기본 정보와 추천 이유를 남기면, 다음 동료의 선택이 쉬워져요.</p>
    </div>

    <form class="register-panel" id="register-form" novalidate>
      <div class="notice">${MSG.privacy}</div>

      <div class="form-grid">
        <label class="field">식당명 <span class="muted">*</span>
          <input name="name" class="control" maxlength="60" placeholder="상호명을 입력해주세요">
        </label>
        <label class="field">지역 <span class="muted">*</span>
          <input name="region" class="control" maxlength="30" value="${esc(DEFAULT_REGION)}" placeholder="용산, 부산 등">
        </label>
        <label class="field full">주소 <span class="muted">*</span>
          <input name="address" class="control" maxlength="150" placeholder="지도에서 확인한 실제 주소를 입력해주세요">
        </label>
        <label class="field">음식 종류 <span class="muted">*</span>
          <select name="cuisine" class="control">${options(CUISINES, '한식')}</select>
        </label>
        <label class="field">세분류
          <input name="sub" class="control" maxlength="20" placeholder="예: 국밥, 베트남, 이탈리안">
          <small>선택 · 음식 종류를 더 구체적으로 적어주세요.</small>
        </label>
        <label class="field">대표 메뉴 <span class="muted">*</span>
          <input name="menu" class="control" maxlength="60" placeholder="대표 메뉴명">
        </label>
        <label class="field">대표 메뉴 1인 가격
          <input name="price" class="control" inputmode="numeric" placeholder="예: 12000">
          <small>선택 · 확인하지 못했으면 비워주세요. 0원이나 추정 가격을 넣지 않습니다.</small>
        </label>
        <label class="field">추천 근거
          <select name="sourceType" class="control">
            <option value="">선택 안 함</option>
            ${SOURCE_TYPES.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          </select>
          <small>조사만 했다면 '자료 조사'를 골라주세요.</small>
        </label>
        <label class="field">표시 이름
          <input name="author" class="control" maxlength="30" placeholder="선택 · 비워두면 동료로 표시">
        </label>
      </div>

      <fieldset class="tag-field">
        <legend>어떤 자리에 추천하나요? <span class="muted">* 여러 개 선택 가능</span></legend>
        ${THEMES.map((t) => `
          <label class="tag-option"><input type="checkbox" name="tags" value="${esc(t)}">${esc(t)}</label>`).join('')}
      </fieldset>

      <label class="field">추천 이유·첫 후기 <span class="muted">*</span>
        <textarea name="reason" class="control" maxlength="1000"
                  placeholder="직접 경험한 점이나 추천 근거를 알려주세요. 조사한 정보라면 조사 내용임을 밝혀주세요."></textarea>
      </label>

      <label class="field">출처·지도 링크
        <input name="link" class="control" placeholder="선택 · https://로 시작하는 주소">
        <small>확인한 실제 링크가 있을 때만 입력해주세요.</small>
      </label>

      <p class="error" id="register-error" role="alert"></p>

      <div class="form-actions">
        <button type="button" id="cancel-register">취소</button>
        <button type="submit" class="primary">추천 등록</button>
      </div>

      <p class="footnote">직접 등록한 식당은 좌표가 없어 약도에 표시되지 않고 '위치 확인 중'으로 보여요. 주소를 좌표로 바꾸는 작업은 빌드팀이 카카오맵 연결 때 함께 처리합니다.</p>
    </form>`;

  document.getElementById('cancel-top').onclick = toList;
  document.getElementById('cancel-register').onclick = toList;

  const form = document.getElementById('register-form');
  const errorBox = document.getElementById('register-error');

  form.onsubmit = async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    errorBox.textContent = '';

    const value = (n) => form.elements[n].value.trim();
    const tags = [...form.querySelectorAll('[name=tags]:checked')].map((x) => x.value);
    let ok = true;

    for (const [name, label] of [
      ['name', '식당명'], ['region', '지역'], ['address', '주소'],
      ['menu', '대표 메뉴'], ['reason', '추천 이유'],
    ]) {
      if (!value(name)) { showFieldError(form, name, `${label}을(를) 입력해주세요.`); ok = false; }
    }

    if (!tags.length) { showFieldError(form, 'tags', '추천 상황을 하나 이상 골라주세요.'); ok = false; }

    const rawPrice = value('price').replace(/,/g, '');
    if (rawPrice && (!/^\d+$/.test(rawPrice) || Number(rawPrice) <= 0 || !Number.isSafeInteger(Number(rawPrice)))) {
      showFieldError(form, 'price', '가격은 0보다 큰 원 단위 정수로 입력해주세요.');
      ok = false;
    }

    const link = value('link');
    if (link && !validLink(link)) {
      showFieldError(form, 'link', '출처·지도 링크는 http:// 또는 https:// 주소로 입력해주세요.');
      ok = false;
    }

    if (!ok) { focusFirstError(form); return; }

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = MSG.saving;

    try {
      // 공동 저장소에 성공적으로 저장된 뒤에만 성공을 알립니다(기획안 S3).
      await createRestaurant({
        name: value('name'),
        region: value('region'),
        address: value('address'),
        cuisine: value('cuisine'),
        sub: value('sub'),
        menu: value('menu'),
        price: rawPrice ? Number(rawPrice) : null,
        tags,
        link: link || null,
        sourceType: value('sourceType') || null,
        authorName: value('author'),
        reason: value('reason'),
      });

      // 새 항목이 보이도록 조건을 전체로 초기화한 뒤 목록으로 돌아갑니다.
      clearFilters();
      await loadRestaurants();
      notify(MSG.registered);
      toList();
    } catch (err) {
      // 실패하면 입력한 값을 그대로 둡니다. 성공 메시지를 먼저 띄우지 않습니다.
      errorBox.textContent = describeError(err) || MSG.saveFailed;
      errorBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
      submit.disabled = false;
      submit.textContent = '추천 등록';
    }
  };

  scrollToTop();
}
