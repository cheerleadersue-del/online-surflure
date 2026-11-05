-- 온라인 서프루어낚시: Supabase SQL Editor 에 통째로 붙여넣고 Run 하세요.

-- 1) 조과 인증글
create table if not exists public.catches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  line text not null check (line in ('east', 'west')),
  method text not null check (method in ('lure', 'far', 'float', 'etc')),
  spot text not null check (char_length(spot) between 1 and 60),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  caught_at timestamptz,
  slot text check (char_length(slot) <= 10),
  species text not null check (char_length(species) between 1 and 30),
  size real check (size between 0 and 300),
  count int check (count between 0 and 999),
  bait text check (char_length(bait) <= 60),
  rod text check (char_length(rod) <= 60),
  reel text check (char_length(reel) <= 60),
  line_spec text check (char_length(line_spec) <= 60),
  water_temp real check (water_temp between -5 and 40),
  tide text check (char_length(tide) <= 20),
  weather text check (char_length(weather) <= 20),
  story text check (char_length(story) <= 2000),
  author text check (char_length(author) <= 24),
  photo_url text not null check (char_length(photo_url) <= 500),
  likes int not null default 0
);

-- 2) 댓글
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  catch_id uuid not null references public.catches (id) on delete cascade,
  author text check (char_length(author) <= 24),
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_catch_id_idx on public.comments (catch_id);

-- 3) 권한: 누구나 읽고 쓸 수 있음(로그인 없음). 수정·삭제는 대시보드에서만.
alter table public.catches enable row level security;
alter table public.comments enable row level security;

drop policy if exists "catches read" on public.catches;
drop policy if exists "catches insert" on public.catches;
drop policy if exists "comments read" on public.comments;
drop policy if exists "comments insert" on public.comments;
create policy "catches read" on public.catches for select using (true);
create policy "catches insert" on public.catches for insert with check (likes = 0);
create policy "comments read" on public.comments for select using (true);
create policy "comments insert" on public.comments for insert with check (true);

-- 4) 좋아요 (+1만 가능한 함수)
create or replace function public.like_catch(cid uuid)
returns int language sql security definer set search_path = public as $$
  update public.catches set likes = likes + 1 where id = cid returning likes;
$$;
grant execute on function public.like_catch(uuid) to anon, authenticated;

-- 5) 사진 저장소 (공개 읽기, 2MB 이하 이미지만 업로드)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "photos upload" on storage.objects;
drop policy if exists "photos read" on storage.objects;
create policy "photos upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'photos');
create policy "photos read" on storage.objects for select using (bucket_id = 'photos');

-- 6) 실시간 반영 (새 깃발·댓글이 바로 보이게)
do $$ begin
  alter publication supabase_realtime add table public.catches;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null; end $$;
