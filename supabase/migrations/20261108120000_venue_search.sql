-- Accent-free search text, so "meridien" finds "Le Méridien".
alter table public.venues add column if not exists search_text text generated always as (
  translate(lower(name || ' ' || city || ' ' || state || ' ' || address), 'áàâäãåéèêëíìîïóòôöõúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn')
) stored;
create index if not exists venues_search_text on public.venues (search_text);
