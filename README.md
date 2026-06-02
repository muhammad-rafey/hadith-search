# Hadith Search

Semantic search over Sahih al-Bukhari (English + Arabic), with hybrid BM25 + vector retrieval and cross-encoder reranking. A Next.js web app and an Expo mobile app share one backend.

> **This README is partly historical.** The real corpus is loaded, the live backend is the Next.js `/api/*` BFF (the Supabase Edge Functions have been retired and removed), and the Expo mobile app exists today. Trust the code (and `CLAUDE.md`) over the historical bits below.

See the full architecture and roadmap in [`plan/`](./plan/README.md).

## Repository layout

```text
hadith-search/
├── apps/
│   ├── web/                Next.js 15 (App Router) web app + the shared /api/* backend (BFF)
│   └── mobile/             Expo mobile app (calls the web app's /api/*)
├── packages/
│   └── shared-types/       Zod schemas shared between the web app, mobile app, and the BFF API routes
├── supabase/
│   ├── config.toml
│   ├── migrations/         Postgres schema (pgvector + hybrid search RPCs)
│   └── seed.sql            10 mock hadiths for local `supabase db reset` dev
├── plan/                   Architectural plans (partly historical; useful for the *why*)
└── .github/workflows/      CI
```

## Quick start

### Prerequisites

- Node.js ≥ 20.19.4
- pnpm 10.x (`corepack enable && corepack prepare pnpm@10 --activate`)
- Supabase CLI (`brew install supabase/tap/supabase` or [other install methods](https://supabase.com/docs/guides/local-development/cli/getting-started))
- Docker (for `supabase start`)

### Setup

```bash
git clone https://github.com/muhammad-rafey/hadith-search.git
cd hadith-search
pnpm install
cp .env.example .env.local
# fill in real values in .env.local — see comments in .env.example
```

### Run locally

```bash
# Web app + the /api/* backend (BFF) — this serves both the UI and the API
pnpm dev                      # opens http://localhost:3000

# Optional: local Supabase (Postgres + Studio) for offline dev
supabase start
supabase db reset             # applies migrations + seeds 10 mock hadiths
```

### Useful commands

```bash
pnpm build         # build all packages
pnpm typecheck     # typecheck all packages
pnpm lint          # lint all packages
pnpm format        # format with Biome
```

## Status

The real corpus is **loaded**. The production `hadith_table` holds ~45k rows across 15 collections;
today only Sahih al-Bukhari (~7,277 rows) is embedded and exposed by search. The 10 mock hadiths
are now just the local `supabase db reset` seed for offline dev — not the production corpus.

Search runs as a hybrid pipeline: bilingual (English + Arabic) FTS + pgvector, fused by Reciprocal
Rank Fusion, then a cross-encoder rerank (Cohere or a local BGE-M3 server, selected by
`EMBED_PROVIDER`); embeddings are 1024-dim.

A couple of things still depend on user-provided inputs:

1. **Sunnah.com permission.** Required before bundling/serving the canonical translation.
2. **Third-party credentials.** Cohere API key, real Supabase project, Sentry DSN, PostHog key.

With placeholder `.env.local` values everything still compiles and runs end-to-end in degraded mode
against local Supabase.

## License

The application code in this repository is the author's; the hadith text data has its own licensing chain documented in `plan/05-roadmap.md` and the in-app About page.
