// 로그인·회원가입. 세션이 없으면 어떤 화면도 열리지 않습니다.
//
// 중요: 화면 차단은 사용자 편의일 뿐 보안이 아닙니다.
//       실제 차단은 Supabase RLS가 합니다(비로그인 요청은 데이터를 한 줄도 못 읽습니다).
import { supabase } from './supabase.js';
import { ALLOWED_EMAIL_DOMAINS } from './config.js';

let currentSession = null;

export function getSession() {
  return currentSession;
}

export function getUser() {
  return currentSession?.user ?? null;
}

export function getDisplayName() {
  const user = getUser();
  if (!user) return '';
  return user.user_metadata?.display_name || user.email || '';
}

export async function initAuth(onChange) {
  const { data } = await supabase.auth.getSession();
  currentSession = data.session ?? null;

  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session ?? null;
    onChange(currentSession);
  });

  return currentSession;
}

export function emailDomainAllowed(email) {
  // 안내용 사전 검사입니다. 최종 판정은 DB 트리거가 합니다.
  if (!ALLOWED_EMAIL_DOMAINS.length) return true;
  const domain = String(email).toLowerCase().split('@')[1] || '';
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

export async function signUp({ email, password, displayName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: displayName ? { display_name: displayName } : {} },
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  currentSession = null;
}

// Supabase가 돌려주는 영문 오류를 화면 문구로 바꿉니다.
export function describeAuthError(error) {
  const text = String(error?.message || error || '');

  if (text.includes('EMAIL_DOMAIN_NOT_ALLOWED') || text.includes('Database error saving new user')) {
    const list = ALLOWED_EMAIL_DOMAINS.map((d) => '@' + d).join(', ');
    return `가입이 허용된 이메일 주소가 아니에요.${list ? ` (${list})` : ''}`;
  }
  if (text.includes('Invalid login credentials')) {
    return '이메일 또는 비밀번호가 맞지 않아요.';
  }
  if (text.includes('User already registered')) {
    return '이미 가입된 이메일이에요. 로그인해주세요.';
  }
  if (text.includes('Password should be at least')) {
    return '비밀번호는 8자 이상으로 입력해주세요.';
  }
  if (text.includes('Email not confirmed')) {
    return '메일 인증이 완료되지 않은 계정이에요.';
  }
  if (text.includes('rate limit') || text.includes('Too many requests')) {
    return '시도가 너무 잦아요. 잠시 후 다시 시도해주세요.';
  }
  return '처리하지 못했어요. 잠시 후 다시 시도해주세요.';
}
