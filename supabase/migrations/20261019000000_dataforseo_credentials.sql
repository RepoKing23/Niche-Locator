-- DataForSEO API login + password entered on the Account page. One shared row; when it is
-- missing the app falls back to the DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD env vars.
-- Safe to re-run: every object is created with IF NOT EXISTS or dropped first.

create table if not exists public.dataforseo_credentials (
  id int primary key default 1 check (id = 1),
  login text not null,
  password text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table public.dataforseo_credentials enable row level security;

drop policy if exists "Signed-in users read credentials" on public.dataforseo_credentials;
create policy "Signed-in users read credentials" on public.dataforseo_credentials
  for select to authenticated using (true);
drop policy if exists "Signed-in users set credentials" on public.dataforseo_credentials;
create policy "Signed-in users set credentials" on public.dataforseo_credentials
  for insert to authenticated with check (true);
drop policy if exists "Signed-in users change credentials" on public.dataforseo_credentials;
create policy "Signed-in users change credentials" on public.dataforseo_credentials
  for update to authenticated using (true) with check (true);
drop policy if exists "Signed-in users remove credentials" on public.dataforseo_credentials;
create policy "Signed-in users remove credentials" on public.dataforseo_credentials
  for delete to authenticated using (true);
