-- Unifest Studios: cloud projects and short share links.

-- Each user's projects. The app keeps its own id so local and cloud copies match.
create table if not exists public.projects (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'Untitled event',
  event_type text not null default '',
  audience integer not null default 0,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists projects_owner_updated on public.projects (owner, updated_at desc);

alter table public.projects enable row level security;

drop policy if exists "Owners read their projects" on public.projects;
create policy "Owners read their projects" on public.projects
  for select to authenticated using (owner = (select auth.uid()));
drop policy if exists "Owners add projects" on public.projects;
create policy "Owners add projects" on public.projects
  for insert to authenticated with check (owner = (select auth.uid()));
drop policy if exists "Owners update their projects" on public.projects;
create policy "Owners update their projects" on public.projects
  for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists "Owners delete their projects" on public.projects;
create policy "Owners delete their projects" on public.projects
  for delete to authenticated using (owner = (select auth.uid()));

-- Short client links: a read-only snapshot of a design under a short code.
create table if not exists public.shares (
  code text primary key check (char_length(code) between 8 and 32),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists shares_owner_project on public.shares (owner, project_id);

alter table public.shares enable row level security;

-- Owners manage their links. Nobody can list links; viewers fetch one by code through get_share().
drop policy if exists "Owners read their shares" on public.shares;
create policy "Owners read their shares" on public.shares
  for select to authenticated using (owner = (select auth.uid()));
drop policy if exists "Owners add shares" on public.shares;
create policy "Owners add shares" on public.shares
  for insert to authenticated with check (owner = (select auth.uid()));
drop policy if exists "Owners update their shares" on public.shares;
create policy "Owners update their shares" on public.shares
  for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists "Owners delete their shares" on public.shares;
create policy "Owners delete their shares" on public.shares
  for delete to authenticated using (owner = (select auth.uid()));

create or replace function public.get_share(share_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select s.data from public.shares s where s.code = share_code;
$$;
revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;
