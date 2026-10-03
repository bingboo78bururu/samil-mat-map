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
