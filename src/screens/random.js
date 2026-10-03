// S4. 랜덤 결과 (창)
import { MSG } from '../config.js';
import { state, candidates, conditionLabel } from '../state.js';
import { toDetail } from '../router.js';
import {
  esc, glyph, groupOf, priceLabel, tagsHtml, walkLabel, shareText, notify,
} from '../ui.js';

let picked = null;

export function openRandom() {
  if (state.status !== 'ready') {
    notify(state.status === 'error' ? MSG.loadFailed : MSG.loading);
    return;
  }

  // 랜덤은 필터링된 후보를 그대로 씁니다. 전체 식당을 다시 뽑지 않습니다(기획안 4장).
  const pool = candidates();

  // 후보가 0개면 결과를 만들지 않습니다.
  if (!pool.length) {
    notify(MSG.emptyResult);
    return;
  }

  paint(pool);
}

function paint(pool) {
  const dialog = document.getElementById('random-dialog');
  const r = pool[Math.floor(Math.random() * pool.length)];
  picked = r.id;

  // 기획안 S4는 '추천 이유'를 보여줍니다 = 첫 후기.
  const reason = (r.reviews || [])[0];

  document.getElementById('random-content').innerHTML = `
    <div class="random-wrap">
      <div class="random-top">
        <span>후보 ${pool.length}곳</span>
        <button class="quiet" id="close-random" aria-label="결과 닫기">✕</button>
      </div>
      <p class="random-conditions">선택한 조건 · ${esc(conditionLabel() || '전체 조건')}</p>

      <div class="random-art g-${groupOf(r)}">${glyph(r)}</div>
      <div class="eyebrow">오늘의 한 곳</div>
      <h2>${esc(r.name)}</h2>
      <p>${esc(walkLabel(r))} · ${esc(r.menu)} · ${priceLabel(r)}</p>
      <div class="tags">${tagsHtml(r)}</div>
      ${reason ? `<p style="margin-top:18px">“${esc(reason.body)}”</p>` : ''}
      ${pool.length === 1 ? `<p>${MSG.onlyOne}</p>` : ''}

      <button class="primary" id="random-detail">이 식당 자세히 보기</button>
      <button class="reroll" id="share-random">팀원에게 공유하기</button>
      <button class="reroll" id="reroll">다시 고르기</button>

      <div id="share-fallback" hidden>
        <textarea class="control" readonly rows="4"></textarea>
        <small class="muted">위 문구를 복사해 팀 메신저에 붙여넣어 주세요.</small>
      </div>

      <p style="font-size:11px;margin:12px 0 0">같은 식당이 다시 나올 수 있어요.</p>
    </div>`;

  document.getElementById('close-random').onclick = () => dialog.close();
  document.getElementById('random-detail').onclick = () => {
    dialog.close();
    toDetail(picked);
  };
  // 같은 조건의 후보에서 다시 고릅니다.
  document.getElementById('reroll').onclick = () => paint(candidates());

  document.getElementById('share-random').onclick = async () => {
    const text = shareText(r);
    try {
      await navigator.clipboard.writeText(text);
      notify('공유 문구를 복사했어요. 팀 메신저에 붙여넣어 주세요.');
    } catch {
      // 클립보드 권한이 없으면 직접 복사하도록 보여줍니다.
      const box = document.getElementById('share-fallback');
      box.hidden = false;
      const ta = box.querySelector('textarea');
      ta.value = text;
      ta.select();
    }
  };

  if (!dialog.open) dialog.showModal();
}

export function initRandomDialog() {
  const dialog = document.getElementById('random-dialog');
  // 바깥 영역 클릭으로 닫기
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    const outside =
      e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
    if (outside) dialog.close();
  });
}

export function closeRandom() {
  const dialog = document.getElementById('random-dialog');
  if (dialog?.open) dialog.close();
}
