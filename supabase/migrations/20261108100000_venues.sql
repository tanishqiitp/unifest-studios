-- Public venue library: anyone can search; signed-in users add and edit their own entries.

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  kind text not null default 'banquet' check (kind in ('banquet', 'hotel', 'convention', 'auditorium', 'open-ground', 'lawn', 'stadium', 'resort', 'college', 'club', 'other')),
  city text not null default '' check (char_length(city) <= 80),
  state text not null default '' check (char_length(state) <= 80),
  country text not null default 'India' check (char_length(country) <= 60),
  address text not null default '' check (char_length(address) <= 300),
  website text not null default '' check (char_length(website) <= 300),
  notes text not null default '' check (char_length(notes) <= 1000),
  indoor boolean not null default true,
  -- [{ name, w, l, h, theatre, banquet, standing }] in metres and people
  rooms jsonb not null default '[]' check (jsonb_typeof(rooms) = 'array' and jsonb_array_length(rooms) <= 40 and pg_column_size(rooms) < 32000),
  verified boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venues_city on public.venues (lower(city));
create index if not exists venues_name on public.venues (lower(name));

alter table public.venues enable row level security;

drop policy if exists "Anyone can read venues" on public.venues;
create policy "Anyone can read venues" on public.venues
  for select to anon, authenticated using (true);

-- New and edited entries are always unverified; only the team (service role) can verify.
drop policy if exists "Signed-in users add venues" on public.venues;
create policy "Signed-in users add venues" on public.venues
  for insert to authenticated with check (created_by = (select auth.uid()) and verified = false);
drop policy if exists "Owners edit their venues" on public.venues;
create policy "Owners edit their venues" on public.venues
  for update to authenticated using (created_by = (select auth.uid()) and verified = false) with check (created_by = (select auth.uid()) and verified = false);
drop policy if exists "Owners delete their venues" on public.venues;
create policy "Owners delete their venues" on public.venues
  for delete to authenticated using (created_by = (select auth.uid()) and verified = false);
