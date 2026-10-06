-- ============================================================
-- 삼일맛지도 · 전체 설치 스크립트 (schema.sql + migrations/001_v8_fields.sql)
-- 빈 프로젝트에 이것 하나만 실행하면 됩니다. 여러 번 실행해도 안전합니다.
-- ============================================================

-- ============================================================
-- 삼일맛지도 · Supabase 스키마 + RLS
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 1회 실행합니다.
-- 여러 번 실행해도 안전하도록 작성했습니다.
--
-- 보안 원칙
--   1) 프런트엔드가 들고 있는 anon 키는 공개 정보다. 보안은 전적으로 RLS가 책임진다.
--   2) 로그인하지 않은 요청(anon 역할)은 테이블 권한 자체를 회수해 아무것도 못 읽는다.
--   3) 수정·삭제 정책은 만들지 않는다 = 클라이언트에서 영구 불가.
--      잘못 올라온 글은 운영자가 대시보드(service_role)에서만 지운다.
--   4) 값 검증은 프런트가 아니라 DB의 CHECK 제약이 최종 판정한다.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 0. 가입 허용 이메일 도메인
--    RLS는 켜되 정책을 하나도 만들지 않는다 = 클라이언트에서 읽기/쓰기 전면 차단.
--    운영자가 대시보드에서만 관리한다.
-- ------------------------------------------------------------
create table if not exists public.allowed_email_domains (
  domain     text primary key,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.allowed_email_domains enable row level security;

-- 시연용 임시 도메인. 실제 사내 도메인이 확정되면 아래 두 줄을 실행한다.
--   도메인 추가: insert into public.allowed_email_domains(domain) values ('사내도메인')
--   임시 도메인 삭제: delete from public.allowed_email_domains where domain = 'samil-demo.example.com'
insert into public.allowed_email_domains(domain, note)
values ('samil-demo.example.com', '시연용 테스트 계정 도메인 — 사내 도메인 확정 후 삭제할 것')
on conflict (domain) do nothing;

-- ------------------------------------------------------------
-- 1. 가입 도메인 강제 (프런트 우회 방지)
--    auth.users INSERT 직전에 검사하므로 REST/SDK/대시보드 어느 경로로도 우회할 수 없다.
-- ------------------------------------------------------------
create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $fn$
declare
  v_domain text;
begin
  v_domain := lower(split_part(coalesce(new.email, ''), '@', 2));

  if v_domain = '' or not exists (
    select 1 from public.allowed_email_domains d where d.domain = v_domain
  ) then
    raise exception 'EMAIL_DOMAIN_NOT_ALLOWED' using errcode = '22023';
  end if;

  return new;
end;
$fn$;

drop trigger if exists enforce_email_domain_before_insert on auth.users;
create trigger enforce_email_domain_before_insert
  before insert on auth.users
  for each row execute function public.enforce_email_domain();

-- ------------------------------------------------------------
-- 2. 프로필
--    표시 이름은 선택값이다. 익명 사용을 허용한다.
--    다른 사용자의 프로필은 조회할 수 없다(본인 행만).
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 30),
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
-- INSERT 정책 없음: 아래 트리거(security definer)만 프로필 행을 만든다.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 3. 식당
--    기획안 5장의 데이터 항목을 그대로 옮겼다.
--    가격은 "확인 못 하면 NULL". 0이나 추정치를 넣을 수 없도록 price > 0 으로 막는다.
--    좌표는 지도 이식 전까지 NULL로 둔다. 임의 좌표 생성 금지.
-- ------------------------------------------------------------
create table if not exists public.restaurants (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(btrim(name))    between 1 and 60),
  region          text not null check (char_length(btrim(region))  between 1 and 30),
  address         text not null check (char_length(btrim(address)) between 1 and 150),
  cuisine         text not null check (cuisine in ('한식','중식','일식','양식','기타')),
  menu            text not null check (char_length(btrim(menu))    between 1 and 60),
  price           integer      check (price is null or (price > 0 and price <= 1000000)),
  tags            text[] not null check (
                    array_length(tags, 1) between 1 and 7
                    and tags <@ array['점심','동기 회식','팀 회식','고객사 응대','출장','퇴근 후','데이트']::text[]
                  ),
  link            text check (link is null or link ~ '^https?://[^[:space:]]{3,300}$'),
  source_type     text check (source_type is null or source_type in ('직접 방문','동료 추천','자료 조사')),
  info_checked_on date check (info_checked_on is null or info_checked_on >= date '2020-01-01'),
  lat             double precision check (lat is null or lat between  -90 and  90),
  lng             double precision check (lng is null or lng between -180 and 180),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists restaurants_created_at_idx on public.restaurants (created_at desc);
