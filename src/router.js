// 아주 작은 해시 라우터.
// 목적: 브라우저 뒤로가기가 앱 안에서 동작하고, 식당 상세 링크를 동료에게 공유할 수 있게 합니다.
//   #/            목록
//   #/r/<id>      식당 상세
//   #/new         추천 등록

let handler = () => {};

export function parseRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [, head, tail] = hash.match(/^\/([^/]*)\/?(.*)$/) || [];

  if (head === 'r' && tail) return { name: 'detail', id: decodeURIComponent(tail) };
  if (head === 'new') return { name: 'register' };
  return { name: 'list' };
}

export function navigate(path, { replace = false } = {}) {
  const next = '#' + path;
  if (window.location.hash === next) {
    handler(parseRoute());
    return;
  }
  if (replace) window.location.replace(next);
  else window.location.hash = path;
}

export function startRouter(onRoute) {
  handler = onRoute;
  window.addEventListener('hashchange', () => handler(parseRoute()));
  handler(parseRoute());
}

export const toList = () => navigate('/');
export const toDetail = (id) => navigate('/r/' + encodeURIComponent(id));
export const toRegister = () => navigate('/new');
