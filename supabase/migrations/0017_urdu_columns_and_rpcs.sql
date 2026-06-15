-- =========================================================================
-- 0017_urdu_columns_and_rpcs.sql
-- Surface the Urdu translation through the read path.
--
-- Background: the scraper (PR #62, scraper/scrape.mjs + populate_urdu.mjs)
-- added two nullable text columns to hadith_table and populates them
-- out-of-band, matching scraped Urdu against the Arabic already in the table:
--   "urduText"  — the Urdu translation of the matn (body)
--   "urduSanad" — the Urdu chain of narration (isnad)
-- Those columns carry the data but nothing reads them: every browse / lookup /
-- search RPC projects only the English + Arabic columns. This migration adds
-- urdu_text + urdu_sanad to every row-producing RPC so the mapper, API, and
-- both apps can show Urdu alongside Arabic + English.
--
-- Self-contained on purpose: the ADD COLUMN below is idempotent (IF NOT EXISTS)
-- so this migration applies cleanly whether or not the scraper PR's
-- 0013_add_urdu_columns.sql ever lands — and matches what is already in prod.
--
-- Every function is re-created SECURITY INVOKER with a pinned search_path
-- (pg_catalog, public) to preserve the 0015 hardening — CREATE OR REPLACE
-- resets SET-clause properties, so they must be restated here. Grants survive a
-- replace, but we re-grant defensively. The function BODIES are unchanged from
-- their prior migrations except for the two new projected columns.
-- =========================================================================

alter table public.hadith_table
  add column if not exists "urduText"  text,
  add column if not exists "urduSanad" text;

-- ── Search: hybrid bilingual FTS + vector (supersedes 0014) ────────────────
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
  urdu_text         text,
  urdu_sanad        text,
  score             float
)
language sql
stable
security invoker
set search_path = pg_catalog, public
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
    h."urduText" as urdu_text,
    h."urduSanad" as urdu_sanad,
    f.score
  from fused f
  join public.hadith_table h on h."arabicURN" = f.id
  order by f.score desc
  limit match_count;
$$;

grant execute on function public.search_bukhari_hybrid(
  text, halfvec(1024), int, int, int, text, regconfig
) to anon, authenticated, service_role;

