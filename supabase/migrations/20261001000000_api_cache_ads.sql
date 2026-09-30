-- Allow caching city-level Google Ads data ("<keyword> <city>") alongside KD, SERP and local demand.
alter table public.api_cache drop constraint if exists api_cache_kind_check;
alter table public.api_cache add constraint api_cache_kind_check check (kind in ('kd', 'serp', 'local', 'ads'));
