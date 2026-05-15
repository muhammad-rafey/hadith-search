-- =============================================================================
-- 0002_search_rpc.sql — hybrid search RPC for hadith-search
-- =============================================================================
--
-- Defines `public.search_hadiths(...)`, the single RPC the Edge Function calls
-- to do hybrid (BM25 + vector) retrieval fused with Reciprocal Rank Fusion.
-- Adapted from Supabase's published hybrid-search pattern, with the post-fix
-- `ts_config regconfig` parameter so the same function works for English,
-- Arabic, Urdu, etc. (driven by the request `language`).
--
-- Returns the columns that match the `SearchResult` Zod shape in
-- `packages/shared-types/src/index.ts`, plus an internal `score` field used
-- by the Edge Function when the reranker is disabled.
--
-- Notes:
--   * `language sql stable` so the planner can inline / cache.
--   * `security invoker` is the default — runs as the caller, RLS applies.
--     The Edge Function calls it with the service role key, which bypasses
--     RLS on `hadith_embeddings`. Anon clients can still call it because
--     `hadiths` and `hadith_embeddings` both have `read_all` policies.
--   * `least(match_count, 60) * 2` over-fetches each side of the fusion so
--     RRF has enough candidates to merge.
--   * `narrator_filter` uses `ilike '%...%'` — backed by the trigram index
--     on `narrator_normalized` from 0001_init.sql.
--
-- =============================================================================

create or replace function public.search_hadiths(
  query_text         text,
  query_embedding    halfvec(1024),
  match_count        int       default 30,
  rrf_k              int       default 50,
  full_text_weight   float     default 1.0,
  semantic_weight    float     default 1.0,
  collection_filter  text      default 'bukhari',
  book_filter        int       default null,
  narrator_filter    text      default null,
  language_filter    text      default 'en',
  ts_config          regconfig default 'english'
)
returns table (
  id                text,
  hadith_number     int,
  book_number       int,
  book_name_en      text,
  chapter_title_en  text,
  in_book_ref       text,
  usc_msa_ref       text,
  narrator          text,
  text_en_full      text,
  text_ar           text,
  score             float
)
language sql stable as $$
  with full_text as (
    select h.id,
           row_number() over (
             order by ts_rank_cd(h.fts, websearch_to_tsquery(ts_config, query_text)) desc
           ) as rank_ix
    from public.hadiths h
    where h.fts @@ websearch_to_tsquery(ts_config, query_text)
      and h.collection = collection_filter
      and h.language = language_filter
      and (book_filter is null or h.book_number = book_filter)
      and (narrator_filter is null or h.narrator_normalized ilike '%' || narrator_filter || '%')
    order by rank_ix
    limit least(match_count, 60) * 2
  ),
  semantic as (
    select e.hadith_id as id,
           row_number() over (order by e.embedding <=> query_embedding) as rank_ix
    from public.hadith_embeddings e
    join public.hadiths h on h.id = e.hadith_id
    where h.collection = collection_filter
      and h.language = language_filter
      and (book_filter is null or h.book_number = book_filter)
      and (narrator_filter is null or h.narrator_normalized ilike '%' || narrator_filter || '%')
    order by rank_ix
    limit least(match_count, 60) * 2
  )
  select h.id,
         h.hadith_number,
         h.book_number,
         h.book_name_en,
         h.chapter_title_en,
         h.in_book_ref,
         h.usc_msa_ref,
         h.narrator,
         h.text_en_full,
         h.text_ar,
         (coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight
        + coalesce(1.0 / (rrf_k + s.rank_ix),  0.0) * semantic_weight) as score
  from full_text ft
    full outer join semantic s on ft.id = s.id
    join public.hadiths h on h.id = coalesce(ft.id, s.id)
  order by score desc
  limit match_count;
$$;

-- Allow anon and authenticated callers to execute. The function reads through
-- RLS, so this just exposes it to PostgREST.
grant execute on function public.search_hadiths(
  text, halfvec(1024), int, int, float, float, text, int, text, text, regconfig
) to anon, authenticated, service_role;
