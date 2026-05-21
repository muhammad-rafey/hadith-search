-- Code-review follow-ups (Phase 2):
--   1. Fix feedback dedupe: drop functional unique index that doesn't satisfy
--      Supabase's onConflict requirement, replace with a NULLS NOT DISTINCT
--      composite (PG15+) that matches `onConflict: "user_id,query_hash,hadith_id,thumb"`.
--   2. Add `get_bukhari_hadith_ids()` for the sitemap (returns URNs only —
--      orders of magnitude faster than the full-row browse RPC).
--   3. Add `get_bukhari_hadith_by_book_seq(p_book, p_seq)` for the reference
--      shortcut (replaces a 500-row pull + in-memory filter).

-- ── 1. Feedback dedupe ─────────────────────────────────────────────────────
drop index if exists public.feedback_dedupe_idx;

alter table public.feedback
  add constraint feedback_dedupe_uq
  unique nulls not distinct (user_id, query_hash, hadith_id, thumb);

-- ── 2. Sitemap-friendly ID list ────────────────────────────────────────────
create or replace function public.get_bukhari_hadith_ids()
returns table (arabic_urn int)
language sql
security definer
stable
set search_path = public
as $$
  select "arabicURN"::int
  from public.hadith_table
  where collection = 'bukhari'
  order by "arabicURN" asc
$$;

grant execute on function public.get_bukhari_hadith_ids() to anon, authenticated, service_role;

-- ── 3. Reference shortcut by (book, in-book seq) ───────────────────────────
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
  arabic_grade      text
)
language sql
security definer
stable
set search_path = public
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
    h."arabicgrade1"          as arabic_grade
  from public.hadith_table h
  where h.collection = 'bukhari'
    and nullif(h."bookNumber", '')::int = p_book
    and h."ourHadithNumber"::int = p_seq
  limit 1
$$;

grant execute on function public.get_bukhari_hadith_by_book_seq(int, int) to anon, authenticated, service_role;
