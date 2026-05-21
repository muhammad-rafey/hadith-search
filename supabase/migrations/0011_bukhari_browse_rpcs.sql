-- Phase A.4: Browse + lookup RPCs scoped to bukhari.

create or replace function public.get_bukhari_book_list()
returns table (book_number int, hadith_count int)
language sql
stable
as $$
  select
    nullif("bookNumber", '')::int as book_number,
    count(*)::int as hadith_count
  from public.hadith_table
  where collection = 'bukhari'
  group by nullif("bookNumber", '')::int
  order by 1;
$$;
grant execute on function public.get_bukhari_book_list() to anon, authenticated, service_role;

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
  arabic_grade      text
)
language sql
stable
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
    h."arabicgrade1"::text as arabic_grade
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
  arabic_grade      text
)
language sql
stable
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
    h."arabicgrade1"::text as arabic_grade
  from public.hadith_table h
  where h.collection = 'bukhari'
    and h."arabicURN" = p_urn
  limit 1;
$$;
grant execute on function public.get_bukhari_hadith_by_urn(int) to anon, authenticated, service_role;

-- Lookup by hadithNumber. Source values may be comma-joined ("521, 522"); we
-- match against any element in the split list.
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
  arabic_grade      text
)
language sql
stable
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
    h."arabicgrade1"::text as arabic_grade
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
