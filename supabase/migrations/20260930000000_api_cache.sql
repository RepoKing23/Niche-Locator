-- Shared cache of DataForSEO results (market data, not personal) so the same
-- Safe to re-run: every object is created with IF NOT EXISTS or dropped first.
-- keyword + city is never paid for twice within the cache window.

create table if not exists public.api_cache (
  kind text not null check (kind in ('kd', 'serp', 'local')),
  key text not null,
  data jsonb,                  -- null is a valid cached answer (e.g. "no keyword difficulty data")
  created_at timestamptz not null default now(),
  primary key (kind, key)
);

create index if not exists api_cache_created_idx on public.api_cache (created_at);

alter table public.api_cache enable row level security;

drop policy if exists "Signed-in users read cache" on public.api_cache;
create policy "Signed-in users read cache" on public.api_cache
  for select to authenticated using (true);
drop policy if exists "Signed-in users add cache" on public.api_cache;
create policy "Signed-in users add cache" on public.api_cache
  for insert to authenticated with check (true);
drop policy if exists "Signed-in users refresh cache" on public.api_cache;
create policy "Signed-in users refresh cache" on public.api_cache
  for update to authenticated using (true) with check (true);
