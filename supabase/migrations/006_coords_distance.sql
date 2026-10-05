-- ============================================================
-- 삼일맛지도 · 마이그레이션 006 — 좌표로 본사 거리·도보 시간 계산, 등록 시 좌표 저장
--
-- 이번 변경
--   1) 좌표(lat, lng)가 들어오거나 바뀌면 DB가 dist_m, walk_min 을 직접 계산합니다.
--      화면 등록·SQL 입력 어느 경로로 들어와도 같은 규칙이 적용됩니다.
--        거리(dist_m)   = 본사까지 직선거리 × 1.3 (반올림, m)
--        도보(walk_min) = 거리 ÷ 67m/분 (시속 약 4km, 올림, 최소 1분)
--        본사 건물(한강대로 100) 안이면 거리 0, 도보 1분 → 화면에 '본사 건물 내'
--        도보 180분을 넘으면(약 12km 밖, 출장지 등) 두 값을 비웁니다.
--      좌표가 없으면 두 값도 비웁니다. 임의 값을 만들지 않습니다.
--   2) 등록 RPC가 카카오 장소 검색으로 고른 좌표·장소 ID를 함께 받습니다.
--
-- 본사 기준점은 src/config.js 의 HQ 와 같아야 합니다.
-- 여러 번 실행해도 안전합니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 거리·도보 시간 계산 트리거
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
