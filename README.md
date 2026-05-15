# Hadith Search

Semantic search over Sahih al-Bukhari (English + Arabic), with hybrid BM25 + vector retrieval and cross-encoder reranking. Web app first; mobile app planned for later.

See the full architecture and roadmap in [`plan/`](./plan/README.md).

## Repository layout

```text
hadith-search/
├── apps/
│   └── web/                Next.js 15 (App Router) web app
├── packages/
│   └── shared-types/       Zod schemas shared between web and Edge Function
├── supabase/
│   ├── config.toml
│   ├── migrations/         Postgres schema (placeholder until real dump)
│   ├── functions/
│   │   └── search/         Hybrid search + Cohere rerank Edge Function
│   └── seed.sql            10 sample hadiths for local dev
├── plan/                   Architectural plans (source of truth)
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
# Terminal 1: Supabase (Postgres + Studio + Edge Functions runtime)
supabase start
supabase db reset             # applies migrations + seed
supabase functions serve search

# Terminal 2: Web app
pnpm dev                      # opens http://localhost:3000
```

### Useful commands

```bash
pnpm build         # build all packages
pnpm typecheck     # typecheck all packages
pnpm lint          # lint all packages
pnpm format        # format with Biome
```

## Status

This is **scaffolded** with placeholder schema and 10 sample hadiths. The real corpus
ships once the data dump arrives — see `plan/05-roadmap.md` Phase 1.

Three things are blocked on user-provided inputs:

1. **Data dump.** Phase 1 (real schema design + migrations) waits on the dump.
2. **Sunnah.com permission.** Required before bundling/serving the canonical translation.
3. **Third-party credentials.** Cohere API key, real Supabase project, Sentry DSN, PostHog key.

Until those land, `.env.local` placeholders + the seed corpus let everything compile and run end-to-end against local Supabase.

## License

The application code in this repository is the author's; the hadith text data has its own licensing chain documented in `plan/05-roadmap.md` and the in-app About page.
