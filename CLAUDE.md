# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Semantic search over Sahih al-Bukhari (English + Arabic). Hybrid retrieval (BM25/FTS + pgvector) fused with Reciprocal Rank Fusion, then a Cohere cross-encoder rerank. A Next.js web app and an Expo mobile app share one backend and one set of types.

> **The README and `plan/` are partly historical.** They describe a "scaffold with 10 sample hadiths" and a Supabase Edge Function backend, written before the real corpus, the mobile app, and the Next.js BFF landed. Trust the code over those docs; `plan/` is useful for the *why* behind stack choices, not current wiring.

## Monorepo layout

pnpm workspaces, defined in `pnpm-workspace.yaml` as `apps/*` + `packages/*`. Note `supabase/` and `scripts/` are **not** workspace packages — they run via the Supabase CLI / node / python directly.

```
apps/web/          Next.js 15 App Router. Hosts the UI AND the shared HTTP API (BFF).
apps/mobile/       Expo SDK 52 / RN 0.76 / expo-router. Talks to the web app's /api.
packages/shared-types/   Zod schemas + row-mapping/text-cleaning utils. The web/API contract.
supabase/          Postgres 15 + pgvector schema (migrations, RPCs), seed, Deno edge functions.
scripts/           One-shot data-ingestion tooling (dump → SQL → DB).
plan/              Architecture rationale & roadmap (living docs, partly aspirational).
```

## The one architecture fact that matters most

There are **two implementations of the search pipeline**, and they are not interchangeable:

