-- Niche Locator: saved keyword lists and research reports, private per user (RLS).
-- Safe to re-run: every object is created with IF NOT EXISTS or dropped first.

create table if not exists public.keyword_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.keyword_lists (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  niche text not null,
  city_id text not null,
  keyword text not null,
  row jsonb not null,          -- CityRow snapshot at save time
  serp jsonb,                  -- SerpInfo snapshot (top 10 domains etc.)
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_id, niche, city_id, keyword)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  niche text not null,
  mode text not null,
  city_count integer not null default 0,
  data jsonb not null,         -- full Report object
  created_at timestamptz not null default now()
);

create index if not exists keyword_lists_user_idx on public.keyword_lists (user_id);
create index if not exists list_items_list_idx on public.list_items (list_id);
create index if not exists list_items_user_idx on public.list_items (user_id);
create index if not exists reports_user_created_idx on public.reports (user_id, created_at desc);

alter table public.keyword_lists enable row level security;
alter table public.list_items enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Own lists" on public.keyword_lists;
create policy "Own lists" on public.keyword_lists
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Own list items" on public.list_items;
create policy "Own list items" on public.list_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.keyword_lists l where l.id = list_id and l.user_id = (select auth.uid()))
  );

drop policy if exists "Own reports" on public.reports;
create policy "Own reports" on public.reports
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Keep updated_at current.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists keyword_lists_touch on public.keyword_lists;
create trigger keyword_lists_touch before update on public.keyword_lists
  for each row execute function public.touch_updated_at();
drop trigger if exists list_items_touch on public.list_items;
create trigger list_items_touch before update on public.list_items
  for each row execute function public.touch_updated_at();
