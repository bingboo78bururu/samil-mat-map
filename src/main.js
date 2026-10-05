import './styles.css';
import { IS_CONFIGURED } from './config.js';
import { initAuth, getSession, getDisplayName, signOut } from './auth.js';
import { startRouter, parseRoute, toList, toRegister } from './router.js';
import { state, loadRestaurants } from './state.js';
import { renderLogin } from './screens/login.js';
import { renderList } from './screens/list.js';
import { renderDetail } from './screens/detail.js';
import { renderRegister } from './screens/register.js';
import { initRandomDialog, closeRandom } from './screens/random.js';

const app = document.getElementById('app');
const headerUser = document.getElementById('header-user');
const notice = document.getElementById('notice');
const footerLabel = document.getElementById('footer-label');

footerLabel.textContent =
  '가격은 확인된 값만 표시하고, 확인하지 못한 가격은 ‘가격 미확인’으로 둡니다. 후기는 구성원 개인의 경험과 의견입니다.';

// --- .env 가 없을 때 ---------------------------------------------------
if (!IS_CONFIGURED) {
  notice.innerHTML = '<strong>설정 필요</strong> · Supabase 연결 정보가 없습니다';
  app.innerHTML = `
    <div class="auth-wrap"><div class="auth-panel">
      <h1>연결 설정이 필요해요</h1>
      <p class="muted">프로젝트 폴더의 <code>.env.example</code>을 <code>.env</code>로 복사하고,
      Supabase 대시보드의 <strong>Project URL</strong>과 <strong>anon public</strong> 키를 채운 뒤
      개발 서버를 다시 시작해주세요.</p>
    </div></div>`;
} else {
  initRandomDialog();
  bindHeader();
  start();
}

// --- 시작 --------------------------------------------------------------
async function start() {
  await initAuth(handleSessionChange);
  render();
  startRouter(() => render());
}

function handleSessionChange(session) {
  if (!session) {
    // 로그아웃되면 가지고 있던 데이터를 모두 버립니다.
    state.restaurants = [];
    state.status = 'idle';
    closeRandom();
  }
  render();
}

// --- 화면 그리기 --------------------------------------------------------
function render() {
  const session = getSession();

  if (!session) {
    headerUser.hidden = true;
    notice.innerHTML =
      '<strong>로그인이 필요한 서비스</strong>';
    renderLogin(app);
    return;
  }

  headerUser.hidden = false;
  document.getElementById('who').textContent = getDisplayName();
  notice.innerHTML =
    '<strong>검토용 시제품</strong>';

  // 로그인 직후 목록 데이터를 한 번 불러옵니다.
  if (state.status === 'idle') {
    loadRestaurants().then(render);
  }

  const route = parseRoute();
  if (route.name === 'detail') renderDetail(app, route.id);
  else if (route.name === 'register') renderRegister(app);
  else renderList(app, { full: route.name === 'all' });
}

// --- 헤더 --------------------------------------------------------------
function bindHeader() {
  document.getElementById('home').onclick = () => { closeRandom(); toList(); };
  document.getElementById('new-top').onclick = toRegister;
  document.getElementById('logout').onclick = async () => {
    await signOut();
    window.location.hash = '/';
  };
}
