-- Phase A.3: User-scoped bookmarks. Scaffolded for the future anon -> auth upgrade
-- flow; v1 still keeps bookmarks in Zustand/localStorage.
create table if not exists public.bookmarks (
  user_id     uuid         not null,
  hadith_id   int          not null references public.hadith_table("arabicURN") on delete cascade,
  created_at  timestamptz  not null default now(),
  primary key (user_id, hadith_id)
);

create index if not exists bookmarks_user_created_idx
  on public.bookmarks (user_id, created_at desc);

alter table public.bookmarks enable row level security;

drop policy if exists "bookmarks_select_own" on public.bookmarks;
create policy "bookmarks_select_own" on public.bookmarks
  for select using (auth.uid() = user_id);

drop policy if exists "bookmarks_insert_own" on public.bookmarks;
create policy "bookmarks_insert_own" on public.bookmarks
  for insert with check (auth.uid() = user_id);

drop policy if exists "bookmarks_delete_own" on public.bookmarks;
create policy "bookmarks_delete_own" on public.bookmarks
  for delete using (auth.uid() = user_id);
