-- Phase A.3: 7-day TTL cache for search results, keyed by SHA-256 of canonical query.
-- Never stores raw query text (privacy).
create table if not exists public.query_cache (
  query_hash  text         primary key,
  results     jsonb        not null,
  expires_at  timestamptz  not null,
  created_at  timestamptz  not null default now()
);

create index if not exists query_cache_expires_at_idx
  on public.query_cache (expires_at);

alter table public.query_cache enable row level security;
-- No policies — service role only (Next.js API route).