create index if not exists restaurants_region_idx     on public.restaurants (region);

alter table public.restaurants enable row level security;

drop policy if exists restaurants_select_authenticated on public.restaurants;
create policy restaurants_select_authenticated on public.restaurants
  for select to authenticated
  using (true);

drop policy if exists restaurants_insert_own on public.restaurants;
create policy restaurants_insert_own on public.restaurants
  for insert to authenticated
  with check ((select auth.uid()) = created_by);
-- UPDATE / DELETE 정책 없음 = 클라이언트에서 수정·삭제 불가 (기획안: 관리 기능은 후순위)

-- ------------------------------------------------------------
-- 4. 후기
-- ------------------------------------------------------------
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  author_name   text check (author_name is null or char_length(btrim(author_name)) between 1 and 30),
  body          text not null check (char_length(btrim(body)) between 1 and 1000),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists reviews_restaurant_idx on public.reviews (restaurant_id, created_at);

alter table public.reviews enable row level security;

drop policy if exists reviews_select_authenticated on public.reviews;
create policy reviews_select_authenticated on public.reviews
  for select to authenticated
  using (true);

drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check ((select auth.uid()) = created_by);
-- UPDATE / DELETE 정책 없음

-- ------------------------------------------------------------
-- 5. 쓰기 속도 제한
--    수정·삭제 수단이 없으므로, 대량 입력으로 DB가 오염되는 것을 입구에서 막는다.
--    한 계정당 5분에 10건까지.
-- ------------------------------------------------------------
create or replace function public.rate_limit_inserts()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  if new.created_by is null then
    return new;
  end if;

  execute format(
    'select count(*) from public.%I where created_by = $1 and created_at > now() - interval ''5 minutes''',
    tg_table_name
  ) into v_count using new.created_by;

  if v_count >= 10 then
    raise exception 'RATE_LIMITED' using errcode = '22023';
  end if;

  return new;
end;
$fn$;

drop trigger if exists rate_limit_restaurants on public.restaurants;
create trigger rate_limit_restaurants
  before insert on public.restaurants
  for each row execute function public.rate_limit_inserts();

drop trigger if exists rate_limit_reviews on public.reviews;
create trigger rate_limit_reviews
  before insert on public.reviews
  for each row execute function public.rate_limit_inserts();

