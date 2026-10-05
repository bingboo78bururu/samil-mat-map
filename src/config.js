// 앱 전역 상수. 기획안 3~5장과 목업 v8의 선택지를 한곳에 모읍니다.
// 값을 바꾸면 Supabase의 CHECK 제약(supabase/schema.sql, migrations/)도 같이 바꿔야 합니다.

export const THEMES = ['점심', '동기 회식', '팀 회식', '고객사 응대', '출장', '퇴근 후', '데이트'];

// 목업 v8 기준. 기획안 5장의 '한식/중식/일식/양식/기타'에서 바뀐 값이라
// 기획 문서도 같이 고쳐야 합니다.
export const CUISINES = ['한식', '중식', '일식', '양식', '아시안', '카페·디저트'];

// 후기 작성 시 인원 선택지
export const PEOPLE = ['1명', '2~3명', '4~6명', '7명 이상'];

export const BUDGETS = [
  ['전체', '전체'],
  ['10000', '10,000원 이하'],
  ['15000', '15,000원 이하'],
  ['20000', '20,000원 이하'],
];

export const WALKS = [
  ['전체', '전체'],
  ['5', '5분 이내'],
  ['10', '10분 이내'],
  ['15', '15분 이내'],
];

// 빠른 찾기 프리셋. [키, 버튼 이름, 적용할 조건, 툴팁]
export const QUICK = [
  ['lunch10', '점심 1시간 컷', { theme: '점심', walk: '10' }, '도보 10분 이내 점심'],
  ['team', '팀 회식 후보', { theme: '팀 회식' }, ''],
  ['client', '고객사 응대', { theme: '고객사 응대' }, ''],
  ['after', '퇴근 후 한잔', { theme: '퇴근 후' }, ''],
];

// 본사(삼일회계법인, 서울 용산구 한강대로 100) 기준점.
// 약도와 '본사에서 도보 N분' 계산의 원점입니다.
// 카카오 로컬 API 연결 시 이 좌표도 카카오 기준으로 다시 확인할 것.
export const HQ = { lat: 37.528837, lng: 126.968647, label: '본사' };

export const DEFAULT_REGION = '용산';

// Vite 밖(테스트 스크립트 등)에서 import 해도 터지지 않게 감쌉니다.
const env = import.meta.env ?? {};

export const SUPABASE_URL = env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

// 가입 안내 문구용. 실제 차단은 DB 트리거가 합니다(프런트 값은 우회 가능).
export const ALLOWED_EMAIL_DOMAINS = String(env.VITE_ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export const IS_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// 카카오 JavaScript 키(공개 키). 없으면 등록 화면의 장소 검색만 빠지고 직접 입력으로 동작합니다.
export const KAKAO_JS_KEY = env.VITE_KAKAO_JS_KEY || '';

// 시연용: 로그인 화면에 테스트 계정을 미리 채웁니다. 값이 없으면 빈 칸(기존 동작).
// VITE_ 값은 배포된 사이트 코드에 그대로 들어갑니다 — 시연용 계정만 넣으세요. 저장소(공개)에는 넣지 않습니다.
export const DEMO_EMAIL = env.VITE_DEMO_EMAIL || '';
export const DEMO_PASSWORD = env.VITE_DEMO_PASSWORD || '';

// 화면에 그대로 쓰는 문구. 기획안에 지정된 문장을 바꾸지 마세요.
export const MSG = {
  loading: '추천을 불러오는 중이에요.',
  loadFailed: '추천을 불러오지 못했어요. 다시 시도해주세요.',
  emptyResult: '이 조건에 맞는 추천이 없어요. 조건을 바꿔보세요.',
  notFound: '추천 정보를 찾을 수 없어요.',
  saveFailed: '저장하지 못했어요. 다시 시도해주세요.',
  registered: '추천이 등록됐어요.',
  budgetNote: '예산 검색에서 가격 미확인 추천은 제외됩니다.',
  onlyOne: '이 조건에 맞는 추천이 한 곳이에요.',
  saving: '저장 중…',
  privacy: '고객사명, 프로젝트명, 함께한 분의 정보는 적지 말아 주세요.',
};
