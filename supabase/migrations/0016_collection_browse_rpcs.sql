-- =========================================================================
-- 0016_collection_browse_rpcs.sql
-- Generalized, collection-aware browse + lookup RPCs (all 15 collections).
--
-- The original browse/lookup RPCs (0011/0012) are bukhari-only and cast
-- "bookNumber"/"hadithNumber" to int. Across the full corpus those columns are
-- text: book numbers like 'introduction' / '35b' / '8b' and hadith numbers like
-- '8 a' / '11 b' / '1001b' / comma-joined '521, 522'. These RPCs treat both as
-- text, return the raw values plus the `collection`, and order results in
-- canonical reading order: the 'introduction' book first, then numeric book
-- order (leading digits, so '35b' sorts as 35), then in-book sequence.
--
-- Semantic/keyword search stays bukhari-only (search_bukhari_hybrid). These
-- power the collection-first Browse experience and the "jump to a hadith
-- number" feature for every collection.
--
-- NOTE: the three ORDER BY blocks below are identical reading-order keys; SQL
-- has no shared ORDER BY macro, so keep them in sync if you change one.
-- =========================================================================

-- 15 collections + their row counts, alphabetical. Powers the Browse landing.
create or replace function public.get_collection_list()
returns table (collection text, hadith_count int)
language sql
stable
security definer
set search_path = public
as $$
  select h.collection::text, count(*)::int
  from public.hadith_table h
  group by h.collection
  order by h.collection;
$$;

-- One page of a collection in canonical reading order. p_limit is capped at 200.
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
  arabic_grade       text
)
language sql
stable
security definer
set search_path = public
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
    h."arabicgrade1"::text
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

-- Single hadith by (collection, arabicURN) — the canonical permalink target.
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
  arabic_grade       text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.collection::text, h."arabicURN", h."bookNumber"::text, h."hadithNumber"::text,
    h."ourHadithNumber", h."englishBabName", h."arabicBabName",
    h."englishText", h."arabicText", h."englishgrade1"::text, h."arabicgrade1"::text
  from public.hadith_table h
  where h.collection = p_collection and h."arabicURN" = p_urn
  limit 1;
$$;

-- "Jump to a hadith number" within a collection. Matches the canonical
-- hadithNumber, whitespace- and case-insensitively, so user input '8a' matches
-- stored '8 a'. Comma-joined numbers ('521, 522') also match their first part.
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
  arabic_grade       text
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select regexp_replace(lower(coalesce(p_number, '')), '\s+', '', 'g') as n
  )
  select
    h.collection::text, h."arabicURN", h."bookNumber"::text, h."hadithNumber"::text,
    h."ourHadithNumber", h."englishBabName", h."arabicBabName",
    h."englishText", h."arabicText", h."englishgrade1"::text, h."arabicgrade1"::text
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

grant execute on function public.get_collection_list() to anon, authenticated, service_role;
grant execute on function public.get_collection_hadiths(text, int, int) to anon, authenticated, service_role;
grant execute on function public.get_hadith_by_collection_urn(text, int) to anon, authenticated, service_role;
grant execute on function public.get_hadith_by_collection_number(text, text) to anon, authenticated, service_role;