-- ------------------------------------------------------------
-- 5-1. 식당 + 첫 후기 동시 저장
--      기획안 S3에서 "추천 이유·첫 후기"는 필수다.
--      두 번의 INSERT로 나누면 후기 저장이 실패했을 때 후기 없는 식당이 남는다.
--      하나의 트랜잭션으로 묶는다.
--      security invoker(기본값)이므로 RLS가 그대로 적용된다 = 권한 우회가 아니다.
-- ------------------------------------------------------------
create or replace function public.create_restaurant_with_review(
  p_name        text,
  p_region      text,
  p_address     text,
  p_cuisine     text,
  p_menu        text,
  p_price       integer,
  p_tags        text[],
  p_link        text,
  p_source_type text,
  p_author_name text,
  p_body        text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_id  uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  insert into public.restaurants
    (name, region, address, cuisine, menu, price, tags, link, source_type, created_by)
  values
    (btrim(p_name), btrim(p_region), btrim(p_address), p_cuisine, btrim(p_menu),
     p_price, p_tags,
     nullif(btrim(coalesce(p_link, '')), ''),
     nullif(btrim(coalesce(p_source_type, '')), ''),
     v_uid)
  returning id into v_id;

  insert into public.reviews (restaurant_id, author_name, body, created_by)
  values (v_id, nullif(btrim(coalesce(p_author_name, '')), ''), btrim(p_body), v_uid);

  return v_id;
end;
$fn$;

-- ------------------------------------------------------------
-- 6. 비로그인(anon) 역할의 테이블 권한 회수
--    RLS가 1차 방어선이고, 이것이 2차 방어선이다.
--    로그인하지 않은 요청은 테이블의 존재조차 확인할 수 없다.
-- ------------------------------------------------------------
revoke all on public.restaurants           from anon;
revoke all on public.reviews               from anon;
revoke all on public.profiles              from anon;
revoke all on public.allowed_email_domains from anon;
revoke all on public.allowed_email_domains from authenticated;

grant select, insert on public.restaurants to authenticated;
grant select, insert on public.reviews     to authenticated;
grant select, update on public.profiles    to authenticated;

revoke execute on function public.create_restaurant_with_review(
  text, text, text, text, text, integer, text[], text, text, text, text
) from public, anon;
grant execute on function public.create_restaurant_with_review(
  text, text, text, text, text, integer, text[], text, text, text, text
) to authenticated;

-- ------------------------------------------------------------
-- 7. 설치 확인 — 아래 결과에서 모든 테이블의 "RLS 켜짐"이 true 여야 한다.
-- ------------------------------------------------------------
select t.tablename,
       t.rowsecurity as "RLS 켜짐",
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename) as "정책 수"
from pg_tables t
where t.schemaname = 'public'
order by t.tablename;


-- ============================================================
-- 삼일맛지도 · 마이그레이션 001 — 목업 v8 반영
--
-- 전제: supabase/schema.sql 을 이미 한 번 실행한 프로젝트에 이어서 실행합니다.
-- 여러 번 실행해도 안전합니다.
--
-- 이번 변경
--   1) 음식 종류 선택지 교체 — '기타' 삭제, '아시안'·'카페·디저트' 추가
--   2) 식당에 v8 화면이 쓰는 컬럼 추가 (세분류·영업시간·예약·도보거리 등)
--   3) 후기에 '어떤 자리 / 인원 / 1인 실결제 금액 / 후기 종류' 추가
--   4) 등록 RPC에 세분류(p_sub) 반영
--
-- 이번에 넣지 않은 것
--   - 사다리타기·함께 결정하기(S5): 다음 스코프로 미룸. DB 변경 없음.
--   - 후보 담기(picks): 개인 상태라 브라우저에만 저장. DB 변경 없음.
--   - 조사 자료 42곳·가상 후기 95건: 공동 DB에 넣지 않기로 함. 삽입 스크립트 없음.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 음식 종류 선택지 교체
--    기획안 5장의 '한식/중식/일식/양식/기타'를 목업 v8 기준으로 바꿉니다.
--    기획 문서도 같이 고쳐야 합니다.
-- ------------------------------------------------------------
alter table public.restaurants drop constraint if exists restaurants_cuisine_check;
alter table public.restaurants add  constraint restaurants_cuisine_check
  check (cuisine in ('한식','중식','일식','양식','아시안','카페·디저트'));

