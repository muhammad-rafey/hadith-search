-- Bilingual FTS, part 1 of 2 — the Arabic keyword index.
--
-- Adds a GIN index over the Arabic text so the keyword leg can match Arabic
-- queries (the vector leg, bge-m3 / embed-v4, is already multilingual). Arabic
-- uses the 'simple' config: no Arabic stemmer ships with Postgres, and we only
-- need token equality there. The English leg keeps its 'english' GIN index from
-- 0004_hadith_table_search_indexes.sql.
--
-- The actual search_bukhari_hybrid function that USES both indexes is defined in
-- 0014_hybrid_fts_index_fix.sql. (This migration originally also redefined the
-- function, but that version referenced the `ts_config` PARAMETER inside
-- to_tsvector(), which does not match the literal-config GIN index expression
-- and forced a seq scan + statement timeout. 0014 supersedes it with literal
-- configs, so only the index below remains here.)
--
-- The expression MUST match the predicate in 0014 verbatim for the planner to
-- use this index.

create index if not exists hadith_table_bukhari_fts_ar_idx
  on public.hadith_table
  using gin (to_tsvector('simple', coalesce("arabicText", '')))
  where collection = 'bukhari';
