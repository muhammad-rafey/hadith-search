-- Phase A.3: search_logs stores hashed-query metadata for analytics.
-- PRIVACY: never has a query_text column. query_hash is SHA-256 of canonical key.
create table if not exists public.search_logs (
  id            bigserial    primary key,
  user_id       uuid         null,
  query_hash    text         not null,
  query_length  int          not null,
  mode          text         not null check (mode in ('reference','cache','fresh','empty')),
  language      text         not null,
  result_count  int          not null,
  has_filter    bool         not null default false,
  latency_ms    int          not null,
  degraded      bool         not null default false,
  created_at    timestamptz  not null default now()
);

create index if not exists search_logs_created_idx
  on public.search_logs (created_at desc);
create index if not exists search_logs_hash_idx
  on public.search_logs (query_hash);

alter table public.search_logs enable row level security;
