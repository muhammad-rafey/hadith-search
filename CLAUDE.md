# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Semantic search over Sahih al-Bukhari (English + Arabic). Hybrid retrieval (BM25/FTS + pgvector) fused with Reciprocal Rank Fusion, then a cross-encoder rerank. Embeddings + rerank run via Cohere (default) **or** a local BGE-M3 server, selected by `EMBED_PROVIDER`. A Next.js web app and an Expo mobile app share one backend (the Next.js BFF) and one set of types.

> **The README and `plan/` are partly historical.** They describe a "scaffold with 10 sample hadiths" and a Supabase Edge Function backend, written before the real corpus, the mobile app, and the Next.js BFF landed. The corpus is now loaded and the **Deno edge functions have been removed entirely** (the BFF is the only backend). Trust the code over those docs; `plan/` is useful for the *why* behind stack choices, not current wiring.

## Monorepo layout

pnpm workspaces, defined in `pnpm-workspace.yaml` as `apps/*` + `packages/*`. Note `supabase/` and `scripts/` are **not** workspace packages — they run via the Supabase CLI / node / python directly.

```
apps/web/          Next.js 16 App Router. Hosts the UI AND the shared HTTP API (BFF).
apps/mobile/       Expo SDK 54 / RN 0.81 / expo-router. Talks to the web app's /api.
packages/shared-types/   Zod schemas + row-mapping/text-cleaning utils. The web/API contract.
supabase/          Postgres 15 + pgvector schema (migrations, RPCs) + local-dev seed.
scripts/           One-shot data-ingestion tooling (dump → SQL → DB).
plan/              Architecture rationale & roadmap (living docs, partly aspirational).
```

## The one architecture fact that matters most

There is **one search pipeline**: the backend-for-frontend at **`apps/web/app/api/*`**. `runSearch()` in `apps/web/lib/server/search-pipeline.ts` is the real pipeline. **Both** the web UI and the mobile app call these routes — mobile via `EXPO_PUBLIC_API_URL` + `apps/mobile/lib/api.ts`. When you change search/browse/feedback behavior, this is what you edit.

> The original design (`plan/01-search-api.md`) used Deno **edge functions** (`supabase/functions/search` + `feedback`). Those were dormant (the apps never called `functions/v1/*`) and have now been **deleted**. If `plan/` or an old commit refers to them, it's historical.

### Request flow (both apps)

```
UI → apiFetch (forwards anon Supabase JWT as Bearer) → Next.js /api/* route
   → lib/server/* → Supabase RPC / table (via service-role admin client)
```

`apiFetch` exists in both `apps/web/lib/api.ts` and `apps/mobile/lib/api.ts`.

### Search pipeline stages (`apps/web/lib/server/search-pipeline.ts`)

