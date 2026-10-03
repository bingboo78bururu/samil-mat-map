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
