-- FDE Field Prep: database setup
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

-- 1. Who is allowed in. Only emails on this list can see or save progress.
create table if not exists public.members (
  email      text primary key,
  added_at   timestamptz not null default now()
);

-- 2. Display names shown on the board.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  created_at   timestamptz not null default now()
);

-- 3. One progress record per person (check-ins, minutes, cards, notes).
create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) < 200000),
  updated_at timestamptz not null default now()
);

-- Is the signed-in person on the study list?
create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row-level security: the rules that keep data private.
alter table public.members  enable row level security;
alter table public.profiles enable row level security;
alter table public.progress enable row level security;

drop policy if exists "members: see own row" on public.members;
create policy "members: see own row" on public.members
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "profiles: members read" on public.profiles;
create policy "profiles: members read" on public.profiles
  for select to authenticated using (public.is_member());

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "progress: members read" on public.progress;
create policy "progress: members read" on public.progress
  for select to authenticated using (public.is_member());

drop policy if exists "progress: insert own" on public.progress;
create policy "progress: insert own" on public.progress
  for insert to authenticated with check (user_id = auth.uid() and public.is_member());

drop policy if exists "progress: update own" on public.progress;
create policy "progress: update own" on public.progress
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member());

-- Live updates: lets each of you see the other's progress without refreshing.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'progress'
  ) then
    alter publication supabase_realtime add table public.progress;
  end if;
end $$;

-- Phones and browsers that turned on notifications. Each person sees only their own.
create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  sub        jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "push: own rows" on public.push_subs;
create policy "push: own rows" on public.push_subs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member());

-- 4. Add the two of you. Replace these with your real emails, then run.
insert into public.members (email) values
  ('you@example.com'),
  ('bert@example.com')
on conflict (email) do nothing;

-- 5. Player profiles: status updates with an optional photo, likes and comments.
-- Safe to re-run. If you set up the app before profiles existed, run just this section.
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 2000),
  image_path text check (image_path is null or char_length(image_path) <= 200),
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or image_path is not null)
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_user_idx on public.posts (user_id, created_at desc);

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.posts         enable row level security;
alter table public.post_likes    enable row level security;
alter table public.post_comments enable row level security;

drop policy if exists "posts: members read" on public.posts;
create policy "posts: members read" on public.posts
  for select to authenticated using (public.is_member());
drop policy if exists "posts: insert own" on public.posts;
create policy "posts: insert own" on public.posts
  for insert to authenticated with check (user_id = auth.uid() and public.is_member());
drop policy if exists "posts: delete own" on public.posts;
create policy "posts: delete own" on public.posts
  for delete to authenticated using (
    user_id = auth.uid()
    and public.is_member()
    and created_at > now() - interval '15 minutes'
    and created_at <= now()
  );

drop policy if exists "likes: members read" on public.post_likes;
create policy "likes: members read" on public.post_likes
  for select to authenticated using (public.is_member());
drop policy if exists "likes: insert own" on public.post_likes;
create policy "likes: insert own" on public.post_likes
  for insert to authenticated with check (user_id = auth.uid() and public.is_member());
drop policy if exists "likes: delete own" on public.post_likes;
create policy "likes: delete own" on public.post_likes
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "comments: members read" on public.post_comments;
create policy "comments: members read" on public.post_comments
  for select to authenticated using (public.is_member());
drop policy if exists "comments: insert own" on public.post_comments;
create policy "comments: insert own" on public.post_comments
  for insert to authenticated with check (user_id = auth.uid() and public.is_member());
-- You can delete your own comments, and any comment on your own post.
drop policy if exists "comments: delete own" on public.post_comments;
create policy "comments: delete own" on public.post_comments
  for delete to authenticated using (
    user_id = auth.uid() or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

do $$
declare t text;
begin
  foreach t in array array['posts', 'post_likes', 'post_comments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Photos live in a private storage bucket. Each player uploads into a folder named after their user id,
-- and only people on the study list can view them (the app asks for short-lived signed links).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-photos', 'post-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "post photos: members read" on storage.objects;
create policy "post photos: members read" on storage.objects
  for select to authenticated using (bucket_id = 'post-photos' and public.is_member());
drop policy if exists "post photos: upload own" on storage.objects;
create policy "post photos: upload own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member()
  );
drop policy if exists "post photos: delete own" on storage.objects;
create policy "post photos: delete own" on storage.objects
  for delete to authenticated using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);
