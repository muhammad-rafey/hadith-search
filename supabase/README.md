# Supabase backend — hadith-search

This directory holds the Supabase project that powers hadith-search:

- `config.toml` — local stack config (Postgres, Studio, Edge Runtime ports).
- `migrations/` — SQL migrations (schema + RPC).
- `seed.sql` — local-dev seed (10 mock hadiths + stub embeddings).
- `functions/search/` — hybrid-search Edge Function (Deno).
- `functions/feedback/` — thumbs up/down Edge Function (Deno).
- `functions/_shared/` — shared CORS + helpers.

The schema and seed are **placeholders** until the user-provided data dump
arrives. They match the `Hadith` Zod contract in
`packages/shared-types/src/index.ts` so the web app can develop against
realistic shapes.

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

3. **Deno** is *not* required locally — `supabase functions serve` ships its
   own Deno runtime inside the Edge Runtime container.

4. Copy `.env.example` (in the repo root) to `.env.local` and fill in any
   real keys you have. Cohere is **optional** for local dev — when
   `COHERE_API_KEY` is empty the search function falls back to a deterministic
   stub embedding so the pipeline still runs end-to-end (response is marked
   `degraded: true`).

---

## Common tasks

All commands run from the repo root (the directory that contains this
`supabase/` folder).

### Start the local stack

```sh
supabase start
```

This brings up Postgres (54322), PostgREST (54321), Studio (54323), Inbucket
mail (54324), and the Edge Runtime. First run pulls Docker images
(~few minutes); subsequent runs are seconds.

### Reset the database (re-run all migrations + seed)

```sh
supabase db reset
```

This drops the local Postgres volume, replays
`migrations/0001_init.sql` and `0002_search_rpc.sql`, then loads
`seed.sql`. Use it whenever you change a migration or the seed.

### Serve the search Edge Function

```sh
supabase functions serve search --env-file .env.local
```

The function is then reachable at:

```
http://127.0.0.1:54321/functions/v1/search
```

### Serve both Edge Functions at once

```sh
supabase functions serve --env-file .env.local
```

---

## Smoke-test with curl

You'll need a JWT (the local anon key from `supabase status` works).

```sh
ANON_KEY=$(supabase status --output json | jq -r '.anon_key')

# Reference shortcut — should return mode: "reference" with bukhari:1.
curl -s -X POST http://127.0.0.1:54321/functions/v1/search \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"bukhari:1"}' | jq

# Free-text search (uses stub embedding when COHERE_API_KEY is unset).
curl -s -X POST http://127.0.0.1:54321/functions/v1/search \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"intention","topK":5}' | jq

# USC-MSA reference.
curl -s -X POST http://127.0.0.1:54321/functions/v1/search \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"Vol. 1, Book 1, Hadith 1"}' | jq

# Same query twice — second call should return mode: "cache".
curl -s -X POST http://127.0.0.1:54321/functions/v1/search \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"abu hurairah"}' | jq
```

### Feedback endpoint

```sh
QUERY_HASH=$(printf 'en||%sintention' "" | shasum -a 256 | awk '{print $1}')

curl -i -X POST http://127.0.0.1:54321/functions/v1/feedback \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query_hash\":\"$QUERY_HASH\",\"hadith_id\":\"bukhari:1\",\"position\":0,\"thumb\":\"up\"}"
# expect: HTTP/1.1 204 No Content
```

---

## What's NOT included yet

- Real corpus and embeddings (waiting on data dump).
- Arabic / Urdu seed rows (English only for v1).
- `00-data-schema.md` and `00-data-ingestion.md` plan files (added post-dump).
- Sentry SDK wiring inside the Edge Functions (tracked in
  `plan/03-analytics-monitoring.md`; currently `console.error` only).
- Rate limiting beyond Supabase's default per-JWT limit.
