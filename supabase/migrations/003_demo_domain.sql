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
