# Codebase Review & Cleanup — 2026-06-02

A point-in-time report. A multi-agent audit (10 dimensions, adversarially verified)
reviewed the codebase against the goal of semantic hadith search scaling to multiple
collections and languages. This documents what was found and fixed; for current
wiring trust `CLAUDE.md` and the code.

## Audit outcome

67 findings, 1 refuted as a false positive (the `MIN_RELEVANCE`/Cohere coupling was
already documented). Verifiers down-graded several over-claims (the FTS `LIMIT` and the
`&#146;` control-char bug → minor). Overall the codebase was already in good shape for
an MVP; the work below is correctness, hygiene, security, and doc-truth.

## Applied to the live database (consented)

Migration `cleanup_scaffold_objects` (verified, security advisor re-checked clean):
- **Dropped `public.hadiths`** (+ its sequence and two indexes) — an empty placeholder
  table with **RLS disabled** (a real anon read/write exposure flagged ERROR by the
  Supabase advisor). Also dropped the dead `match_hadiths(vector,int)` and
  `get_books_for_collection(text)` RPCs and the never-used `hadith_table_bukhari_trgm_idx`.

RPC hardening (`search_path` pin + `SECURITY INVOKER` on the two browse RPCs) was
**NOT** hot-patched — it ships as a version-controlled migration instead (see below).

## Pending deploy (migration files, not yet applied to prod)

The live `search_bukhari_hybrid` is still the original English-only `0010` version; the
following are staged in `supabase/migrations/` for your next deploy:
- `0013` (Arabic FTS GIN index) + `0014` (bilingual EN/AR `search_bukhari_hybrid`, now
  with the keyword-leg `ORDER BY rank_ix` fix).
- `0015_harden_rpc_security.sql` — pins `search_path` on all RPCs and switches
  `get_bukhari_hadith_by_book_seq` / `get_bukhari_hadith_ids` to `SECURITY INVOKER`.

> The live DB was hand-built; its recorded migration history never included the
> placeholder `0001`/`0002` (now deleted from the repo). A fresh `supabase db reset`
> now replays `0003`–`0015` + `seed.sql` cleanly (the seed was rewritten to populate the
> real `hadith_table` + `arabic_urn` embeddings instead of the dropped `hadiths` table).

## Code fixes

- **Narrator double-render** (`map.ts`): `mapRowToHadith` set `text_en === text_en_full`
  with the "Narrated X:" prefix intact, so detail/browse rendered the narrator twice.
  Both fields now strip the prefix (matching `mapRowToSearchResult`).
- **Mobile Private mode was a placebo**: the in-flight refactor dropped `skip_cache`;
  re-wired from the ui-store.
- **Silent recall-collapse guard**: search pipeline now verifies (once per isolate) that
  the query-time `EMBED_PROVIDER` matches `hadith_embeddings.model`; a mismatch logs
  loudly and marks the response degraded.
- **Sentry privacy leak**: the breadcrumb body-scrub regex matched `/functions/v1/search`
  (the retired edge fn) — the raw query body was never scrubbed for the live `/api/search`.
  Fixed to `/api/(search|feedback)`.
- **Ingest passage** embedded the narrator twice (`cleanEnglishText` keeps the prefix) →
  switched to `stripNarratorPrefix`; same fix in the cost estimator.
- **Empty-result caching**: a post-`MIN_RELEVANCE` empty result is no longer persisted for
  7 days. **C1 control char**: `&#146;`-style Windows-1252 entities now remap to real
  punctuation instead of leaking invisible control chars.
- **Build robustness**: build-time DB reads (browse/detail/sitemap) now fail fast and fall
  back to the bundled mock corpus when Supabase env is the placeholder, so a CI/offline
  build prerenders instead of hanging. Deleted the dead, divergent
  `use-bookmarked-hadiths.ts` hook.

## Tooling / CI

- **CI was red on `main`** at `format:check` (committed code didn't match Biome 1.9.4).
  Ran the formatter repo-wide; fixed `biome.json` ignore globs (they only matched
  root-level `.next`/`dist`, so Biome scanned build artifacts). `format:check`, `lint`,
  `typecheck`, and `build` now all pass.
- Added `scripts/` to the web lint glob; fixed the `ingest:embeddings` script (it lacked
  `--conditions=react-server` + env, so it threw on the `server-only` import). Retired the
  Deno edge functions and removed the `deno-check` CI job.

## Deferred — multilingual / multi-collection roadmap

The data layer already holds **15 collections (~45k rows)** but only **bukhari (~7,277)**
is embedded and searchable. Reaching the end goal (free-text situation queries across
collections + languages) needs, when actually scheduled — not now:
1. Embed a **bilingual passage** (EN+AR) — ingest currently embeds English-only, so Arabic
   semantic recall is weak. *Highest-impact, requires a re-embed.*
2. Composite `(arabic_urn, lang)` PK on `hadith_embeddings` (today one vector per hadith).
3. A `collection_filter` param on the bukhari RPCs (or a generalized `search_hadith_hybrid`)
   + per-language `ts_config`/GIN indexes + query-language detection (today `req.language`
   only namespaces the cache).
4. A `hadith_translations(arabic_urn, lang, …)` side-table rather than widening
   `hadith_table` with per-language columns.
