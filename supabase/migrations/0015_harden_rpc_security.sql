-- RPC security hardening (Supabase advisor: function_search_path_mutable +
-- anon/authenticated SECURITY DEFINER executable).
--
--   1. Pin a non-mutable search_path on every public RPC. pg_catalog first,
--      then public — the `vector` extension lives in public, so its <=> operator
--      and halfvec type still resolve. A fixed search_path closes the
--      object-shadowing vector that a mutable one leaves open.
--   2. Switch the two read-only browse RPCs that were defined SECURITY DEFINER
--      (get_bukhari_hadith_by_book_seq, get_bukhari_hadith_ids) to SECURITY
--      INVOKER. They only read hadith_table (RLS = read-all) and the app calls
--      them via the service-role client, so INVOKER is correct and removes the
--      "anon/authenticated can execute a SECURITY DEFINER function" finding.
--
-- Pure ALTER FUNCTION — no behavior change. (NOTE: this was prepared as a file
-- rather than hot-patched to the live DB; deploy it with the rest of the
-- pending migrations.)

alter function public.search_bukhari_hybrid(text, halfvec, integer, integer, integer, text, regconfig)
  set search_path = pg_catalog, public;
alter function public.get_bukhari_book_list()
  set search_path = pg_catalog, public;
alter function public.get_bukhari_book_hadiths(integer, integer, integer)
  set search_path = pg_catalog, public;
alter function public.get_bukhari_hadith_by_urn(integer)
  set search_path = pg_catalog, public;
alter function public.get_bukhari_hadith_by_number(integer)
  set search_path = pg_catalog, public;

alter function public.get_bukhari_hadith_by_book_seq(integer, integer)
  security invoker
  set search_path = pg_catalog, public;
alter function public.get_bukhari_hadith_ids()
  security invoker
  set search_path = pg_catalog, public;
