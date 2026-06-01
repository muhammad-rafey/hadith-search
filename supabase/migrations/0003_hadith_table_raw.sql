-- =========================================================================
-- 0003_hadith_table_raw.sql
-- Raw 1:1 mirror of MariaDB dump (sunnah-db / HadithTable).
-- Identifiers preserved in camelCase via double-quotes.
-- =========================================================================

create table if not exists public.hadith_table (
  "collection" varchar(50) NOT NULL,
  "bookNumber" varchar(20) NOT NULL,
  "babID" decimal(6,2) NOT NULL,
  "englishBabNumber" varchar(21),
  "arabicBabNumber" varchar(21),
  "hadithNumber" varchar(50) NOT NULL,
  "ourHadithNumber" int NOT NULL,
  "arabicURN" int NOT NULL,
  "arabicBabName" text,
  "arabicText" text,
  "arabicgrade1" varchar(2000) NOT NULL,
  "englishURN" int NOT NULL,
  "englishBabName" text,
  "englishText" text,
  "englishgrade1" varchar(2000) NOT NULL,
  "last_updated" timestamptz NULL,
  "xrefs" varchar(1000) NOT NULL,
  primary key ("arabicURN")
);

create unique index if not exists hadith_table_englishurn_key on public.hadith_table ("englishURN");
create index if not exists hadith_table_colbook_idx on public.hadith_table ("collection", "bookNumber");
create index if not exists hadith_table_hadithNumber_idx on public.hadith_table ("hadithNumber");

-- Read-only public reference data (mirrors the policy in 0001_init.sql).
alter table public.hadith_table enable row level security;
create policy "hadith_table_read_all" on public.hadith_table for select using (true);
