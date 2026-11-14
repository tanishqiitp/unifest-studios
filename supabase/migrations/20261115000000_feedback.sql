-- Client feedback on shared links: comments and approval, left by anyone holding the link.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  share_code text not null references public.shares(code) on delete cascade,
  kind text not null check (kind in ('comment', 'approval')),
  status text check (status in ('approved', 'changes')),
  author text not null default '' check (char_length(author) <= 80),
  body text not null default '' check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists feedback_share_idx on public.feedback (share_code, created_at desc);
alter table public.feedback enable row level security;

-- Owners of the link read and delete its feedback. Nobody inserts directly; add_feedback() does.
drop policy if exists "Owners read feedback" on public.feedback;
create policy "Owners read feedback" on public.feedback
  for select to authenticated
  using (exists (select 1 from public.shares s where s.code = share_code and s.owner = (select auth.uid())));
drop policy if exists "Owners delete feedback" on public.feedback;
create policy "Owners delete feedback" on public.feedback
  for delete to authenticated
  using (exists (select 1 from public.shares s where s.code = share_code and s.owner = (select auth.uid())));

create or replace function public.add_feedback(share_code text, kind text, author text, body text, status text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.shares s where s.code = share_code) then
    raise exception 'Link not found';
  end if;
  -- Simple flood guard: at most 30 entries per link per hour.
  if (select count(*) from public.feedback f where f.share_code = add_feedback.share_code and f.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many comments on this link right now. Try again later.';
  end if;
  insert into public.feedback (share_code, kind, status, author, body)
  values (share_code, kind, case when kind = 'approval' then status else null end, left(coalesce(author, ''), 80), left(coalesce(body, ''), 2000));
end;
$$;
revoke all on function public.add_feedback(text, text, text, text, text) from public;
grant execute on function public.add_feedback(text, text, text, text, text) to anon, authenticated;
