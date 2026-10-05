-- ============================================================
-- 삼일맛지도 · 회원 등록 식당 좌표 채우기 (2026-10-05)
--
-- 마이그레이션 006 적용 전에 등록돼 좌표가 비어 있던 2곳. (소금제면소 용산점은 중복이라 merge_duplicate_20261005.sql 로 합칩니다)
-- 등록 링크의 카카오 장소 ID로 카카오 로컬 API에서 좌표를 구했습니다.
-- 거리·도보 시간은 006 트리거가 계산합니다.
-- 좌표가 이미 있으면 건드리지 않습니다. 여러 번 실행해도 안전합니다.
-- ============================================================

update public.restaurants as r
set lat = v.lat, lng = v.lng, kakao_place_id = v.place_id
from (values
  ('902c6fee-7ba7-4386-85fc-919d59e80b21'::uuid, 37.5715429606809, 126.975286676158, '16586753'),  -- 종로빈대떡 광화문점
  ('49b87373-47b0-4849-b5c7-d40057e49fef'::uuid, 37.5313611593014, 126.971371825147, '11162581')  -- 정성손칼국수
) as v(id, lat, lng, place_id)
where r.id = v.id and r.lat is null and r.lng is null;

-- 확인 — 2줄 모두 좌표·도보 시간이 채워져야 합니다
select name, kakao_place_id, dist_m, walk_min
from public.restaurants
where id in ('902c6fee-7ba7-4386-85fc-919d59e80b21', '49b87373-47b0-4849-b5c7-d40057e49fef');
