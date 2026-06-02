# Supabase backend — hadith-search

This directory holds the Supabase project that powers hadith-search:

- `config.toml` — local stack config (Postgres, Studio ports).
- `migrations/` — SQL migrations (schema + RPC). The set is `0003_*`–`0015_*`;
  the original placeholder `0001_init.sql` / `0002_search_rpc.sql` were removed
  (never applied to production, and they broke `supabase db reset`).
- `seed.sql` — local-dev seed (10 mock Bukhari rows + stub embeddings).

The schema and seed are **real**. `0003_hadith_table_raw.sql` defines the
denormalized `hadith_table` — a 1:1 mirror of the sunnah-db dump — and the FTS
leg is bilingual (English `'english'` config + Arabic `'simple'` config; see
0013/0014). `seed.sql` loads 10 mock Bukhari rows into that real table (plus
stub embeddings in `hadith_embeddings`, keyed by `arabicURN`) for the local dev
loop. The full ~45k-row corpus is loaded into production out-of-band via
`scripts/load_chunks.mjs` + the embedding ingest — not by `seed.sql`. The rows
match the `Hadith` Zod contract in `packages/shared-types/src/index.ts`.

> **The Supabase Deno Edge Functions have been retired and removed**
> (`supabase/functions/` no longer exists). The live API is now the Next.js
> backend-for-frontend at `apps/web/app/api/*`; both the web UI and the mobile
> app call those routes. Any reference below to `functions/v1/*` or
> `supabase functions serve` is obsolete.

---

## Prerequisites

1. **Supabase CLI** — install per the official docs:

   ```sh
   # macOS
   brew install supabase/tap/supabase

   # Linux / WSL (Homebrew on Linux)
   brew install supabase/tap/supabase

   # or via npm (works everywhere)
   npm install -g supabase
   ```

   See <https://supabase.com/docs/guides/cli/getting-started>.

2. **Docker** — required by `supabase start`. Docker Desktop or
   Docker Engine works.

3. Copy `.env.example` (in the repo root) to `.env.local` and fill in any
   real keys you have. Cohere is **optional** for local dev — when
   `COHERE_API_KEY` is empty the search pipeline falls back to a deterministic
   stub embedding so it still runs end-to-end (response is marked
   `degraded: true`).

---

## Common tasks

All commands run from the repo root (the directory that contains this
`supabase/` folder).

### Start the local stack

```sh
supabase start
```

This brings up Postgres (54322), PostgREST (54321), Studio (54323), and
Inbucket mail (54324). First run pulls Docker images (~few minutes);
subsequent runs are seconds.

### Reset the database (re-run all migrations + seed)

```sh
supabase db reset
```

This drops the local Postgres volume, replays **all migrations** in lexical
order (`0003_*` through `0015_*`), then loads `seed.sql`. Use it whenever you
change a migration or the seed.

---

## Smoke-test the search API

The live search/feedback API is the Next.js backend-for-frontend in
`apps/web/app/api/*` (run it with `pnpm dev` → <http://localhost:3000>), not a
Supabase Edge Function. The real pipeline is `runSearch()` in
`apps/web/lib/server/search-pipeline.ts`. Examples:

```sh
# Reference shortcut — should return mode: "reference" with bukhari:1.
curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"bukhari:1"}' | jq

# Free-text search (uses stub embedding when COHERE_API_KEY is unset).
curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"intention","topK":5}' | jq

# Same query twice — second call should return mode: "cache".
curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"abu hurairah"}' | jq
```

---

## What's NOT included yet

- `00-data-schema.md` and `00-data-ingestion.md` plan files.
- Rate limiting beyond the pipeline's in-memory per-client token bucket.
