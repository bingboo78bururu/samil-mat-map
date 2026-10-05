-- ============================================================
-- 삼일맛지도 · 마이그레이션 004 — 후기 작성자 이름 30자 → 40자
--
-- 이유
--   콘텐츠팀 샘플 데이터 v2의 반익명 표시 이름이 30자를 넘는 경우가 있습니다.
--     'Assurance · Senior Associate · 4년차' (34자)
--   본부 · 직급 · 연차 형식을 줄이지 않고 담을 수 있게 늘립니다.
--   화면 입력칸(maxlength=30)은 그대로 둡니다.
--
-- 여러 번 실행해도 안전합니다.
-- ============================================================

alter table public.reviews drop constraint if exists reviews_author_name_check;
alter table public.reviews drop constraint if exists reviews_author_name_chk;
alter table public.reviews add  constraint reviews_author_name_chk
  check (author_name is null or char_length(btrim(author_name)) between 1 and 40);

-- 확인 — reviews_author_name_chk 한 줄, 'between 1 and 40'
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.reviews'::regclass and conname like 'reviews_author_name%';
