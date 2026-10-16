-- Keyword Check templates: named, reusable keyword sets, private per user (RLS).
-- Safe to re-run: every object is created with IF NOT EXISTS or dropped first.

create table if not exists public.keyword_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.keyword_templates enable row level security;

drop policy if exists "Own templates" on public.keyword_templates;
create policy "Own templates" on public.keyword_templates
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists keyword_templates_touch on public.keyword_templates;
create trigger keyword_templates_touch before update on public.keyword_templates
  for each row execute function public.touch_updated_at();
