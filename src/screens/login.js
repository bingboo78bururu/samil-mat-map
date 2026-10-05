// S0. 로그인 / 회원가입
// 로그인하지 않으면 다른 화면은 열리지 않습니다.
import { ALLOWED_EMAIL_DOMAINS, DEMO_EMAIL, DEMO_PASSWORD } from '../config.js';
import { signIn, signUp, emailDomainAllowed, describeAuthError } from '../auth.js';
import { esc, clearFieldErrors, showFieldError, focusFirstError, notify } from '../ui.js';

let mode = 'login'; // login | signup

export function renderLogin(app) {
  const domains = ALLOWED_EMAIL_DOMAINS.map((d) => '@' + d).join(', ');
  const isSignup = mode === 'signup';
  const demo = !isSignup && DEMO_EMAIL && DEMO_PASSWORD;

  app.innerHTML = `
    <div class="auth-wrap">
      <div class="eyebrow">삼일 구성원을 위한 맛집지도</div>
      <h1>${isSignup ? '회원가입' : '로그인'}</h1>
      <p class="auth-intro">동료가 남긴 추천과 후기를 보려면 로그인이 필요해요.</p>

      <div class="auth-panel">
        <div class="auth-tabs" role="group" aria-label="로그인 또는 회원가입 선택">
          <button type="button" id="tab-login"  aria-pressed="${!isSignup}">로그인</button>
          <button type="button" id="tab-signup" aria-pressed="${isSignup}">회원가입</button>
        </div>

        <form id="auth-form" novalidate>
          <label class="field">회사 이메일
            <input class="control" name="email" type="email" autocomplete="email"
                   inputmode="email"${demo ? ` value="${esc(DEMO_EMAIL)}"` : ''} placeholder="${esc(ALLOWED_EMAIL_DOMAINS[0] ? 'name' + '@' + ALLOWED_EMAIL_DOMAINS[0] : 'name@company.com')}">
            ${domains ? `<small>${esc(domains)} 주소로만 가입할 수 있어요.</small>` : ''}
          </label>

          <label class="field">비밀번호
            <input class="control" name="password" type="password"
                   autocomplete="${isSignup ? 'new-password' : 'current-password'}"${demo ? ` value="${esc(DEMO_PASSWORD)}"` : ''}
                   placeholder="${isSignup ? '8자 이상' : ''}">
          </label>

          ${isSignup ? `
          <label class="field">표시 이름
            <input class="control" name="displayName" maxlength="30" placeholder="선택 · 비워두면 동료로 표시">
            <small>후기에 보일 이름이에요. 익명으로 쓰려면 비워두세요.</small>
          </label>` : ''}

          ${demo ? '<p class="demo-note">시연용 테스트 계정이 입력돼 있어요. 로그인 버튼만 누르면 돼요.</p>' : ''}
          <p class="error" id="auth-error" role="alert"></p>
          <button class="primary" type="submit">${isSignup ? '회원가입' : '로그인'}</button>
        </form>

        <p class="auth-note">
          <strong>이번 버전 안내</strong><br>
          사내 메일 인증(메일로 보낸 링크 확인) 기능은 아직 연결되지 않았습니다.
          지금의 로그인은 접근을 제한할 뿐, 삼일 구성원임을 확인해주지는 않습니다.
        </p>
      </div>
    </div>`;

  document.getElementById('tab-login').onclick = () => { mode = 'login'; renderLogin(app); };
  document.getElementById('tab-signup').onclick = () => { mode = 'signup'; renderLogin(app); };

  const form = document.getElementById('auth-form');
  const errorBox = document.getElementById('auth-error');

  form.onsubmit = async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    errorBox.textContent = '';

    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const displayName = isSignup ? form.elements.displayName.value.trim() : '';
    let ok = true;

    if (!email) { showFieldError(form, 'email', '회사 이메일을 입력해주세요.'); ok = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFieldError(form, 'email', '이메일 형식을 확인해주세요.'); ok = false; }
    else if (isSignup && !emailDomainAllowed(email)) {
      showFieldError(form, 'email', `${domains} 주소로만 가입할 수 있어요.`); ok = false;
    }

    if (!password) { showFieldError(form, 'password', '비밀번호를 입력해주세요.'); ok = false; }
    else if (isSignup && password.length < 8) { showFieldError(form, 'password', '비밀번호는 8자 이상으로 입력해주세요.'); ok = false; }

    if (!ok) { focusFirstError(form); return; }

    const submit = form.querySelector('button[type="submit"]');
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = isSignup ? '가입 중…' : '로그인 중…';

    try {
      if (isSignup) {
        const result = await signUp({ email, password, displayName });
        if (!result.session) {
          // 메일 확인이 켜져 있는 프로젝트에서는 세션이 바로 생기지 않습니다.
          errorBox.textContent = '가입 요청을 받았어요. 메일함에서 인증을 완료한 뒤 로그인해주세요.';
          mode = 'login';
          return;
        }
        notify('가입이 완료됐어요.');
      } else {
        await signIn({ email, password });
      }
      // 로그인 성공 후 화면 전환은 main.js의 세션 변경 감지가 처리합니다.
    } catch (err) {
      errorBox.textContent = describeAuthError(err);
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  };
}
