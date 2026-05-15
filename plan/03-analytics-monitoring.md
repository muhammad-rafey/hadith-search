# 03 — Analytics & Error Monitoring

## Goal

Enough visibility to tune retrieval quality, catch regressions, and understand usage — **without leaking sensitive religious queries** to third parties. Errors must surface fast; raw query text never leaves the device for analytics purposes.

---

## Decisions

| Concern | Pick |
|---|---|
| Product analytics | **PostHog** (`posthog-js` on web; Edge Function fires server events) |
| Error tracking | **Sentry** — `@sentry/nextjs` on web, manual Sentry SDK in Deno on Edge Function |
| Uptime monitoring | **Better Stack** (or UptimeRobot) — 60 s canary hitting `/api/search` with a fixed query |
| Logs | Supabase Edge Function logs (built-in) + Vercel logs (built-in) |

Free tiers cover us until ~10k MAU.

---

## Privacy posture

1. **Raw query text is NEVER logged** to PostHog, Sentry, or any third party.
2. Queries are hashed (`SHA-256`) before any analytics event; the hash is used purely for dedup / cache lookup analysis.
3. In the database, `search_logs` stores the hash and metadata (mode, latency, filters) — also no raw text.
4. Aggregated zero-result queries are surfaced in a privileged dashboard (Supabase Studio with RLS-restricted view) for the product owner only. If raw text is needed for eval set building, it's user-volunteered via the thumbs-down feedback flow.
5. Settings has a **Private mode** toggle that disables the server-side `query_cache` write for that user's session (other layers — embed + rerank — still run, just not cached).
6. Privacy policy page on the web app explicitly states what's collected and what isn't.

---

## Event taxonomy (PostHog)

All events are fired from the web client unless noted. Properties listed below; no event carries raw query text.

| Event | Properties |
|---|---|
| `search_submitted` | `query_hash`, `query_length`, `language`, `has_book_filter`, `has_narrator_filter` |
| `search_results_returned` | `query_hash`, `result_count`, `mode` (cache/fresh/reference/empty), `latency_ms`, `degraded` (bool) |
| `search_result_clicked` | `query_hash`, `hadith_id`, `position`, `relevance` |
| `search_feedback_given` | `query_hash`, `hadith_id`, `position`, `thumb` ("up" / "down") |
| `hadith_viewed` | `hadith_id`, `source` ("search" / "browse" / "deeplink" / "bookmark") |
| `hadith_shared` | `hadith_id`, `method` ("link" / "native") |
| `bookmark_added` | `hadith_id` |
| `bookmark_removed` | `hadith_id` |
| `theme_changed` | `theme` ("light" / "dark" / "sepia") |
| `font_size_changed` | `step` (S/M/L) |
| `private_mode_toggled` | `enabled` (bool) |

User identification: PostHog distinct ID is set to the Supabase anonymous `auth.uid()` so anonymous-to-registered transitions don't lose history.

---

## Sentry wiring

### Web (`@sentry/nextjs`)

- Auto-instrumentation: errors, perf transactions, route changes.
- `tracesSampleRate: 0.1` in production, `1.0` in preview.
- Source maps uploaded via `@sentry/webpack-plugin` (built into `withSentryConfig`).
- Breadcrumbs include `query_hash`, NOT raw query text. Override default fetch breadcrumbs to redact request bodies for the search Edge Function endpoint.
- Custom tag `hadith_id` set on hadith detail pages so errors are bucketable by document.

```ts
// instrumentation-client.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeBreadcrumb(breadcrumb) {
    // Match only the actual Supabase Edge Function path, not any URL that happens
    // to contain "/search" (e.g., a future /settings/search page).
    const url = breadcrumb.data?.url;
    if (
      breadcrumb.category === "fetch" &&
      typeof url === "string" &&
      /\/functions\/v1\/search(?:[/?]|$)/.test(url)
    ) {
      if (breadcrumb.data) delete breadcrumb.data.body;
    }
    return breadcrumb;
  },
});
```

