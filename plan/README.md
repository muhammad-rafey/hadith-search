# Plans — Hadith Semantic Search (Web First)

This folder holds the module-by-module plans for building a semantic search engine over Sahih al-Bukhari (and later other collections) — **web app first**, mobile app later once the backend has proven itself.

If you're new to the project, read this file end-to-end, then jump to whichever module you're working on.

---

## What we're building

A search experience over the canonical English translation (Dr. Muhsin Khan / Darussalam) and Arabic original of Sahih al-Bukhari, with hybrid (semantic + keyword) retrieval and cross-encoder reranking. Users can:

- Search in natural language ("washing before prayer", "abu hurairah and the cat", "riba")
- Search by reference ("bukhari:1", "Book 56, Hadith 7")
- Browse by book / chapter
- Open a hadith and see Arabic + English with full reference and source link
- Bookmark hadiths

Out of scope for v1: AI-generated commentary, full-text scholarly commentaries, audio recitation, social features.

---

## TL;DR architecture

| Layer | Pick | Why |
|---|---|---|
| Web client | **Next.js 15 (App Router)** + TypeScript | Server Components for SEO, RSC for data fetching, easy Vercel deploy |
| Styling | **Tailwind v4** + shadcn/ui | Fast iteration, ownable components |
| Client state | **TanStack Query v5** + **Zustand** | Server cache vs ephemeral UI state, clean split |
| Auth | **Supabase Auth** (anonymous first) | Stable per-device identity without a sign-up wall |
| Backend | **Supabase Edge Functions** (Deno) | Co-located with Postgres, single platform, sub-100 ms cold starts |
| DB + Vector | **Supabase Postgres** with **pgvector** (`halfvec(1024)` + HNSW) + `tsvector` for FTS | One platform, native hybrid via RRF, plenty of headroom at our scale |
| Embedding | **Cohere `embed-v4.0`** (1024-dim, Matryoshka) | Multilingual from day one (Arabic, Urdu later) without re-embedding |
| Reranker | **Cohere Rerank 4.0** (`rerank-v4.0-pro`) | Multilingual cross-encoder; recovers proper-noun precision |
| Caching | Postgres `query_cache` (7-day TTL) + Edge isolate LRU + client TanStack Query | Religious search is bursty; cache hits dominate cost |
| Analytics | **PostHog** + **Sentry** | Privacy-aware: hash queries, never log raw text |
| Hosting | **Vercel** for web; **Supabase** for backend | Standard, cheap at the scale we care about |

### Three architectural anchors (do not skip)

1. **Cloud-side embedding & search.** No on-device models. Older phones (when mobile lands) can't run multilingual embedding models well, and cloud lets us iterate on retrieval without app updates.
2. **Cohere embed-v4 + Rerank 4.0 from day one.** Multilingual support is locked in cheaply; switching embedding models later means re-embedding everything.
3. **Hybrid retrieval (BM25 + vector) fused with RRF, then cross-encoder rerank.** Hadith corpora live or die on proper-noun handling (Abu Hurairah / Aishah / ʿUmar transliterations); pure vector search is not enough.

---

## Pending decisions (waiting on inputs)

| Decision | Blocked on | Captured where |
|---|---|---|
| Data ingestion pipeline | User-provided data dump | not yet planned — added after dump arrives |
| Database schema | Dump format | not yet planned — designed against the dump |
| Sunnah.com licensing footprint | Email/GitHub reply from Sunnah.com | tracked in `05-roadmap.md` Phase 0 |
| Multilingual launch order (Arabic? Urdu first?) | User priority | tracked in `05-roadmap.md` Phase 7+ |

Once the dump is delivered, two new files will be added: `00-data-schema.md` and `00-data-ingestion.md` (numbered `00-` so they sit above the runtime modules in the file listing, since they're foundational).

---

## Module index

| File | Module |
|---|---|
| [`01-search-api.md`](./01-search-api.md) | Supabase Edge Function `/search` — hybrid retrieval + Cohere rerank, caching, rate limiting |
| [`02-web-app.md`](./02-web-app.md) | Next.js 15 App Router web app — routing, search/browse/detail UI, theming, i18n scaffolding |
| [`03-analytics-monitoring.md`](./03-analytics-monitoring.md) | PostHog event taxonomy, Sentry wiring, privacy posture, uptime canary |
| [`04-cost-projections.md`](./04-cost-projections.md) | Monthly cost at 100 / 1k / 10k / 100k users, cost levers, spend caps |
| [`05-roadmap.md`](./05-roadmap.md) | Phase-by-phase sequencing with time estimates, dependencies, critical path |

---

## How to use these plans

- These are living documents. Update in place as decisions change; commit on the feature branch with the change.
- Each module file has a **Verification** section — that's the bar for "this module is done."
- If a decision in a module file contradicts the TL;DR above, fix the module file. The README is the source of truth for stack-level choices; module files own implementation detail.
- When implementation starts, the module files become a checklist; don't delete them after shipping — they document the *why*.

---

## What is NOT in these plans (yet)

- Mobile app (React Native / Expo) — deferred until the backend has stabilized.
- Data ingestion script — deferred until dump arrives.
- DB schema and migrations — deferred until dump arrives.
- Audio recitation, scholarly commentary linking, social features.
- Monetization strategy.

Once the backend is up and the web app is live, the mobile plan will be added.
