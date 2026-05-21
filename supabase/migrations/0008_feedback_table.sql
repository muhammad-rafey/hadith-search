-- Phase A.3: Thumbs feedback per (user, query, hadith). hadith_id is the int arabicURN.
create table if not exists public.feedback (
  id          uuid         primary key default gen_random_uuid(),
  user_id     uuid         null,
  query_hash  text         not null,
  hadith_id   int          not null references public.hadith_table("arabicURN") on delete cascade,
  position    int          not null check (position >= 0),
  thumb       text         not null check (thumb in ('up','down')),
  created_at  timestamptz  not null default now()
);

create index if not exists feedback_hadith_idx on public.feedback (hadith_id);
create index if not exists feedback_query_hash_idx on public.feedback (query_hash);

create unique index if not exists feedback_dedupe_idx
  on public.feedback (coalesce(user_id::text, ''), query_hash, hadith_id, thumb);

alter table public.feedback enable row level security;