### Edge Function (Deno)

- Manual init via `npm:@sentry/deno` (or fallback to `console.error` + Supabase log scraping if SDK support is unstable).
- `try { ... } catch (e) { Sentry.captureException(e, { tags: { mode, language } }); throw e; }` around the full handler.
- Never include the raw query in error context — only `query_hash`.

---

## Database logging table

Already referenced by `01-search-api.md`. Reproduced here for completeness:

```sql
create table search_logs (
  id           bigserial primary key,
  user_id      uuid,
  query_hash   text not null,
  query_length int not null,
  mode         text not null,        -- 'reference' | 'cache' | 'fresh' | 'empty'
  language     text not null,
  result_count int not null,
  has_filter   bool not null,
  latency_ms   int not null,
  degraded     bool default false,
  created_at   timestamptz default now()
);
create index search_logs_created_idx on search_logs (created_at desc);
create index search_logs_hash_idx on search_logs (query_hash);
```

RLS: clients can `INSERT` their own rows; only service role can `SELECT`. Aggregate views (`zero_result_queries`, `top_queries`) are materialized via cron job, exposed read-only to admins.

---

## Dashboards to build

In PostHog:

1. **Search funnel:** `search_submitted` → `search_results_returned` → `search_result_clicked` → `hadith_viewed`. Track drop-off at each step.
2. **Mode distribution:** count of `search_results_returned` by `mode`. Target ≥ 50% `cache` after steady state.
3. **Latency:** p50/p95 of `search_results_returned.latency_ms`, by `mode`.
4. **Zero-result rate:** ratio of `mode = "empty"` to total searches. Target ≤ 5%.
5. **Click-through rate by position:** Position 1 should dominate after rerank tuning.
6. **Feedback signal:** ratio of `thumb="up"` to `thumb="down"` per week.
7. **Bookmark activity:** weekly bookmarks added/removed.

In Supabase (SQL):

- `top_zero_result_query_hashes` — for follow-up investigation against the user-volunteered raw queries from thumbs-down feedback.
- `daily_unique_users` — based on `search_logs.user_id`.

---

## Uptime canary

- Better Stack monitor every 60 s: `POST /functions/v1/search` with body `{ "query": "bukhari:1" }`.
- Expected: HTTP 200, response time < 1.5 s, response body contains `"mode":"reference"`.
- Alerts: email + push when 2 consecutive failures.
- Status page: published at `status.{domain}` so users see incidents in real time.

---

## Cost guardrails

- **Cohere monthly cap:** $50 initial, raise as MAU grows. Alert at 50%/75%/90%.
- **Supabase Spend Cap:** ON. Avoids runaway from an embedding loop bug.
- **PostHog free tier:** 1M events/month — plenty until ~50k MAU at our event volume.
- **Sentry free tier:** 5k errors/month — plenty until well past launch traffic.
- **Better Stack free:** 1 monitor at 60 s — sufficient for v1.

---

## Verification

1. Fire each event in dev → confirm it lands in PostHog with correct properties and **no raw query**.
2. Throw a deliberate error in `app/(app)/search/page.tsx` → confirm Sentry captures it with `query_hash` (not raw text) in breadcrumbs.
3. Throw a deliberate error in the Edge Function → confirm Sentry (or Supabase logs) captures it with hashed query.
4. Run the uptime canary manually → check it returns the expected reference hadith.
5. Toggle Private mode → confirm subsequent searches don't write to `query_cache` (verify in DB).
6. View Sentry breadcrumbs after a search → confirm the `fetch` breadcrumb for `/search` has no `body` field.
7. Pull `search_logs` for the last hour → verify no column contains plain-text query.

---

## Out of scope (this module)

- Detailed A/B testing framework (PostHog supports it; defer until there's something to test).
- User session recording — explicitly NOT enabled. Religious search is too sensitive.
- Heatmaps — same reason as session recording.
- Server-side rendering metrics beyond what Vercel provides natively.
