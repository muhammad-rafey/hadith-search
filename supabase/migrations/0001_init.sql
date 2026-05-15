-- =============================================================================
-- 0001_init.sql — initial schema for hadith-search
-- =============================================================================
--
-- PLACEHOLDER SCHEMA. The user-provided data dump has not arrived yet, so this
-- schema is built against the `Hadith` Zod contract in
-- `packages/shared-types/src/index.ts` plus the design sketch in
-- `plan/01-search-api.md` §4.3. When the real dump lands, this file should be
-- revisited (and likely rewritten) per `00-data-schema.md` (which will be added
-- post-dump). Until then, this is what the Edge Function and the seed file
-- target.
--
-- Notable choices:
--   * `id` is `text`, not `bigint`, because shared-types uses string ids like
--     "bukhari:1" (collection-prefixed). Embeddings reference it by FK.
--   * `embedding` is `halfvec(1024)` per the plan — 16-bit floats, 2x cheaper
--     storage than `vector(1024)` with negligible recall loss for our cosine
--     workload, and Cohere `embed-v4.0` natively returns 1024-dim Matryoshka
--     vectors that we can use without truncation.
--   * `fts` is generated on `text_en_full` with the `english` config; once
--     Arabic and Urdu seeds land we'll add per-language `fts_*` columns or a
--     `simple`-config column with query-time stemming (TBD in the plan).
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists vector;
create extension if not exists pg_trgm;
-- pgcrypto provides gen_random_uuid() — used by feedback.id default.
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- hadiths
-- -----------------------------------------------------------------------------
create table if not exists public.hadiths (
  id                   text        primary key,
  collection           text        not null,
  hadith_number        int         not null,
  arabic_number        int,
  book_number          int         not null,
  book_name_en         text        not null,
  chapter_number       int,
  chapter_title_en     text,
  in_book_ref          text        not null,
  usc_msa_ref          text,
  narrator             text,
  narrator_normalized  text,
  text_en              text        not null,
  text_en_full         text        not null,
  text_ar              text,
  grades               jsonb,
  urn                  int,
  language             text        not null default 'en'
                                   check (language in ('en', 'ar', 'ur')),
  created_at           timestamptz not null default now(),

  -- Generated tsvector. STORED so we can index it. Built off `text_en_full`
  -- (which includes the "Narrated X:" prefix) so queries like "narrated by
  -- aishah" still match before the narrator-extraction shortcut kicks in.
  fts                  tsvector
                       generated always as (
                         to_tsvector('english', coalesce(text_en_full, ''))
                       ) stored
);

create index if not exists hadiths_fts_idx
  on public.hadiths using gin (fts);

-- Trigram index on narrator_normalized for the `ilike '%...%'` filter in the
-- search RPC. Needed so the narrator filter doesn't degrade to a seq scan.
create index if not exists hadiths_narrator_trgm_idx
  on public.hadiths using gin (narrator_normalized gin_trgm_ops);

-- Composite btree for browse-by-book and the (collection, book) filter the RPC
-- applies before fusion.
create index if not exists hadiths_collection_book_idx
  on public.hadiths (collection, book_number);

