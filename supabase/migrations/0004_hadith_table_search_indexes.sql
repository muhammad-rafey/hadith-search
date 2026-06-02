-- Phase A.2: Expression indexes on the raw hadith_table.
-- We do not ALTER hadith_table (front-end cleans markup at render). Instead we
-- add EXPRESSION GIN/BTREE indexes scoped to collection='bukhari' so the planner
-- can use them for the only collection the MVP exposes.

create index if not exists hadith_table_bukhari_fts_idx
  on public.hadith_table
  using gin (to_tsvector('english', coalesce("englishText", '')))
  where collection = 'bukhari';

-- NOTE: an earlier trigram index (hadith_table_bukhari_trgm_idx) on
-- lower("englishText") was dropped — the planner never used it (the narrator
-- filter is a small post-fusion predicate, and hybrid search relies on the FTS
-- GIN above + the HNSW vector index). Re-add a trgm index only if a future
-- substring-search feature actually needs it.

create index if not exists hadith_table_bukhari_bookno_int_idx
  on public.hadith_table ((nullif("bookNumber", '')::int))
  where collection = 'bukhari';

create index if not exists hadith_table_bukhari_book_ourno_idx
  on public.hadith_table ("bookNumber", "ourHadithNumber")
  where collection = 'bukhari';