-- ------------------------------------------------------------
-- 2. 식당 컬럼 추가
--    v8 화면이 실제로 그리는 값만 넣습니다.
--    (목업 데이터의 category·purpose 는 화면에서 쓰이지 않아 제외)
-- ------------------------------------------------------------
alter table public.restaurants
  add column if not exists sub        text,      -- 세분류: 국밥, 베트남, 이탈리안 …
  add column if not exists menus      text,      -- 대표 메뉴 전체 설명
  add column if not exists price_note text,      -- 가격 단서: '런치 기준' 등
  add column if not exists hours      text,      -- 영업시간 (확인 필요 표기)
  add column if not exists reserve    text,      -- 예약 안내
  add column if not exists wait       text,      -- 웨이팅 안내
  add column if not exists walk_min   integer,   -- 본사에서 도보 분
  add column if not exists dist_m     integer,   -- 본사에서 직선거리(m) 추정
  add column if not exists g_rating   numeric(2,1),
  add column if not exists g_count    integer,
  add column if not exists icon       text;      -- 목록 아이콘 키

-- 길이·범위 제약 (프런트가 아니라 DB가 최종 판정)
alter table public.restaurants drop constraint if exists restaurants_sub_chk;
alter table public.restaurants add  constraint restaurants_sub_chk
  check (sub is null or char_length(btrim(sub)) between 1 and 20);

alter table public.restaurants drop constraint if exists restaurants_menus_chk;
alter table public.restaurants add  constraint restaurants_menus_chk
  check (menus is null or char_length(btrim(menus)) between 1 and 200);

alter table public.restaurants drop constraint if exists restaurants_price_note_chk;
alter table public.restaurants add  constraint restaurants_price_note_chk
  check (price_note is null or char_length(btrim(price_note)) between 1 and 60);

alter table public.restaurants drop constraint if exists restaurants_hours_chk;
alter table public.restaurants add  constraint restaurants_hours_chk
  check (hours is null or char_length(btrim(hours)) between 1 and 200);

alter table public.restaurants drop constraint if exists restaurants_reserve_chk;
alter table public.restaurants add  constraint restaurants_reserve_chk
  check (reserve is null or char_length(btrim(reserve)) between 1 and 60);

alter table public.restaurants drop constraint if exists restaurants_wait_chk;
alter table public.restaurants add  constraint restaurants_wait_chk
  check (wait is null or char_length(btrim(wait)) between 1 and 60);

alter table public.restaurants drop constraint if exists restaurants_walk_min_chk;
alter table public.restaurants add  constraint restaurants_walk_min_chk
  check (walk_min is null or walk_min between 0 and 180);

alter table public.restaurants drop constraint if exists restaurants_dist_m_chk;
alter table public.restaurants add  constraint restaurants_dist_m_chk
  check (dist_m is null or dist_m between 0 and 100000);

alter table public.restaurants drop constraint if exists restaurants_g_rating_chk;
alter table public.restaurants add  constraint restaurants_g_rating_chk
  check (g_rating is null or g_rating between 0 and 5);

alter table public.restaurants drop constraint if exists restaurants_g_count_chk;
alter table public.restaurants add  constraint restaurants_g_count_chk
  check (g_count is null or g_count >= 0);

alter table public.restaurants drop constraint if exists restaurants_icon_chk;
alter table public.restaurants add  constraint restaurants_icon_chk
  check (icon is null or icon in (
    'grill','soup','bapsang','ramen','pho','sushi','skewer','shell',
    'fish','pasta','burger','wok','dumpling','bread','cake'
  ));

-- 본사에서 가까운 순 정렬에 쓰입니다.
create index if not exists restaurants_walk_min_idx on public.restaurants (walk_min nulls last);

-- ------------------------------------------------------------
-- 3. 후기 컬럼 추가
--    kind
--      member   = 구성원이 앱에서 직접 남긴 실제 후기 (기본값)
--      research = 조사 메모
--      virtual  = 시연용 가상 후기
--    화면에서 member 가 아닌 후기에는 반드시 배지를 붙입니다.
--    (기획안: 가상 예시를 실제 구성원 후기처럼 쓰지 않는다)
-- ------------------------------------------------------------
alter table public.reviews
  add column if not exists kind      text not null default 'member',
  add column if not exists situation text,     -- 어떤 자리였는지
  add column if not exists people    text,     -- 인원
  add column if not exists paid      integer;  -- 1인 실결제 금액

