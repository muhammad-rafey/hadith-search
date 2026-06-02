-- Fix 0013: the FTS leg used the `ts_config` PARAMETER inside to_tsvector(),
-- e.g. to_tsvector(ts_config, "englishText"). The backing GIN indexes are on
-- the LITERAL configs (to_tsvector('english', "englishText") and
-- to_tsvector('simple', "arabicText")). A parameterized config does not match
-- the index expression, so the planner fell back to a sequential scan that
-- recomputed to_tsvector for every Arabic + English row on each query —
-- blowing past the statement timeout.
--
-- This replaces the function with literal configs ('english' for the English
-- leg, 'simple' for the Arabic leg) so both predicates are index-backed and the
-- OR becomes a fast bitmap-OR of the two GIN indexes. The `ts_config` parameter
-- is kept in the signature (callers still pass 'english') but is no longer used
-- to build the document tsvector; it would defeat the index.

create or replace function public.search_bukhari_hybrid(
  query_text       text,
  query_embedding  halfvec(1024),
  match_count      int       default 30,
  rrf_k            int       default 50,
  book_filter      int       default null,
  narrator_filter  text      default null,
  ts_config        regconfig default 'english'
)
returns table (
  arabic_urn        int,
  book_number       int,
  hadith_number_raw text,
  our_hadith_number int,
  english_bab_name  text,
  arabic_bab_name   text,
  english_text      text,
  arabic_text       text,
  english_grade     text,
  arabic_grade      text,
  score             float
)
language sql
stable
as $$
  with full_text as (
    select
      h."arabicURN" as id,
      row_number() over (
        order by (
          ts_rank_cd(
            to_tsvector('english', coalesce(h."englishText", '')),
            websearch_to_tsquery('english', query_text)
          )
          + ts_rank_cd(
            to_tsvector('simple', coalesce(h."arabicText", '')),
            websearch_to_tsquery('simple', query_text)
          )
        ) desc
      ) as rank_ix
    from public.hadith_table h
    where h.collection = 'bukhari'
      and (
        to_tsvector('english', coalesce(h."englishText", ''))
            @@ websearch_to_tsquery('english', query_text)
        or to_tsvector('simple', coalesce(h."arabicText", ''))
            @@ websearch_to_tsquery('simple', query_text)
      )
      and (book_filter is null or nullif(h."bookNumber", '')::int = book_filter)
      and (
        narrator_filter is null
        or lower(coalesce(h."englishText", '')) like '%' || lower(narrator_filter) || '%'
      )
    -- Keep the TOP-ranked keyword hits, not an arbitrary subset: a window
    -- function's ORDER BY only numbers the rows, it doesn't order the output,
    -- so LIMIT without this ORDER BY could discard the best lexical matches
    -- before RRF fusion. Mirrors the semantic leg's explicit ordering below.
    order by rank_ix
    limit least(match_count, 100) * 2
  ),
  semantic as (
    select
      e.arabic_urn as id,
      row_number() over (order by e.embedding <=> query_embedding) as rank_ix
    from public.hadith_embeddings e
    join public.hadith_table h on h."arabicURN" = e.arabic_urn
    where h.collection = 'bukhari'
      and (book_filter is null or nullif(h."bookNumber", '')::int = book_filter)
      and (
        narrator_filter is null
        or lower(coalesce(h."englishText", '')) like '%' || lower(narrator_filter) || '%'
      )
    order by e.embedding <=> query_embedding
    limit least(match_count, 100) * 2
  ),
  fused as (
    select
      coalesce(ft.id, s.id) as id,
      coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0)
        + coalesce(1.0 / (rrf_k + s.rank_ix), 0.0) as score
    from full_text ft
    full outer join semantic s on ft.id = s.id
  )
  select
    h."arabicURN",
    nullif(h."bookNumber", '')::int as book_number,
    h."hadithNumber" as hadith_number_raw,
    h."ourHadithNumber" as our_hadith_number,
    h."englishBabName" as english_bab_name,
    h."arabicBabName" as arabic_bab_name,
    h."englishText" as english_text,
    h."arabicText" as arabic_text,
    h."englishgrade1"::text as english_grade,
    h."arabicgrade1"::text as arabic_grade,
    f.score
  from fused f
  join public.hadith_table h on h."arabicURN" = f.id
  order by f.score desc
  limit match_count;
$$;

grant execute on function public.search_bukhari_hybrid(
  text, halfvec(1024), int, int, int, text, regconfig
) to anon, authenticated, service_role;
