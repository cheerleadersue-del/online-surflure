-- 온라인 서프루어낚시 v3: 친구
-- Supabase → SQL Editor 에 통째로 붙여넣고 Run (schema_v2.sql 다음에 실행)
-- A가 B를 추가하면 (A→B) 한 줄, B도 A를 추가하면 (B→A) 한 줄 → 둘 다 있으면 친구.
-- 한쪽만 있으면 '친구 요청' 상태.

create table if not exists public.friend_links (
  owner text not null references public.players(name) on delete cascade,
  friend text not null references public.players(name) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, friend),
  check (owner <> friend)
);
create index if not exists friend_links_friend_idx on public.friend_links (friend);
alter table public.friend_links enable row level security;
drop policy if exists "friend links read" on public.friend_links;
create policy "friend links read" on public.friend_links for select using (true);
-- 쓰기는 아래 함수로만 (본인 아이디 확인)

-- 친구 추가(요청 보내기 / 요청 수락)
create or replace function public.add_friend(p_name text, p_token text, p_friend text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare h text := encode(digest(p_token, 'sha256'), 'hex');
begin
  if not exists (select 1 from players where name = p_name and token_hash = h) then return false; end if;
  if p_name = p_friend or not exists (select 1 from players where name = p_friend) then return false; end if;
  -- 한 사람당 친구·요청 200개까지
  if (select count(*) from friend_links where owner = p_name) >= 200 then return false; end if;
  insert into friend_links(owner, friend) values (p_name, p_friend) on conflict do nothing;
  return true;
end $$;
grant execute on function public.add_friend(text, text, text) to anon, authenticated;

-- 친구 삭제 / 요청 거절: 양쪽 연결을 모두 지운다
create or replace function public.remove_friend(p_name text, p_token text, p_other text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare h text := encode(digest(p_token, 'sha256'), 'hex');
begin
  if not exists (select 1 from players where name = p_name and token_hash = h) then return false; end if;
  delete from friend_links where (owner = p_name and friend = p_other) or (owner = p_other and friend = p_name);
  return true;
end $$;
grant execute on function public.remove_friend(text, text, text) to anon, authenticated;