alter table public.reviews drop constraint if exists reviews_kind_chk;
alter table public.reviews add  constraint reviews_kind_chk
  check (kind in ('member','research','virtual'));

alter table public.reviews drop constraint if exists reviews_situation_chk;
alter table public.reviews add  constraint reviews_situation_chk
  check (situation is null or situation in
    ('점심','동기 회식','팀 회식','고객사 응대','출장','퇴근 후','데이트'));

alter table public.reviews drop constraint if exists reviews_people_chk;
alter table public.reviews add  constraint reviews_people_chk
  check (people is null or people in ('1명','2~3명','4~6명','7명 이상'));

-- 메뉴판 가격이 아니라 실제로 낸 금액. 0원·음수는 받지 않습니다.
alter table public.reviews drop constraint if exists reviews_paid_chk;
alter table public.reviews add  constraint reviews_paid_chk
  check (paid is null or (paid > 0 and paid <= 1000000));

-- ------------------------------------------------------------
-- 4. 등록 RPC 교체 (세분류 p_sub 추가)
--    인자 목록이 바뀌므로 옛 함수를 먼저 지웁니다.
--    security invoker 이므로 RLS는 그대로 적용됩니다.
-- ------------------------------------------------------------
drop function if exists public.create_restaurant_with_review(
  text, text, text, text, text, integer, text[], text, text, text, text
);

