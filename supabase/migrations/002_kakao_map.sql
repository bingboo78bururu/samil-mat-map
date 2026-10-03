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
