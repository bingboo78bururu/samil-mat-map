-- ============================================================
-- 삼일맛지도 · 마이그레이션 005 — 링크 검사식 수정
--
-- 문제
--   기존 검사식 '^https?://[^[:space:]]{3,300}$' 는 Postgres 정규식의
--   반복 횟수 상한(255)을 넘어서, 링크가 있는 행을 저장하는 순간
--     invalid regular expression: invalid repetition count(s)
--   오류가 납니다. 링크가 비어 있으면 검사식이 실행되지 않아 지금까지 드러나지 않았습니다.
--   카카오 장소 검색은 지도 링크를 자동으로 채우므로 등록이 실패합니다.
--
-- 수정
--   형식 검사(http/https + 공백 없음)와 길이 검사를 나눕니다. 허용 범위는 기존과 같습니다.
--
-- 여러 번 실행해도 안전합니다.
-- ============================================================

alter table public.restaurants drop constraint if exists restaurants_link_check;
alter table public.restaurants drop constraint if exists restaurants_link_chk;
alter table public.restaurants add  constraint restaurants_link_chk
  check (link is null or (link ~ '^https?://[^[:space:]]{3,}$' and char_length(link) <= 308));

-- 확인 — restaurants_link_chk 한 줄
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.restaurants'::regclass and conname like 'restaurants_link%';
