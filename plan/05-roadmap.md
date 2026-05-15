# 05 — Implementation Roadmap

## Goal

Sequence the work so the critical path is unblocked first, dependencies are visible, and a solo developer at ~15 hrs/week can ship a public web v1 in roughly two months.

---

## Critical path

```text
Phase 0 (setup) ──► Phase 1 (dump + schema) ──► Phase 2 (embedding) ──► Phase 3 (search API)
                            ▲                                                    │
                            │                                                    ▼
                            └─ User-provided dump ◄──────────────────── Phase 4 (web app v1)
                                                                                 │
                                                                                 ▼
                                                       Phase 5 (polish + monitoring)
                                                                                 │
                                                                                 ▼
                                                              Phase 6 (public launch v1.0)
                                                                                 │
                                                                                 ▼
                                                Phase 7+ (multilingual + more collections)
                                                                                 │
                                                                                 ▼
                                                          Phase 8 (mobile app — separate plan)
```

The single longest pole is **Sunnah.com permission** (an email + GitHub issue, replies take days to weeks). Start that in Phase 0 hour one; do not wait for it before doing other Phase 0 work.

---

## Phases

### Phase 0 — Setup & access (1 week, ~5–10 hrs)

- Open a GitHub issue on `sunnah-com/api` requesting API access (even if we're using a user-provided dump — keeps the door open).
- Email Sunnah.com asking explicit permission to ship Bukhari English (Muhsin Khan translation) bundled / served in a web app, with attribution.
- Create Supabase project (Free tier OK initially).
- Create Cohere account, generate API key, set $50 monthly cap alert.
- Create Sentry org, PostHog project, Better Stack monitor (stubbed).
- Create Vercel project (link to GitHub repo).
- Initialize pnpm workspace at repo root:
  ```text
  hadith-search/
  ├── apps/web/            (Next.js 15 app — scaffold only, no features yet)
  ├── apps/scripts/        (TS scripts placeholder)
  ├── packages/shared-types/  (Zod schemas, eventually shared with mobile)
  ├── supabase/            (CLI-linked project: migrations + functions)
  └── plan/                (already exists — these files)
  ```
- Install Supabase CLI, run `supabase init` and `supabase link`.
- Set up dev environment variables (`.env.local`, `.env.example` committed).
- Commit on branch `claude/semantic-search-bukhari-jRn62`.

**Deliverable:** Empty but wired scaffolding, all third-party accounts provisioned.

---

### Phase 1 — Receive dump & design schema (1 week, blocked on user)

**Blocker:** User delivers the data dump.

When it arrives:

1. Inspect the dump format (JSON shape, encoding, normalization status, presence of Arabic, narrator extraction, grading metadata, reference numbering schemes).
2. Write `plan/00-data-schema.md` documenting decisions.
3. Write `plan/00-data-ingestion.md` documenting the load script.
4. Create `supabase/migrations/0001_init.sql` with the `hadiths`, `hadith_embeddings`, `query_cache`, `search_logs`, `feedback` tables. Sketch in `01-search-api.md` becomes concrete.
5. Apply migration to Supabase, verify locally with `supabase db reset`.
6. Decide narrator normalization rules (build the ~50-entry synonym map by hand).

**Deliverable:** Migrations applied, schema documented, dump validated against schema.

---

### Phase 2 — Embedding & loading (1 week, ~10–15 hrs)

- Build `apps/scripts/ingest.ts`:
  - Reads dump from local file.
  - Normalizes (strips HTML, extracts narrator, computes `text_en_full`, `narrator_normalized`).
  - Upserts into `hadiths`.
  - Batches into Cohere `embed-v4` (96 docs / request, `inputType: "search_document"`, 1024-dim).
  - Resumable via checkpoint file (`.ingest-checkpoint.json`).
  - Upserts into `hadith_embeddings`.
- Run end-to-end for English Bukhari. Verify row counts match dump.
- Build the eval set: 50 hand-curated `(query, expected_hadith_id)` pairs covering reference / narrator / topical / paraphrase / transliteration / specific-term / negation / compound / numerical / vague categories (see `01-search-api.md` "Verification" for the smoke set).
- Test the SQL RPC `search_hadiths` via `psql` with sample inputs.

**Deliverable:** ~7,500 indexed hadiths with embeddings, eval set in `apps/scripts/eval/queries.json`, raw retrieval working from SQL.

**Cost:** ~$0.15 one-time embedding spend.

---

### Phase 3 — Search Edge Function (1 week, ~10–15 hrs)

Per `01-search-api.md`:

- Implement `supabase/functions/search/index.ts`: preprocess → cache check → embed → RPC → rerank → cache write → log.
- Deploy: `supabase functions deploy search`.
- Local test harness: `supabase functions serve search`, hit with eval set, compute recall@10 and MRR.
- Tune RRF `full_text_weight` / `semantic_weight` and HNSW `ef_search` against eval set. Target recall@10 ≥ 0.85 on the eval set.
- Set up Cohere kill switch (env var `RERANK_DISABLED=true` bypasses rerank).
- Wire Sentry (or `console.error` + Supabase log scraping if Deno SDK isn't yet stable).
- Build `/feedback` endpoint (thumbs up/down, anonymous OK, writes to `feedback` table).

**Deliverable:** `/functions/v1/search` live in staging, eval set recall@10 ≥ 0.85, p50 < 600 ms.

---

### Phase 4 — Next.js web app v1 (2–3 weeks, ~30–45 hrs)

Per `02-web-app.md`.

**Week A — scaffolding & browse (~15 hrs):**
- App Router structure, route groups, layout, shared shell.
- Anonymous sign-in on first load.
- Browse: books grid → chapter list → hadith list.
- Hadith detail page (Arabic + English, references, narrator chain, share, bookmark stub).
- Theming (light/dark/sepia), font setup, typography polish.

**Week B — search (~12 hrs):**
- Search page: input (debounced 250 ms), TanStack Query mutation against Edge Function, result list with highlight.
- Empty / error / zero-result states.
- Filter chips (book + narrator, Zustand-backed).
- Recent searches (localStorage).

**Week C — polish (~10 hrs):**
- Settings page (theme, font size, default Arabic display, private mode).
- Bookmarks page (localStorage v1).
- 404 / 500 pages.
- Sitemap, robots, OG images.

**Deliverable:** Vercel preview deploy of the app, all flows functional, Lighthouse Performance ≥ 90.

---

### Phase 5 — Polish & monitoring (1 week, ~10 hrs)

Per `03-analytics-monitoring.md`.

- Wire PostHog (web SDK) with the event taxonomy. Verify no raw query text leaves the device.
- Wire Sentry (`@sentry/nextjs`) — including the `beforeBreadcrumb` redaction for `/search`.
- Better Stack canary monitor live.
- Privacy policy page.
- Build the eval harness into CI: a GitHub Action runs the eval set against the staging Edge Function on every PR and fails if recall@10 drops by > 5%.
- Sensitivity check: imam / knowledgeable reviewer runs through 10–20 known-tricky queries.

**Deliverable:** Monitoring live, eval CI green, privacy policy published.

---

### Phase 6 — Public launch v1.0 (1 week)

- Production Vercel deploy on a real domain.
- Submit a brief explainer post (X / Reddit `r/islam` / personal blog) with the source attribution paragraph.
- Listen for feedback (in-app thumbs, GitHub issues, email).
- Daily for the first week: read PostHog dashboards, fix zero-result queries that surface.

**Deliverable:** Public web v1.0 launched, English Bukhari only.

---

### Phase 7 — Multilingual + more collections (3–6 weeks)

Each is roughly:
- Receive / source the data (Arabic Bukhari, Urdu Bukhari, English Muslim, ...).
- Re-run the ingestion script with the appropriate `--collection` and `--language` flags. Cohere embed-v4 handles all languages in one vector space — no model swap, no re-embedding of existing rows.
- UI: language toggle on hadith detail, RTL handling for Arabic, Urdu font load.
- Expand eval set with native-language queries.

Order suggestion (revisit with user once Phase 6 ships):
1. Bukhari Arabic (highest user demand alongside English).
2. Bukhari Urdu (large audience in South Asia).
3. Sahih Muslim English → then Arabic / Urdu.
4. Abu Dawud, Tirmidhi, Nasai, Ibn Majah, Muwatta — in user-priority order.

---

### Phase 8 — Mobile app (separate plan, not now)

Once the backend has stabilized through Phases 6–7 and we have ≥ 3 months of production data, plan and build the React Native / Expo app. The Edge Function and Supabase project are reused as-is. Will get its own `plan/06-mobile-app.md`.

---

## Time estimate (solo, ~15 hrs/week)

| Phase | Weeks | Cumulative |
|---|---|---|
| 0. Setup | 1 | 1 |
| 1. Dump + schema | 1 (blocked on user) | 2 |
| 2. Embedding & loading | 1 | 3 |
| 3. Search Edge Function | 1 | 4 |
| 4. Web app v1 | 2–3 | 6–7 |
| 5. Polish & monitoring | 1 | 7–8 |
| 6. Public launch | 1 | 8–9 |
| **MVP to public v1.0** | | **~8–9 weeks** |
| 7. Multilingual + collections | 3–6 | 11–15 |
| 8. Mobile app | TBD (separate plan) | — |

Multiply by ~0.6 if working full-time. Multiply by ~1.5–2 if weekends only.

---

## Open questions to resolve before Phase 2

- **Dump format.** JSON? SQL dump? CSV? What fields are present?
- **Translation provenance.** Confirmed Muhsin Khan? Saheeh International? Other?
- **Arabic included?** With or without diacritics?
- **Narrator extraction.** Pre-parsed in the dump, or do we parse `"Narrated X:"` ourselves?
- **Numbering schemes.** Sunnah.com + in-book + USC-MSA all present, or only one?
- **Grading metadata.** Present per hadith?
- **Sunnah.com permission status.** Allows bundling/serving the text? Required attribution wording?

These get resolved as soon as the dump arrives — none of the other phases can be finalized without them.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sunnah.com declines redistribution permission | medium | high | Fall back to live API per hadith view, or switch to a different translation (Saheeh International, Maulana Bhatti) |
| Dump format is incomplete (missing Arabic, narrators, grading) | medium | medium | Fill gaps from `fawazahmed0/hadith-api` (The Unlicense, public domain) during ingestion |
| Eval set recall@10 < 0.7 even after tuning | low | high | Increase rerank `topN`, add context concatenation (book/chapter prefix on embedding), try Voyage `voyage-3.5` as a secondary embed model |
| Cohere outage during launch | low | medium | Embedding fallback to OpenAI `text-embedding-3-small` behind a feature flag; rerank fallback is the raw RRF score |
| User search volume spikes 10× (viral moment) | low | medium | Cache hit rate scales naturally; Supabase compute can be bumped via dashboard; Cohere has burst capacity |
| Sensitive query handling complaint | medium | high | Privacy policy explicit; private mode toggle; aggregated-only analytics; no LLM commentary in v1 |
