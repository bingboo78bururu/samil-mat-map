-- ============================================================
-- 삼일맛지도 · 마이그레이션 007 — 같은 카카오 장소는 한 번만 등록
--
-- 배경
--   '소금제면소 용산점'과 '소금제면소 용산'처럼 상호명을 다르게 써도
--   카카오에서 고른 장소가 같으면 장소 ID가 같습니다. 이 ID로 중복을 막습니다.
--   (주소만으로는 못 가립니다 — 한강대로 100 에는 서로 다른 가게가 여럿 있습니다)
--
-- 이번 변경
--   1) kakao_place_id 유일 인덱스(값이 있을 때만). 어느 경로로 들어와도 DB가 막습니다.
--   2) 등록 RPC가 중복이면 'DUPLICATE_PLACE' 오류와 함께 기존 식당 id 를 detail 로 돌려줍니다.
--      화면은 이 id 로 "이미 등록된 식당이에요 → 여기에 후기 남기기"를 보여줍니다.
--
-- 전제: 같은 장소 ID가 이미 두 번 들어 있으면 1)이 실패합니다(2026-10-05 기준 없음).
-- 여러 번 실행해도 안전합니다.
-- ============================================================

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