1. **`apps/web/app/api/*` (the live one).** A backend-for-frontend. `runSearch()` in `apps/web/lib/server/search-pipeline.ts` is the real pipeline. **Both** the web UI and the mobile app call these routes — mobile via `EXPO_PUBLIC_API_URL` + `apps/mobile/lib/api.ts`. When you change search/browse/feedback behavior, this is almost always what you want.
2. **`supabase/functions/search` + `feedback` (Deno, dormant).** The original design from `plan/01-search-api.md`. The apps do **not** call `functions/v1/*` (verified). CI still typechecks them. Don't assume editing the edge function changes app behavior — it won't unless something is re-pointed at it.

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
5. **Embed** — Cohere `embed-v4.0` (1024-dim). On missing `COHERE_API_KEY` or timeout (`EMBED_TIMEOUT_MS`) it falls back to a deterministic stub embedding and marks the response `degraded:true`.
6. **Hybrid retrieve** — `search_bukhari_hybrid` RPC (FTS + vector, fused by RRF).
7. **Rerank** — Cohere `rerank-v4.0-pro` (`RERANK_TIMEOUT_MS`). Kill switch: `RERANK_DISABLED=true` (or no key) → identity order, `degraded:true`.
8. **Map + persist** — rows mapped via `@hadith/shared-types`, then a fire-and-forget write to `query_cache` **only when not degraded** (so a Cohere outage can't poison the 7-day cache) and a log to `search_logs`.

## Data model

A single denormalized table **`public.hadith_table`** — a 1:1 mirror of the sunnah-db MariaDB dump, so columns are **quoted camelCase** (`"arabicURN"` PK, `"bookNumber"` *varchar*, `"hadithNumber"` *varchar*, may be comma-joined like `"521, 522"`, `"ourHadithNumber"` int, `"englishText"`, `"arabicText"`, `"englishBabName"`, `"englishgrade1"`, `collection`). RLS = read-all. Embeddings live separately in `hadith_embeddings` (`halfvec(1024)`, HNSW cosine). Other tables: `query_cache`, `search_logs`, `feedback`, `bookmarks`.

**RPCs** (all `bukhari`-scoped, granted to `anon`/`authenticated`/`service_role`, projecting the camelCase table to snake_case columns):
- `search_bukhari_hybrid(query_text, query_embedding halfvec(1024), match_count=30, rrf_k=50, book_filter, narrator_filter, ts_config='english')`
- `get_bukhari_book_list()`, `get_bukhari_book_hadiths(p_book, p_limit, p_offset)`
- `get_bukhari_hadith_by_urn(p_urn)`, `get_bukhari_hadith_by_number(p_n)`, `get_bukhari_hadith_by_book_seq(p_book, p_seq)`, `get_bukhari_hadith_ids()`
- `get_books_for_collection(p_collection)` — used by `apps/web/lib/hadiths.ts::getAllBooks()`

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
pnpm --filter @hadith/web ingest:embeddings  # one-time real Cohere embed → hadith_embeddings (needs COHERE_API_KEY)
pnpm --filter @hadith/mobile ios             # or android | web | start
```

`lint`/`typecheck` are per-package (`biome lint app components lib` + `tsc --noEmit`). To run a single check, filter to the package; there are no finer-grained per-file scripts.

### Match CI locally

CI (`.github/workflows/ci.yml`) is two jobs:

```bash
# Job "build": run these in order, as CI does
pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm build

# Job "deno-check": typecheck edge functions. The --config flag is REQUIRED —
# deno reads config from CWD, not the entry file, so without it the per-function
# import map is ignored and npm:/jsr: specifiers fail to resolve.
deno check --config supabase/functions/search/deno.json   supabase/functions/search/index.ts
deno check --config supabase/functions/feedback/deno.json supabase/functions/feedback/index.ts
```

### Supabase local stack (needs Docker)

```bash
supabase start                                   # Postgres :54322, PostgREST :54321, Studio :54323
supabase db reset                                # replay ALL migrations + seed.sql
supabase functions serve search --env-file .env.local   # → http://127.0.0.1:54321/functions/v1/search (needs a JWT)
```

`supabase db reset` gives you the full schema + RPCs but **only 10 mock hadiths** (from `seed.sql` / `MOCK_HADITHS`), not the real corpus.

### Loading the real Bukhari corpus

This is a separate path from `db reset`:

```bash
python3 scripts/convert_hadith_dump.py            # MariaDB dump (~/Downloads/HadithTable.sql)
                                                  #   → migrations/0003_hadith_table_raw.sql (DDL)
                                                  #   → supabase/seed/hadith_table/NNNN.sql (393 INSERT chunks)
node --env-file=.env scripts/load_chunks.mjs      # streams chunks into hadith_table (needs DATABASE_URL, pooler :6543; truncates first)
pnpm --filter @hadith/web ingest:embeddings       # populate hadith_embeddings via Cohere
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
- **Duplicate migration prefixes.** `migrations/` has two `0003_*` and two `0004_*` files. Supabase applies migrations in lexical filename order, so the suffix breaks ties (`0003_enable_extensions` before `0003_hadith_table_raw`, `0004_get_books_for_collection` before `0004_hadith_table_search_indexes`). When adding migrations, verify the lexical order still satisfies dependencies.
- **`database.types.ts` is generated** (`supabase gen types`) and can lag behind newer RPCs/migrations. Regenerate after schema changes rather than hand-editing.
- **Bookmarks are local-only IDs.** Stored in a Zustand+AsyncStorage/localStorage store (`hadith-search:bookmarks`); full hadiths are hydrated on demand via `POST /api/hadiths/by-bookmark-ids`.
- **Mobile env is build-time inlined.** Only `EXPO_PUBLIC_*` vars reach the app, from `apps/mobile/.env`. On a physical device, `EXPO_PUBLIC_API_URL` must be your machine's LAN IP, not `localhost`. Set `EXPO_PUBLIC_SHARE_BASE_URL` or share links leak the placeholder host.
- **Don't bump React independently.** Root `package.json` `pnpm.overrides` pins `react`/`react-dom`/`@types/*` to 18.3.x and `react-native-reanimated`/`react-native-css-interop` so web and mobile stay on one React. These are deliberate.
- **Degraded mode is the default-when-unconfigured state.** With no `COHERE_API_KEY`, search still works (stub embedding, no rerank) and returns `degraded:true`; with placeholder Supabase env, both apps fall back to `MOCK_HADITHS` and run fully offline.
- All `/api/*` routes are `runtime = "nodejs"` + `dynamic = "force-dynamic"` (the pipeline needs Node crypto + the full Cohere SDK).

## Environment

`.env.example` is the canonical reference (well-commented). Web reads root `.env.local`; mobile reads `apps/mobile/.env`. The only hard requirement to run end-to-end against real data is a Supabase project (URL + anon + service-role keys); Cohere, Sentry, and PostHog all degrade gracefully when absent.
