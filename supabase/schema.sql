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
