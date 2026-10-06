-- ============================================================
-- 삼일맛지도 · 마이그레이션 008 — 시연 계정은 등록 횟수 제한에서 제외
--
-- 배경
--   등록 트리거(rate_limit_inserts)는 계정당 5분에 10건까지만 받습니다.
--   시연 당일 400명이 같은 시연 계정으로 후기·추천을 남기면 11번째부터 전원이 막힙니다.
--
-- 이번 변경
--   rate_limit_exempt 에 적힌 이메일 계정은 제한을 건너뜁니다. 다른 계정의 제한(5분 10건)은 그대로.
--   이 표는 클라이언트에서 읽기·쓰기가 모두 막혀 있고, 운영자가 SQL Editor에서만 관리합니다.
--
-- 행사가 끝나면 제외를 되돌리세요:
--   delete from public.rate_limit_exempt where email = 'tester1@samil-demo.example.com';
--
-- 여러 번 실행해도 안전합니다.
-- ============================================================

create table if not exists public.rate_limit_exempt (
  email      text primary key check (email = lower(btrim(email))),
  note       text,
  created_at timestamptz not null default now()
);
alter table public.rate_limit_exempt enable row level security;
revoke all on public.rate_limit_exempt from anon, authenticated;

insert into public.rate_limit_exempt (email, note)
values ('tester1@samil-demo.example.com', '시연 계정 — 400명 동시 사용. 행사 후 삭제')
on conflict (email) do nothing;

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

  -- 시연 계정 등 제외 목록에 있으면 제한하지 않습니다.
  if exists (
    select 1
    from auth.users u
    join public.rate_limit_exempt e on e.email = lower(u.email)
    where u.id = new.created_by
  ) then
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

-- 확인 — 제외 계정 1줄
select email, note from public.rate_limit_exempt;