1. **Rate limit** — in-memory token bucket per client key. `clientKeyFromRequest` trusts `x-vercel-forwarded-for` → `x-real-ip` → `x-forwarded-for` (last only if `TRUSTED_PROXY=true`). 429 + `Retry-After` on throttle. Per-isolate, not coordinated.
2. **Canonicalize** query (NFKC, lowercase, collapse whitespace) → SHA-256 cache key.
3. **Reference shortcut** — `"bukhari:123"`, `"Book 2, Hadith 5"` etc. resolve via lookup RPCs and return `mode:"reference"`, bypassing cache.
4. **Two-tier cache** — per-isolate TTL-LRU (`LRU_CAPACITY`/`LRU_TTL_MS`) in front of the Postgres `query_cache` table (`CACHE_TTL_DAYS`).
5. **Embed** (1024-dim, per `EMBED_PROVIDER`) — Cohere `embed-v4.0` (default) **or** a local BGE-M3 server (`bge-local` → `scripts/bge_m3_server.py`). On a missing key/server or timeout (`EMBED_TIMEOUT_MS` / `BGE_QUERY_TIMEOUT_MS`) it falls back to a deterministic stub embedding and marks the response `degraded:true`. A cheap per-isolate guard also checks the query-time provider matches the model the corpus was embedded with (`hadith_embeddings.model`); a mismatch logs loudly and marks `degraded` (vectors from two latent spaces don't compare).
6. **Hybrid retrieve** — `search_bukhari_hybrid` RPC (bilingual FTS + vector, fused by RRF). Over-fetches `RETRIEVE_COUNT` (default 40) candidates to feed the reranker a wide pool.
7. **Rerank** — cross-encoder, per `EMBED_PROVIDER`: Cohere `rerank-v4.0-pro` (`RERANK_TIMEOUT_MS`) or local `bge-reranker-v2-m3` (`BGE_RERANK_TIMEOUT_MS`). Kill switch: `RERANK_DISABLED=true` (or no backend) → identity order, `degraded:true`. Then a **`MIN_RELEVANCE`** floor (default 0.02, calibrated to bge-reranker; raise toward ~0.3 for Cohere) drops the off-topic tail — skipped when degraded.
8. **Map + persist** — rows mapped via `@hadith/shared-types`, then a fire-and-forget write to `query_cache` **only when not degraded and the result is non-empty** (a provider outage or an all-below-floor result must not poison the 7-day cache) and a log to `search_logs`. Degraded responses skip the per-isolate LRU too, so a transient failure self-heals on the next request.

## Data model

A single denormalized table **`public.hadith_table`** — a 1:1 mirror of the sunnah-db MariaDB dump, so columns are **quoted camelCase** (`"arabicURN"` PK, `"bookNumber"` *varchar*, `"hadithNumber"` *varchar*, may be comma-joined like `"521, 522"`, `"ourHadithNumber"` int, `"englishText"`, `"arabicText"`, `"englishBabName"`, `"arabicBabName"`, `"englishgrade1"`, `collection`). RLS = read-all. Embeddings live separately in `hadith_embeddings` (`arabic_urn` PK, `halfvec(1024)`, HNSW cosine, `model`/`text_hash`). Other tables: `query_cache`, `search_logs`, `feedback`, `bookmarks`.

> **Corpus reality:** `hadith_table` already holds **~45k rows across 15 collections** (bukhari, muslim, nasai, tirmidhi, …), but only **bukhari** (~7,277 rows) is embedded and exposed by search/browse today. The RPCs are all bukhari-scoped (see below). A leftover placeholder `hadiths` table + scaffold RPCs were dropped — see Gotchas.

**RPCs** (all `bukhari`-scoped, granted to `anon`/`authenticated`/`service_role`, projecting the camelCase table to snake_case columns):
- `search_bukhari_hybrid(query_text, query_embedding halfvec(1024), match_count=30, rrf_k=50, book_filter, narrator_filter, ts_config='english')` — the caller passes `match_count=RETRIEVE_COUNT` (40), not the 30 default. The FTS leg is **bilingual** (English `'english'` + Arabic `'simple'`, bitmap-OR of two GIN indexes); the `ts_config` param is **vestigial** (kept for signature compat, no longer used to build the tsvector — wiring it back in would defeat the literal-config GIN index).
- `get_bukhari_book_list()` — used by `apps/web/lib/hadiths.ts::getAllBooks()`. `get_bukhari_book_hadiths(p_book, p_limit, p_offset)`
- `get_bukhari_hadith_by_urn(p_urn)`, `get_bukhari_hadith_by_number(p_n)`, `get_bukhari_hadith_by_book_seq(p_book, p_seq)`, `get_bukhari_hadith_ids()`

**Three naming layers** — raw table (camelCase) → RPC output (snake_case) → API/Zod contract (`SearchResult`/`Hadith`). The translation lives in `packages/shared-types/src/map.ts` (`mapRowToSearchResult`, `mapRowToHadith`). Change a column name and you touch all three.

## Common commands

Run from the repo root. Node ≥ 20.19.4, pnpm 10 (`corepack enable && corepack prepare pnpm@10 --activate`).

```bash
pnpm install
pnpm dev            # web only → http://localhost:3000  (filters @hadith/web)
pnpm mobile         # expo start                          (filters @hadith/mobile)
pnpm build          # pnpm -r --parallel build (all packages)
pnpm lint           # Biome lint, all packages
pnpm typecheck      # tsc --noEmit, all packages
pnpm format         # Biome write (ignores **/*.md)
pnpm format:check   # Biome check (CI uses this)
```

There is **no test runner / no `test` script** in this repo — don't invent `pnpm test`.

Per-package (use `--filter`):

```bash
pnpm --filter @hadith/web typecheck          # tsc --noEmit
pnpm --filter @hadith/web ingest:embeddings  # one-time real embed → hadith_embeddings (Cohere by default, needs COHERE_API_KEY; or EMBED_PROVIDER=bge-local). Script wraps node --conditions=react-server + env-file.
pnpm --filter @hadith/mobile ios             # or android | web | start
```

`lint`/`typecheck` are per-package (`biome lint app components lib` + `tsc --noEmit`). To run a single check, filter to the package; there are no finer-grained per-file scripts.

### Match CI locally

CI (`.github/workflows/ci.yml`) is a single `build` job (the old `deno-check` job was removed with the edge functions):

```bash
pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm build
```

### Supabase local stack (needs Docker)

```bash
supabase start      # Postgres :54322, PostgREST :54321, Studio :54323
supabase db reset   # replay migrations 0003_*–0015_* + seed.sql
```

`supabase db reset` gives you the full schema + RPCs but **only 10 mock hadiths** (`seed.sql` seeds them into the real `hadith_table` + stub vectors in `hadith_embeddings`), not the real corpus. The backend itself is just `pnpm dev` (Next.js at :3000, serving the UI + `/api/*`) — there is no separate function to serve.

### Loading the real Bukhari corpus

This is a separate path from `db reset`:

```bash
python3 scripts/convert_hadith_dump.py            # MariaDB dump (~/Downloads/HadithTable.sql)
                                                  #   → migrations/0003_hadith_table_raw.sql (DDL)
                                                  #   → supabase/seed/hadith_table/NNNN.sql (393 INSERT chunks)
node --env-file=.env scripts/load_chunks.mjs      # streams chunks into hadith_table (needs DATABASE_URL, pooler :6543; truncates first)
pnpm --filter @hadith/web ingest:embeddings       # populate hadith_embeddings (Cohere, or EMBED_PROVIDER=bge-local)
```

The chunked corpus under `supabase/seed/hadith_table/` is loaded by `load_chunks.mjs`, **not** by `seed.sql`.

## Conventions

- **Biome** is the only formatter/linter (no ESLint/Prettier). 2-space indent, line width 100, double quotes, semicolons always, trailing commas everywhere except JSON. Markdown is ignored by Biome.
- Two lint rules are escalated to **errors** and CI will fail on them: `noExplicitAny` (no `any`) and `useImportType` (type-only imports must use `import type` — reinforced by `verbatimModuleSyntax: true`).
- TS base (`tsconfig.base.json`) is strict with `noUncheckedIndexedAccess` on — index access yields `T | undefined`, so guard array/record reads.
- Web styling is **Tailwind v4** (config in `app/globals.css` via `@theme`); mobile is **NativeWind v4** (Tailwind v3, `tailwind.config.js`). Same class names, different engines. Themes: light / dark / sepia via a `data-theme` attribute (web) / runtime `vars()` (mobile).

## Gotchas

- **`canonicalKey()` is duplicated by design** — server (`apps/web/lib/server/hash.ts`), web client (`apps/web/lib/queries/use-search.ts`), and mobile (`apps/mobile/lib/queries/use-search.ts`). They must produce identical output or cache keys diverge across surfaces. Change them together.
- **Service-role key is server-only.** It lives in `apps/web/lib/server/supabase-admin.ts` (used by all API routes to bypass RLS). If `SUPABASE_SERVICE_ROLE_KEY` is unset it falls back to the anon key with a warning, and RLS-protected writes (cache/logs/feedback) silently fail.
- **Dropped scaffold objects.** A placeholder generation (`0001_init.sql` `hadiths` table + `0002_search_rpc.sql` `search_hadiths`, plus a later prod-only `match_hadiths` and the unused `get_books_for_collection` RPC) was removed: deleted from prod (the empty `public.hadiths` had RLS disabled — a live exposure) and removed from `migrations/`. The migration set now starts at `0003_*`. Don't reintroduce a `hadiths`/`search_hadiths` path — the real table is `hadith_table` + `search_bukhari_hybrid`.
- **Duplicate migration prefixes.** `migrations/` still has two `0003_*` files; Supabase applies migrations in lexical filename order, so the suffix breaks ties (`0003_enable_extensions` before `0003_hadith_table_raw`). When adding migrations, verify the lexical order still satisfies dependencies. Note the live DB was hand-built and its recorded history doesn't match the files 1:1 (it never applied `0001/0002`); `0013`–`0015` (bilingual FTS + RPC hardening) are staged in the repo and **pending deploy**.
- **`database.types.ts` is generated** (`supabase gen types`) and can lag behind newer RPCs/migrations. Regenerate after schema changes rather than hand-editing. (Currently informational only — the server admin client is created untyped.)
- **Bookmarks are local-only IDs.** Stored in a Zustand+AsyncStorage/localStorage store (`hadith-search:bookmarks`); full hadiths are hydrated on demand via `POST /api/hadiths/by-bookmark-ids`.
- **Mobile env is build-time inlined.** Only `EXPO_PUBLIC_*` vars reach the app, from `apps/mobile/.env`. On a physical device, `EXPO_PUBLIC_API_URL` must be your machine's LAN IP, not `localhost`. Set `EXPO_PUBLIC_SHARE_BASE_URL` or share links leak the placeholder host.
- **Don't bump React independently.** Root `package.json` `pnpm.overrides` pins `react`/`react-dom`/`@types/*` to 19.1.x and `react-native-reanimated`/`react-native-css-interop` so web and mobile stay on one React. These are deliberate. (Next.js 16 accepts React `^19.0.0` and RN 0.81 accepts `^19.1.0`, so the single pinned version satisfies both.)
- **Degraded mode is the default-when-unconfigured state.** With no embedding backend (no `COHERE_API_KEY`, or `EMBED_PROVIDER=bge-local` with the server down), search still works (stub embedding, no rerank) and returns `degraded:true`. With placeholder Supabase env, the **web** app falls back to `MOCK_HADITHS` and runs fully offline; the **mobile** app does *not* have an offline mock path — it always needs a reachable `EXPO_PUBLIC_API_URL` (placeholder Supabase env there only skips attaching the JWT).
- All `/api/*` routes are `runtime = "nodejs"` + `dynamic = "force-dynamic"` (the pipeline needs Node crypto + the embedding/rerank SDK + `fetch` to the local BGE server).
- **Multilingual/multi-collection is deferred but mapped.** The data layer already holds 15 collections; reaching the end goal (free-text situation queries across collections + languages) needs, roughly: per-`(arabic_urn, lang)` embeddings (the PK is `arabic_urn` alone today), bilingual embedded passages (ingest currently embeds English-only), a `collection_filter` param on the bukhari RPCs (or generalized `search_hadith_hybrid`), per-language `ts_config`/GIN indexes, and query-language detection (today `req.language` only namespaces the cache). Do these when collection #2 / language #3 is actually scheduled — don't widen `hadith_table` with `urduText`-style columns reflexively.

## Environment

`.env.example` is the canonical reference (well-commented). Web reads root `.env.local`; mobile reads `apps/mobile/.env`. The only hard requirement to run end-to-end against real data is a Supabase project (URL + anon + service-role keys); Cohere, Sentry, and PostHog all degrade gracefully when absent.
