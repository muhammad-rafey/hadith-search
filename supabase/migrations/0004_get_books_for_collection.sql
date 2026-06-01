-- =========================================================================
-- 0004_get_books_for_collection.sql
-- RPC used by apps/web/lib/hadiths.ts → getAllBooks() to aggregate hadiths
-- by book without fetching every row to the client.
-- =========================================================================

create or replace function public.get_books_for_collection(p_collection text)
returns table(book_number int, book_name_en text, hadith_count int)
language sql stable as $$
  with ranked as (
    select
      "bookNumber",
      "englishBabName",
      "ourHadithNumber",
      row_number() over (
        partition by "bookNumber" order by "ourHadithNumber"
      ) as rn,
      count(*) over (partition by "bookNumber") as n
    from public.hadith_table
    where collection = p_collection
  )
  select
    -- bookNumber is varchar in source but always numeric for bukhari.
    -- Cast safely; non-numeric collections will need a different RPC.
    case when "bookNumber" ~ '^-?[0-9]+$' then "bookNumber"::int else 0 end as book_number,
    coalesce("englishBabName", 'Book ' || "bookNumber") as book_name_en,
    n::int as hadith_count
  from ranked
  where rn = 1
  order by book_number;
$$;

grant execute on function public.get_books_for_collection(text)
  to anon, authenticated, service_role;
