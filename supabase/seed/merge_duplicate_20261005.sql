-- ============================================================
-- 삼일맛지도 · 중복 식당 합치기 (2026-10-05)
--
-- '소금제면소 용산점'(회원 등록)과 '소금제면소 용산'(샘플 데이터)은
-- 카카오 장소 ID 1276387489 로 같은 가게입니다.
--   남김: 소금제면소 용산   — 좌표·장소 ID·조사 메모·가상 후기 2건
--   지움: 소금제면소 용산점 — 회원 후기 1건은 지우지 않고 '소금제면소 용산'으로 옮깁니다
--
-- 한 트랜잭션입니다. 두 식당이 모두 있을 때만 실행하고, 다시 실행해도 안전합니다.
-- ============================================================

begin;

do $$
declare
  v_keep constant uuid := '8b8d9a1d-fe63-478c-91b1-0a0f9ef5e825';  -- 소금제면소 용산
  v_drop constant uuid := '5057a7ae-60b1-4d08-88b4-a5a61f045733';  -- 소금제면소 용산점
  v_moved integer;
begin
  if not exists (select 1 from public.restaurants where id = v_keep) then
    raise exception '남길 식당(소금제면소 용산)이 없습니다.';
  end if;
  if not exists (select 1 from public.restaurants where id = v_drop) then
    raise notice '이미 합쳐졌습니다. 할 일이 없습니다.';
    return;
  end if;

  update public.reviews set restaurant_id = v_keep where restaurant_id = v_drop;
  get diagnostics v_moved = row_count;
  delete from public.restaurants where id = v_drop;
  raise notice '후기 %건을 옮기고 중복 식당 1곳을 지웠습니다.', v_moved;
end $$;

commit;

-- 확인 — 소금제면소 1곳, 후기 research 1 · virtual 2 · member 1
select r.name, v.kind, count(*)
from public.restaurants r
join public.reviews v on v.restaurant_id = r.id
where r.name like '소금제면소%'
group by r.name, v.kind
order by v.kind;