create or replace function public.create_restaurant_with_review(
  p_name        text,
  p_region      text,
  p_address     text,
  p_cuisine     text,
  p_sub         text,
  p_menu        text,
  p_price       integer,
  p_tags        text[],
  p_link        text,
  p_source_type text,
  p_author_name text,
  p_body        text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_id  uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  insert into public.restaurants
    (name, region, address, cuisine, sub, menu, price, tags, link, source_type, created_by)
  values
    (btrim(p_name), btrim(p_region), btrim(p_address), p_cuisine,
     nullif(btrim(coalesce(p_sub, '')), ''),
     btrim(p_menu), p_price, p_tags,
     nullif(btrim(coalesce(p_link, '')), ''),
     nullif(btrim(coalesce(p_source_type, '')), ''),
     v_uid)
  returning id into v_id;

  -- 등록 시의 '추천 이유'가 그 식당의 첫 후기가 됩니다.
  insert into public.reviews (restaurant_id, author_name, body, kind, created_by)
  values (v_id, nullif(btrim(coalesce(p_author_name, '')), ''), btrim(p_body), 'member', v_uid);

  return v_id;
end;
$fn$;

revoke execute on function public.create_restaurant_with_review(
  text, text, text, text, text, text, integer, text[], text, text, text, text
) from public, anon;

grant execute on function public.create_restaurant_with_review(
  text, text, text, text, text, text, integer, text[], text, text, text, text
) to authenticated;

-- ------------------------------------------------------------
-- 5. 확인 — restaurants 26개, reviews 10개 컬럼이 나와야 합니다.
-- ------------------------------------------------------------
select table_name, count(*) as "컬럼 수"
from information_schema.columns
where table_schema = 'public' and table_name in ('restaurants','reviews')
group by table_name
order by table_name;


-- ============================================================
-- 삼일맛지도 · 마이그레이션 002 — 지도 제공자를 카카오맵으로 확정
--
-- 배경
--   목업 v8은 Google 지도에서 좌표·평점·리뷰 수·place_id 를 가져와 쓰고 있었습니다.
--   팀 결정으로 카카오맵을 쓰기로 했으므로, Google 전용 컬럼을 지웁니다.
--   컬럼을 남겨두면 나중에 누군가 Google 값을 다시 채워 넣을 수 있어서 아예 없앱니다.
--
--   lat / lng 는 그대로 둡니다. 카카오 로컬 API로 주소를 좌표로 바꿔 채울 값입니다.
--   값이 없는 식당은 화면에서 '위치 확인 중'으로 표시합니다. 임의 좌표 생성 금지.
-- ============================================================

alter table public.restaurants drop constraint if exists restaurants_g_rating_chk;
alter table public.restaurants drop constraint if exists restaurants_g_count_chk;

alter table public.restaurants drop column if exists g_rating;
alter table public.restaurants drop column if exists g_count;

-- 카카오 로컬 API가 돌려주는 장소 ID.
-- 지도 링크(https://place.map.kakao.com/<id>)를 만들 때 씁니다.
alter table public.restaurants
  add column if not exists kakao_place_id text;

alter table public.restaurants drop constraint if exists restaurants_kakao_place_id_chk;
alter table public.restaurants add  constraint restaurants_kakao_place_id_chk
  check (kakao_place_id is null or kakao_place_id ~ '^[0-9]{1,20}$');

-- 좌표를 아직 못 구한 식당을 빠르게 찾기 위한 인덱스
create index if not exists restaurants_no_coords_idx
  on public.restaurants (created_at desc)
  where lat is null or lng is null;

-- 확인 — restaurants 25개 컬럼(26 - g_rating - g_count + kakao_place_id)
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'restaurants'
order by ordinal_position;


-- ============================================================
-- 삼일맛지도 · 마이그레이션 003 — 시연용 가입 도메인 교체
--
-- 이유
--   Supabase 인증이 .test 처럼 예약된 TLD를 아예 거부합니다.
--     Email address "tester1@samil-demo.test" is invalid
--   그래서 시연용 도메인을 samil-demo.example.com 으로 바꿉니다.
--   example.com 은 IANA가 문서용으로 예약한 도메인이라
--   어떤 하위 도메인도 실제 누군가의 메일 주소와 겹치지 않습니다.
--
--   실제 사내 도메인이 확정되면 아래 7번 줄의 주석을 참고해 교체하세요.
-- ============================================================

insert into public.allowed_email_domains(domain, note)
values ('samil-demo.example.com', '시연용 테스트 계정 도메인 — 사내 도메인 확정 후 삭제할 것')
on conflict (domain) do nothing;

delete from public.allowed_email_domains where domain = 'samil-demo.test';

-- 실제 사내 도메인이 정해지면:
--   insert into public.allowed_email_domains(domain) values ('사내도메인.com');
--   delete from public.allowed_email_domains where domain = 'samil-demo.example.com';

-- 확인 — samil-demo.example.com 한 줄만 남아야 합니다.
select domain, note from public.allowed_email_domains order by domain;

-- ------------------------------------------------------------
-- 004. 후기 작성자 이름 30자 → 40자 (샘플 데이터 v2의 반익명 표시 이름)
-- ------------------------------------------------------------
alter table public.reviews drop constraint if exists reviews_author_name_check;
alter table public.reviews drop constraint if exists reviews_author_name_chk;
alter table public.reviews add  constraint reviews_author_name_chk
  check (author_name is null or char_length(btrim(author_name)) between 1 and 40);

-- 확인 — reviews_author_name_chk 한 줄, 'between 1 and 40'
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.reviews'::regclass and conname like 'reviews_author_name%';

-- ------------------------------------------------------------
-- 005. 링크 검사식 수정 (정규식 반복 횟수 상한 255 초과로 링크 저장이 실패하던 문제)
-- ------------------------------------------------------------
alter table public.restaurants drop constraint if exists restaurants_link_check;
alter table public.restaurants drop constraint if exists restaurants_link_chk;
alter table public.restaurants add  constraint restaurants_link_chk
  check (link is null or (link ~ '^https?://[^[:space:]]{3,}$' and char_length(link) <= 308));

-- 확인 — restaurants_link_chk 한 줄
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.restaurants'::regclass and conname like 'restaurants_link%';

-- ------------------------------------------------------------
-- 006. 좌표로 본사 거리·도보 시간 계산, 등록 시 좌표 저장
-- ------------------------------------------------------------
create or replace function public.set_restaurant_distance()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  hq_lat   constant double precision := 37.528837;
  hq_lng   constant double precision := 126.968647;
  straight double precision;
  dist     integer;
begin
  if new.lat is null or new.lng is null then
    new.dist_m := null;
    new.walk_min := null;
    return new;
  end if;

  if new.address ~ '^서울(특별시)? 용산구 한강대로 100( |\(|$)' then
    new.dist_m := 0;
    new.walk_min := 1;
    return new;
  end if;

  straight := 2 * 6371000 * asin(sqrt(
    power(sin(radians(new.lat - hq_lat) / 2), 2)
    + cos(radians(hq_lat)) * cos(radians(new.lat)) * power(sin(radians(new.lng - hq_lng) / 2), 2)
  ));
  dist := round(straight * 1.3);

  if ceil(dist / 67.0) > 180 then
    new.dist_m := null;
    new.walk_min := null;
  else
    new.dist_m := dist;
    new.walk_min := greatest(1, ceil(dist / 67.0)::integer);
  end if;
  return new;
end;
$fn$;

drop trigger if exists set_restaurant_distance on public.restaurants;
create trigger set_restaurant_distance
  before insert or update of lat, lng, address on public.restaurants
  for each row execute function public.set_restaurant_distance();

-- ------------------------------------------------------------
-- 2. 등록 RPC — 좌표·카카오 장소 ID 추가
-- ------------------------------------------------------------
drop function if exists public.create_restaurant_with_review(
  text, text, text, text, text, text, integer, text[], text, text, text, text
);

create or replace function public.create_restaurant_with_review(
  p_name           text,
  p_region         text,
  p_address        text,
  p_cuisine        text,
  p_sub            text,
  p_menu           text,
  p_price          integer,
  p_tags           text[],
  p_link           text,
  p_source_type    text,
  p_author_name    text,
  p_body           text,
  p_lat            double precision default null,
  p_lng            double precision default null,
  p_kakao_place_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_id  uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- 좌표는 둘 다 있을 때만 저장합니다.
  insert into public.restaurants
    (name, region, address, cuisine, sub, menu, price, tags, link, source_type,
     lat, lng, kakao_place_id, created_by)
  values
    (btrim(p_name), btrim(p_region), btrim(p_address), p_cuisine,
     nullif(btrim(coalesce(p_sub, '')), ''),
     btrim(p_menu), p_price, p_tags,
     nullif(btrim(coalesce(p_link, '')), ''),
     nullif(btrim(coalesce(p_source_type, '')), ''),
     case when p_lat is not null and p_lng is not null then p_lat end,
     case when p_lat is not null and p_lng is not null then p_lng end,
     nullif(btrim(coalesce(p_kakao_place_id, '')), ''),
     v_uid)
  returning id into v_id;

  -- 등록 시의 '추천 이유'가 그 식당의 첫 후기가 됩니다.
  insert into public.reviews (restaurant_id, author_name, body, kind, created_by)
  values (v_id, nullif(btrim(coalesce(p_author_name, '')), ''), btrim(p_body), 'member', v_uid);

  return v_id;
end;
$fn$;

revoke execute on function public.create_restaurant_with_review(
  text, text, text, text, text, text, integer, text[], text, text, text, text,
  double precision, double precision, text
) from public, anon;

grant execute on function public.create_restaurant_with_review(
  text, text, text, text, text, text, integer, text[], text, text, text, text,
  double precision, double precision, text
) to authenticated;

-- 바뀐 함수를 API가 바로 알도록
notify pgrst, 'reload schema';

-- 확인 — 트리거 1줄, 함수 인자 15개
select tgname from pg_trigger where tgrelid = 'public.restaurants'::regclass and tgname = 'set_restaurant_distance';
select pronargs from pg_proc where proname = 'create_restaurant_with_review';

-- ------------------------------------------------------------
-- 007. 같은 카카오 장소는 한 번만 등록
-- ------------------------------------------------------------
create unique index if not exists restaurants_kakao_place_id_key
  on public.restaurants (kakao_place_id)
  where kakao_place_id is not null;

create or replace function public.create_restaurant_with_review(
  p_name           text,
  p_region         text,
  p_address        text,
  p_cuisine        text,
  p_sub            text,
  p_menu           text,
  p_price          integer,
  p_tags           text[],
  p_link           text,
  p_source_type    text,
  p_author_name    text,
  p_body           text,
  p_lat            double precision default null,
  p_lng            double precision default null,
  p_kakao_place_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_id  uuid;
  v_uid uuid := auth.uid();
  v_dup uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- 같은 카카오 장소가 이미 있으면 기존 식당 id 를 알려줍니다(유일 인덱스가 최종 판정).
  select id into v_dup from public.restaurants
  where kakao_place_id = nullif(btrim(coalesce(p_kakao_place_id, '')), '');
  if v_dup is not null then
    raise exception 'DUPLICATE_PLACE' using errcode = '23505', detail = v_dup::text;
  end if;

  -- 좌표는 둘 다 있을 때만 저장합니다.
  insert into public.restaurants
    (name, region, address, cuisine, sub, menu, price, tags, link, source_type,
     lat, lng, kakao_place_id, created_by)
  values
    (btrim(p_name), btrim(p_region), btrim(p_address), p_cuisine,
     nullif(btrim(coalesce(p_sub, '')), ''),
     btrim(p_menu), p_price, p_tags,
     nullif(btrim(coalesce(p_link, '')), ''),
     nullif(btrim(coalesce(p_source_type, '')), ''),
     case when p_lat is not null and p_lng is not null then p_lat end,
     case when p_lat is not null and p_lng is not null then p_lng end,
     nullif(btrim(coalesce(p_kakao_place_id, '')), ''),
     v_uid)
  returning id into v_id;

  -- 등록 시의 '추천 이유'가 그 식당의 첫 후기가 됩니다.
  insert into public.reviews (restaurant_id, author_name, body, kind, created_by)
  values (v_id, nullif(btrim(coalesce(p_author_name, '')), ''), btrim(p_body), 'member', v_uid);

  return v_id;
end;
$fn$;

-- 바뀐 함수를 API가 바로 알도록
notify pgrst, 'reload schema';

-- 확인 — 인덱스 1줄
select indexname from pg_indexes where tablename = 'restaurants' and indexname = 'restaurants_kakao_place_id_key';

-- ------------------------------------------------------------
-- 008. 시연 계정은 등록 횟수 제한에서 제외
-- ------------------------------------------------------------
create table if not exists public.rate_limit_exempt (
  email      text primary key check (email = lower(btrim(email))),
  note       text,
  created_at timestamptz not null default now()
);
alter table public.rate_limit_exempt enable row level security;
revoke all on public.rate_limit_exempt from anon, authenticated;

insert into public.rate_limit_exempt (email, note)
values ('tester1@samil-demo.example.com', '시연 계정 — 400명 동시 사용. 행사 후 삭제')
on conflict (email) do nothing;

create or replace function public.rate_limit_inserts()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  if new.created_by is null then
    return new;
  end if;

  -- 시연 계정 등 제외 목록에 있으면 제한하지 않습니다.
  if exists (
    select 1
    from auth.users u
    join public.rate_limit_exempt e on e.email = lower(u.email)
    where u.id = new.created_by
  ) then
    return new;
  end if;

  execute format(
    'select count(*) from public.%I where created_by = $1 and created_at > now() - interval ''5 minutes''',
    tg_table_name
  ) into v_count using new.created_by;

  if v_count >= 10 then
    raise exception 'RATE_LIMITED' using errcode = '22023';
  end if;

  return new;
end;
$fn$;

-- 확인 — 제외 계정 1줄
select email, note from public.rate_limit_exempt;
