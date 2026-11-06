-- 온라인 서프루어낚시 v2: 아이디 중복 방지 + 포인트별 최대어 랭킹
-- Supabase → SQL Editor 에 통째로 붙여넣고 Run (기존 schema.sql 다음에 실행)

-- 1) 아이디 (중복 불가). 비밀 토큰은 아무도 읽을 수 없고 함수로만 확인한다.
create table if not exists public.players (
  name text primary key check (char_length(name) between 2 and 12),
  token_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.players enable row level security;
-- (정책 없음 = 직접 읽기/쓰기 불가)

create extension if not exists pgcrypto;

-- 아이디 등록: 처음이면 등록, 같은 기기(토큰)면 통과, 다른 사람이 쓰면 false
create or replace function public.claim_name(p_name text, p_token text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare h text := encode(digest(p_token, 'sha256'), 'hex');
declare cur text;
begin
  if char_length(p_name) < 2 or char_length(p_name) > 12 or char_length(p_token) < 16 then return false; end if;
  select token_hash into cur from players where lower(name) = lower(p_name);
  if cur is null then
    insert into players(name, token_hash) values (p_name, h);
    return true;
  end if;
  return cur = h;
end $$;
grant execute on function public.claim_name(text, text) to anon, authenticated;

-- 2) 포인트별 조과 기록 (랭킹용)
create table if not exists public.records (
  id bigint generated always as identity primary key,
  point text not null check (char_length(point) <= 40),
  name text not null references public.players(name) on delete cascade,
  species text not null check (char_length(species) <= 20),
  size real not null check (size > 0 and size < 300),
  created_at timestamptz not null default now()
);
create index if not exists records_point_size_idx on public.records (point, size desc);
alter table public.records enable row level security;
drop policy if exists "records read" on public.records;
create policy "records read" on public.records for select using (true);
-- 쓰기는 아래 함수로만 (본인 아이디 확인)

create or replace function public.submit_record(p_name text, p_token text, p_point text, p_species text, p_size real)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare h text := encode(digest(p_token, 'sha256'), 'hex');
begin
  if not exists (select 1 from players where name = p_name and token_hash = h) then return false; end if;
  if p_size <= 0 or p_size >= 300 then return false; end if;
  insert into records(point, name, species, size) values (left(p_point, 40), p_name, left(p_species, 20), p_size);
  return true;
end $$;
grant execute on function public.submit_record(text, text, text, text, real) to anon, authenticated;

-- 3) 포인트별 랭킹: 아이디마다 최고 기록 1개, 상위 3명
create or replace function public.top3(p_point text)
returns table(name text, species text, size real, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select name, species, size, created_at from (
    select distinct on (name) name, species, size, created_at
    from records where point = p_point
    order by name, size desc, created_at asc
  ) b order by size desc, created_at asc limit 3;
$$;
grant execute on function public.top3(text) to anon, authenticated;

-- 4) 기록이 바뀌면 바로 알림
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; end $$;
