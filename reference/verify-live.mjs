// 실제 Supabase 프로젝트에 붙어서 보안·저장 동작을 검증합니다 (앱에 포함되지 않습니다).
//   node reference/verify-live.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const creds = fs.readFileSync(new URL('../supabase/test-accounts.local.md', import.meta.url), 'utf8');
const row = creds.split('\n').find((l) => l.includes('@samil-demo.example.com')).split('|').map((s) => s.trim());
const EMAIL = row[1], PASSWORD = row[2];

const anon = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${label}${detail ? `  → ${detail}` : ''}`);
};

const TEST_NAME = 'ZZ 연결 테스트 — 삭제해주세요';

console.log('\n══ 1. 비로그인 접근 차단 ══');
{
  const db = anon();
  const r1 = await db.from('restaurants').select('id').limit(1);
  check('비로그인은 식당을 읽을 수 없다', !!r1.error || (r1.data || []).length === 0,
    r1.error ? r1.error.code : `${(r1.data || []).length}행`);

  const r2 = await db.from('reviews').select('id').limit(1);
  check('비로그인은 후기를 읽을 수 없다', !!r2.error || (r2.data || []).length === 0,
    r2.error ? r2.error.code : `${(r2.data || []).length}행`);

  const r3 = await db.from('allowed_email_domains').select('domain');
  check('비로그인은 허용 도메인 목록을 볼 수 없다', !!r3.error || (r3.data || []).length === 0,
    r3.error ? r3.error.code : `${(r3.data || []).length}행`);

  const r4 = await db.from('restaurants').insert({
    name: '해킹 시도', region: '용산', address: '주소', cuisine: '한식', menu: '메뉴', tags: ['점심'],
  });
  check('비로그인은 등록할 수 없다', !!r4.error, r4.error?.code);
}

console.log('\n══ 2. 가입 도메인 제한 ══');
{
  const db = anon();
  const bad = await db.auth.signUp({ email: `probe${Date.now()}@gmail.com`, password: 'Abcd1234!xyz' });
  check('허용되지 않은 도메인은 가입 거부', !!bad.error, bad.error?.message?.slice(0, 60));
}

console.log('\n══ 3. 테스트 계정 가입 / 로그인 ══');
const db = anon();
{
  const up = await db.auth.signUp({ email: EMAIL, password: PASSWORD, options: { data: { display_name: '빌드팀 테스터' } } });
  const already = up.error?.message?.includes('already registered');
  check('허용 도메인은 가입된다', !up.error || already, already ? '(이미 가입됨 — 정상)' : up.error?.message);

  const inn = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  check('로그인 성공', !inn.error && !!inn.data.session, inn.error?.message);
  check('메일 인증 없이 세션이 바로 생긴다 (Confirm email 꺼짐)', !!inn.data?.session);
}

console.log('\n══ 4. 로그인 후 읽기 ══');
{
  const r = await db.from('restaurants').select('id, name').limit(5);
  check('로그인하면 식당을 읽을 수 있다', !r.error, r.error?.message);
  console.log(`         현재 등록된 식당: ${(r.data || []).length}곳`);

  const p = await db.from('profiles').select('id, display_name');
  check('내 프로필이 자동 생성됐다', !p.error && (p.data || []).length === 1, p.error?.message);
  check('표시 이름이 저장됐다', p.data?.[0]?.display_name === '빌드팀 테스터', p.data?.[0]?.display_name);
}

console.log('\n══ 5. 값 검증 (DB CHECK 제약) ══');
{
  const uid = (await db.auth.getUser()).data.user.id;
  const zero = await db.from('restaurants').insert({
    name: '가격0 시도', region: '용산', address: '주소', cuisine: '한식', menu: '메뉴',
    price: 0, tags: ['점심'], created_by: uid,
  });
  check('가격 0원은 거부된다', !!zero.error, zero.error?.code);

  const badCuisine = await db.from('restaurants').insert({
    name: '기타 시도', region: '용산', address: '주소', cuisine: '기타', menu: '메뉴',
    tags: ['점심'], created_by: uid,
  });
  check("삭제된 음식 종류 '기타'는 거부된다", !!badCuisine.error, badCuisine.error?.code);

  const badTag = await db.from('restaurants').insert({
    name: '태그 시도', region: '용산', address: '주소', cuisine: '한식', menu: '메뉴',
    tags: ['야식'], created_by: uid,
  });
  check('정해지지 않은 상황 태그는 거부된다', !!badTag.error, badTag.error?.code);

  const spoof = await db.from('restaurants').insert({
    name: '남의 이름 도용', region: '용산', address: '주소', cuisine: '한식', menu: '메뉴',
    tags: ['점심'], created_by: '00000000-0000-0000-0000-000000000000',
  });
  check('남의 계정으로 위장한 등록은 거부된다', !!spoof.error, spoof.error?.code);
}

console.log('\n══ 6. 실제 저장 (앱이 쓰는 경로) ══');
let newId;
{
  const rpc = await db.rpc('create_restaurant_with_review', {
    p_name: TEST_NAME, p_region: '용산', p_address: '서울 용산구 한강대로 100',
    p_cuisine: '한식', p_sub: '국밥', p_menu: '돼지국밥', p_price: 12000,
    p_tags: ['점심', '팀 회식'], p_link: null, p_source_type: '직접 방문',
    p_author_name: '빌드팀 테스터', p_body: '배포 전 연결 확인용입니다. 확인 후 지워주세요.',
  });
  check('식당 + 첫 후기 등록 성공', !rpc.error && !!rpc.data, rpc.error?.message);
  newId = rpc.data;

  const back = await db.from('restaurants')
    .select('name, sub, price, tags, source_type, reviews(body, kind, situation, paid)')
    .eq('id', newId).single();
  check('저장한 값이 그대로 읽힌다', back.data?.name === TEST_NAME && back.data?.price === 12000);
  check('첫 후기가 같이 저장됐다 (한 트랜잭션)', back.data?.reviews?.length === 1);
  check("첫 후기의 kind가 'member'", back.data?.reviews?.[0]?.kind === 'member');

  const rev = await db.from('reviews').insert({
    restaurant_id: newId, author_name: null, body: '후기 추가 확인용입니다.',
    kind: 'member', situation: '점심', people: '2~3명', paid: 11000,
    created_by: (await db.auth.getUser()).data.user.id,
  }).select('id, paid, situation').single();
  check('후기 추가 성공 (어떤 자리·인원·실결제 포함)', !rev.error && rev.data?.paid === 11000, rev.error?.message);
}

console.log('\n══ 7. 수정·삭제 차단 ══');
{
  const upd = await db.from('restaurants').update({ name: '바꿔치기' }).eq('id', newId).select();
  check('수정 불가 (정책 없음)', !!upd.error || (upd.data || []).length === 0,
    upd.error ? upd.error.code : '0행 변경');

  const del = await db.from('restaurants').delete().eq('id', newId).select();
  check('삭제 불가 (정책 없음)', !!del.error || (del.data || []).length === 0,
    del.error ? del.error.code : '0행 삭제');
}

await db.auth.signOut();

console.log(`\n${fail ? '❌' : '✅'}  통과 ${pass} / 실패 ${fail}`);
if (newId) console.log(`\n정리용 SQL (Supabase SQL Editor):\n  delete from public.restaurants where name = '${TEST_NAME}';\n`);
process.exit(fail ? 1 : 0);