-- Helper btree for the reference shortcut path ("bukhari:1" or "Book N,
-- Hadith M"). The PK already covers id-based lookups; this covers the
-- (collection, hadith_number) lookup the Edge Function falls back to when the
-- query parses as "Book N, Hadith M".
create index if not exists hadiths_collection_number_idx
  on public.hadiths (collection, hadith_number);

-- -----------------------------------------------------------------------------
-- hadith_embeddings
-- -----------------------------------------------------------------------------
-- Separated from `hadiths` because:
--   1. Embeddings get re-generated when the model changes; the matn doesn't.
--   2. The embedding column is large; keeping it off-table speeds non-vector
--      queries (browse, detail, RPC filtering).
create table if not exists public.hadith_embeddings (
  hadith_id   text         primary key
              references public.hadiths(id) on delete cascade,
  embedding   halfvec(1024) not null,
  model       text         not null default 'embed-v4.0',
  created_at  timestamptz  not null default now()
);

-- HNSW index using halfvec_cosine_ops (Cohere embeddings are unit-normalized
-- and we use cosine distance via the `<=>` operator in the RPC).
-- m=16, ef_construction=64 per plan/01-search-api.md.
create index if not exists hadith_embeddings_hnsw_idx
  on public.hadith_embeddings
  using hnsw (embedding halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

-- -----------------------------------------------------------------------------
-- query_cache
-- -----------------------------------------------------------------------------
create table if not exists public.query_cache (
  query_hash  text         primary key,
  results     jsonb        not null,
  expires_at  timestamptz  not null,
  created_at  timestamptz  not null default now()
);

create index if not exists query_cache_expires_at_idx
  on public.query_cache (expires_at);

-- -----------------------------------------------------------------------------
-- search_logs (privacy: query_hash only, never raw query text)
-- -----------------------------------------------------------------------------
create table if not exists public.search_logs (
  id           bigserial    primary key,
  user_id      uuid,
  query_hash   text         not null,
  query_length int          not null,
  mode         text         not null
               check (mode in ('reference', 'cache', 'fresh', 'empty')),
  language     text         not null,
  result_count int          not null,
  has_filter   bool         not null,
  latency_ms   int          not null,
  degraded     bool         not null default false,
  created_at   timestamptz  not null default now()
);

create index if not exists search_logs_created_idx
  on public.search_logs (created_at desc);
create index if not exists search_logs_hash_idx
  on public.search_logs (query_hash);

-- -----------------------------------------------------------------------------
-- feedback (thumbs up/down on a search result)
-- -----------------------------------------------------------------------------
create table if not exists public.feedback (
  id          uuid         primary key default gen_random_uuid(),
  user_id     uuid,
  query_hash  text         not null,
  hadith_id   text         not null references public.hadiths(id) on delete cascade,
  position    int          not null,
  thumb       text         not null check (thumb in ('up', 'down')),
  created_at  timestamptz  not null default now()
);

create index if not exists feedback_hadith_idx
  on public.feedback (hadith_id);
create index if not exists feedback_query_hash_idx
  on public.feedback (query_hash);

-- -----------------------------------------------------------------------------
-- bookmarks
-- -----------------------------------------------------------------------------
create table if not exists public.bookmarks (
  user_id     uuid         not null,
  hadith_id   text         not null references public.hadiths(id) on delete cascade,
  created_at  timestamptz  not null default now(),
  primary key (user_id, hadith_id)
);

create index if not exists bookmarks_user_created_idx
  on public.bookmarks (user_id, created_at desc);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- hadiths and hadith_embeddings are read-only public reference data; everything
-- else is locked down. The Edge Function uses the service role key, which
-- bypasses RLS.
-- -----------------------------------------------------------------------------

-- hadiths: public read, no public write.
alter table public.hadiths enable row level security;
create policy "hadiths_read_all"
  on public.hadiths for select
  using (true);

-- hadith_embeddings: public read (the RPC needs to join in the same connection
-- when called via PostgREST as anon, and embeddings themselves aren't sensitive).
alter table public.hadith_embeddings enable row level security;
create policy "hadith_embeddings_read_all"
  on public.hadith_embeddings for select
  using (true);

-- query_cache: service role only. No policy => RLS denies all by default.
alter table public.query_cache enable row level security;

-- search_logs: service role only.
alter table public.search_logs enable row level security;

-- feedback: service role only. The feedback Edge Function runs with the
-- service role key, so no client-side policy is needed for v1. (When/if we
-- switch to client-direct inserts, add an INSERT policy keyed on auth.uid().)
alter table public.feedback enable row level security;

-- bookmarks: authenticated users CRUD their own rows.
alter table public.bookmarks enable row level security;

create policy "bookmarks_select_own"
  on public.bookmarks for select
  using (auth.uid() = user_id);

create policy "bookmarks_insert_own"
  on public.bookmarks for insert
  with check (auth.uid() = user_id);

create policy "bookmarks_update_own"
  on public.bookmarks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "bookmarks_delete_own"
  on public.bookmarks for delete
  using (auth.uid() = user_id);
