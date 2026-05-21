-- Phase A.3: hadith_embeddings holds Cohere embed-v4.0 vectors for bukhari hadiths.
-- Keyed by arabicURN (int PK from hadith_table). halfvec(1024) for storage savings.
create table if not exists public.hadith_embeddings (
  arabic_urn  int          primary key
              references public.hadith_table("arabicURN") on delete cascade,
  embedding   halfvec(1024) not null,
  model       text         not null default 'embed-v4.0',
  text_hash   text         not null,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);

create index if not exists hadith_embeddings_hnsw_idx
  on public.hadith_embeddings
  using hnsw (embedding halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.hadith_embeddings enable row level security;

drop policy if exists "hadith_embeddings_read_all" on public.hadith_embeddings;
create policy "hadith_embeddings_read_all" on public.hadith_embeddings
  for select using (true);