-- ── Bukhari browse + lookup RPCs (supersede 0011) ──────────────────────────
create or replace function public.get_bukhari_book_hadiths(
  p_book      int,
  p_limit     int default 50,
  p_offset    int default 0
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
  urdu_text         text,
  urdu_sanad        text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
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
    h."urduText" as urdu_text,
    h."urduSanad" as urdu_sanad
  from public.hadith_table h
  where h.collection = 'bukhari'
    and nullif(h."bookNumber", '')::int = p_book
  order by h."ourHadithNumber"
  limit p_limit
  offset p_offset;
$$;
grant execute on function public.get_bukhari_book_hadiths(int, int, int) to anon, authenticated, service_role;

create or replace function public.get_bukhari_hadith_by_urn(p_urn int)
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
  urdu_text         text,
  urdu_sanad        text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
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
    h."urduText" as urdu_text,
    h."urduSanad" as urdu_sanad
  from public.hadith_table h
  where h.collection = 'bukhari'
    and h."arabicURN" = p_urn
  limit 1;
$$;
grant execute on function public.get_bukhari_hadith_by_urn(int) to anon, authenticated, service_role;

create or replace function public.get_bukhari_hadith_by_number(p_n int)
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
  urdu_text         text,
  urdu_sanad        text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
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
    h."urduText" as urdu_text,
    h."urduSanad" as urdu_sanad
  from public.hadith_table h
  where h.collection = 'bukhari'
    and exists (
      select 1
      from regexp_split_to_table(h."hadithNumber", '\s*,\s*') as part
      where part = p_n::text
    )
  order by h."ourHadithNumber"
  limit 1;
$$;
grant execute on function public.get_bukhari_hadith_by_number(int) to anon, authenticated, service_role;

-- ── Reference shortcut by (book, in-book seq) (supersedes 0012) ─────────────
create or replace function public.get_bukhari_hadith_by_book_seq(
  p_book int,
  p_seq  int
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
  urdu_text         text,
  urdu_sanad        text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select
    h."arabicURN"::int        as arabic_urn,
    nullif(h."bookNumber", '')::int as book_number,
    h."hadithNumber"          as hadith_number_raw,
    h."ourHadithNumber"::int  as our_hadith_number,
    h."englishBabName"        as english_bab_name,
    h."arabicBabName"         as arabic_bab_name,
    h."englishText"           as english_text,
    h."arabicText"            as arabic_text,
    h."englishgrade1"         as english_grade,
    h."arabicgrade1"          as arabic_grade,
    h."urduText"              as urdu_text,
    h."urduSanad"             as urdu_sanad
  from public.hadith_table h
  where h.collection = 'bukhari'
    and nullif(h."bookNumber", '')::int = p_book
    and h."ourHadithNumber"::int = p_seq
  limit 1
$$;
grant execute on function public.get_bukhari_hadith_by_book_seq(int, int) to anon, authenticated, service_role;

-- ── Generic collection-aware browse + lookup RPCs (supersede 0016) ─────────
-- book_number_raw / hadith_number_raw are TEXT here (the full corpus has
-- 'introduction' / '35b' / '8 a' / '521, 522'). Reading-order key is unchanged.
create or replace function public.get_collection_hadiths(
  p_collection text,
  p_limit      int default 50,
  p_offset     int default 0
)
returns table (
  collection         text,
  arabic_urn         int,
  book_number_raw    text,
  hadith_number_raw  text,
  our_hadith_number  int,
  english_bab_name   text,
  arabic_bab_name    text,
  english_text       text,
  arabic_text        text,
  english_grade      text,
  arabic_grade       text,
  urdu_text          text,
  urdu_sanad         text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select
    h.collection::text,
    h."arabicURN",
    h."bookNumber"::text,
    h."hadithNumber"::text,
    h."ourHadithNumber",
    h."englishBabName",
    h."arabicBabName",
    h."englishText",
    h."arabicText",
    h."englishgrade1"::text,
    h."arabicgrade1"::text,
    h."urduText",
    h."urduSanad"
  from public.hadith_table h
  where h.collection = p_collection
  order by
    (case when lower(coalesce(h."bookNumber", '')) = 'introduction' then 0 else 1 end),
    nullif(regexp_replace(coalesce(h."bookNumber", ''), '[^0-9].*$', ''), '')::int nulls last,
    h."bookNumber",
    h."ourHadithNumber"
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;
grant execute on function public.get_collection_hadiths(text, int, int) to anon, authenticated, service_role;

create or replace function public.get_hadith_by_collection_urn(
  p_collection text,
  p_urn        int
)
returns table (
  collection         text,
  arabic_urn         int,
  book_number_raw    text,
  hadith_number_raw  text,
  our_hadith_number  int,
  english_bab_name   text,
  arabic_bab_name    text,
  english_text       text,
  arabic_text        text,
  english_grade      text,
  arabic_grade       text,
  urdu_text          text,
  urdu_sanad         text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select
    h.collection::text, h."arabicURN", h."bookNumber"::text, h."hadithNumber"::text,
    h."ourHadithNumber", h."englishBabName", h."arabicBabName",
    h."englishText", h."arabicText", h."englishgrade1"::text, h."arabicgrade1"::text,
    h."urduText", h."urduSanad"
  from public.hadith_table h
  where h.collection = p_collection and h."arabicURN" = p_urn
  limit 1;
$$;
grant execute on function public.get_hadith_by_collection_urn(text, int) to anon, authenticated, service_role;

create or replace function public.get_hadith_by_collection_number(
  p_collection text,
  p_number     text
)
returns table (
  collection         text,
  arabic_urn         int,
  book_number_raw    text,
  hadith_number_raw  text,
  our_hadith_number  int,
  english_bab_name   text,
  arabic_bab_name    text,
  english_text       text,
  arabic_text        text,
  english_grade      text,
  arabic_grade       text,
  urdu_text          text,
  urdu_sanad         text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with q as (
    select regexp_replace(lower(coalesce(p_number, '')), '\s+', '', 'g') as n
  )
  select
    h.collection::text, h."arabicURN", h."bookNumber"::text, h."hadithNumber"::text,
    h."ourHadithNumber", h."englishBabName", h."arabicBabName",
    h."englishText", h."arabicText", h."englishgrade1"::text, h."arabicgrade1"::text,
    h."urduText", h."urduSanad"
  from public.hadith_table h, q
  where h.collection = p_collection
    and q.n <> ''
    and (
      regexp_replace(lower(coalesce(h."hadithNumber", '')), '\s+', '', 'g') = q.n
      or regexp_replace(lower(split_part(coalesce(h."hadithNumber", ''), ',', 1)), '\s+', '', 'g') = q.n
    )
  order by
    (case when lower(coalesce(h."bookNumber", '')) = 'introduction' then 0 else 1 end),
    nullif(regexp_replace(coalesce(h."bookNumber", ''), '[^0-9].*$', ''), '')::int nulls last,
    h."bookNumber",
    h."ourHadithNumber"
  limit 1;
$$;
grant execute on function public.get_hadith_by_collection_number(text, text) to anon, authenticated, service_role;
