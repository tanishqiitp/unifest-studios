-- Newsletter sign-ups and "Share your experience" testimonial submissions from the home page.
-- Both tables are private: no select policies, so nobody can read them through the public API.
-- Rows arrive only through the two SECURITY DEFINER functions below. Review them in the Supabase dashboard.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source text not null default 'home' check (char_length(source) <= 40),
  created_at timestamptz not null default now()
);
alter table public.newsletter_subscribers enable row level security;

-- Returns 'subscribed' or 'already'.
create or replace function public.subscribe_newsletter(email text, source text default 'home')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(trim(coalesce(email, '')));
begin
  if char_length(e) > 254 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.';
  end if;
  -- Flood guard for the whole form.
  if (select count(*) from public.newsletter_subscribers n where n.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many sign-ups right now. Please try again later.';
  end if;
  insert into public.newsletter_subscribers (email, source) values (e, left(coalesce(source, 'home'), 40))
  on conflict on constraint newsletter_subscribers_email_key do nothing;
  if found then
    return 'subscribed';
  end if;
  return 'already';
end;
$$;
revoke all on function public.subscribe_newsletter(text, text) from public;
grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;

create table if not exists public.testimonial_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (char_length(email) <= 254),
  role text not null default '' check (char_length(role) <= 120),
  body text not null check (char_length(body) between 10 and 1500),
  rating smallint check (rating between 1 and 5),
  consent_publish boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.testimonial_submissions enable row level security;

create or replace function public.submit_testimonial(name text, email text, role text, body text, rating int default null, consent boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(trim(coalesce(email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.';
  end if;
  if (select count(*) from public.testimonial_submissions t where t.email = e and t.created_at > now() - interval '1 day') >= 3 then
    raise exception 'You have already shared feedback today. Thank you!';
  end if;
  if (select count(*) from public.testimonial_submissions t where t.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many submissions right now. Please try again later.';
  end if;
  -- Always pending: nothing is published without review.
  insert into public.testimonial_submissions (name, email, role, body, rating, consent_publish, status)
  values (left(trim(name), 80), e, left(trim(coalesce(role, '')), 120), left(trim(body), 1500), rating, coalesce(consent, false), 'pending');
end;
$$;
revoke all on function public.submit_testimonial(text, text, text, text, int, boolean) from public;
grant execute on function public.submit_testimonial(text, text, text, text, int, boolean) to anon, authenticated;
