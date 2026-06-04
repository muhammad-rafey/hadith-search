# Production-Readiness Review — 2026-06-04

A full-repo audit for the first public launch, run as **7 parallel review agents**
(backend pipeline, web frontend, mobile, data/SQL, dependencies/CI, cross-cutting
security, + the freshly-merged PR #10 delta) and corroborated against the **live**
Supabase project (security/performance advisors, deployed-migration state) and a
green CI-parity build.

> Scope note: the immediate launch target is the **web app on Vercel**. The mobile
> (Expo) app is a *separate* launch that still needs the items in
> [§7 Mobile](#7-mobile--pre-store-submission) before store submission.

## Verdict

The codebase is **well-engineered and close to launch-ready**. The backend is
unusually defensive (every external call has an AbortController timeout; graceful
degraded mode; Zod re-validation at every trust boundary; no SQL injection — all
RPC args are parameter-bound). The audit found **no critical exploitable
vulnerability** (no RCE, no secret leak, no auth bypass, no IDOR). The one
genuinely launch-blocking gap — **missing HTTP security headers** — is fixed in
this branch. What remains before go-live is mostly **operational**: deploy the
staged DB-hardening migrations, set production env vars, and decide how far to
take the dependency upgrades.

Baseline on this branch: `format:check` ✅ · `lint` ✅ · `typecheck` ✅ · `build` ✅.

---

## 1. Fixes applied in this branch (`claude/jolly-goldberg-pI4dL`)

| # | Fix | Files | Was |
|---|-----|-------|-----|
| 1 | **HTTP security headers** — CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` on every route | `apps/web/next.config.ts` | CRITICAL (3 agents) |
| 2 | **Numeric-env hardening** — `numEnv()` helper: a blank/non-numeric env var no longer becomes `NaN` (which silently disabled the `MIN_RELEVANCE` floor, threw on cache writes, or 429'd every request) | new `apps/web/lib/server/env.ts` + `search-pipeline.ts`, `cohere.ts`, `rate-limit.ts`, `lru-cache.ts`, `hadiths.ts` | HIGH |
| 3 | **PostHog privacy leak** — `sanitize_properties` strips the query string (the search box navigates to `/search?q=<raw query>`) from `$current_url`/`$referrer` so raw queries never reach PostHog | `apps/web/components/providers.tsx` | HIGH |
| 4 | **Error text reflected in DOM** — search errors now show a generic message (raw detail only in dev) | `apps/web/components/result-list.tsx` | HIGH |
| 5 | **`/api/health` info leak** — raw DB/PostgREST error string no longer returned to anonymous callers (logged server-side instead) | `apps/web/app/api/health/route.ts` | MEDIUM |
| 6 | **Body-size guards** — `content-length` pre-check on `/api/search` (16 KB) and `/api/feedback` (8 KB) before `req.json()` | `search/route.ts`, `feedback/route.ts` | MEDIUM |
| 7 | **Duplicate `aria-live` region** — removed the second live region that double-announced every search to screen readers | `apps/web/components/result-list.tsx` | MEDIUM (a11y) |
| 8 | **Destructive loader made atomic** — `load_chunks.mjs` now wraps TRUNCATE+INSERT in a transaction, refuses to cascade-delete a non-empty `hadith_embeddings` without `--force`, and sanity-checks the row count before COMMIT | `scripts/load_chunks.mjs` | HIGH (data-loss) |
| 9 | **CI: dependency auditing** — `.github/dependabot.yml` (weekly, grouped) + a `pnpm audit` step | `.github/dependabot.yml`, `.github/workflows/ci.yml` | HIGH |
| 10 | **Stale copy** — "remove a filter" empty-state text (filters were removed in PR #10) | `apps/web/components/result-list.tsx` | MEDIUM |

> ⚠️ **CSP caveat (read before prod):** the Content-Security-Policy is enforcing and
> allowlists `'self'` + Supabase + PostHog + Sentry, with `'unsafe-inline'` for
> script/style (Next.js + next-themes + Tailwind inject inline). It was **not** testable
> against the live third-party scripts here. **Smoke-test it on a Vercel preview
> deploy** (open the console, run a search, confirm PostHog/Sentry/Supabase calls
> aren't blocked). If anything is blocked, switch the header key to
> `Content-Security-Policy-Report-Only` temporarily, fix the allowlist, then re-enforce.

---

## 2. Live infrastructure (from Supabase MCP)

Project `HadithSearch` (`zxfsqprzoremabtgqfer`, ap-northeast-1, Postgres 17, ACTIVE_HEALTHY).

### 2a. Deployed migrations — **0013, 0014, 0015 are NOT deployed**
The live DB has `…0012 review_followups`, the scaffold cleanup, **and** `0016` +
`harden_collection_browse_rpcs`, but **not** `0013` (Arabic FTS index), `0014`
(bilingual `search_bukhari_hybrid`), or `0015` (search_path hardening). So today
the live search is the **English-only** `0010` function and **Arabic semantic/FTS
recall is weak**. (Note: this corrects an audit assumption — `0012` *is* live, so
feedback upserts work.)

### 2b. Security advisors (corroborate the audit)
- `function_search_path_mutable` (WARN) on `search_bukhari_hybrid`,
  `get_bukhari_hadith_by_urn`, `get_bukhari_book_hadiths`,
  `get_bukhari_hadith_by_number`, `get_bukhari_book_list` → **fixed by the
  undeployed 0015**.
- `anon`/`authenticated` can execute `SECURITY DEFINER` funcs
  `get_bukhari_hadith_by_book_seq`, `get_bukhari_hadith_ids` → **0015 switches both
  to `SECURITY INVOKER`**.
- `rls_enabled_no_policy` (INFO) on `feedback`/`query_cache`/`search_logs` →
  **intentional** (service-role-only writes; verified fail-closed for anon).
- `extension_in_public` (WARN) on `vector`, `pg_trgm` → Supabase default; low-risk,
  optional follow-up.

### 2c. Performance advisors
- `auth_rls_initplan` (WARN) on all three `bookmarks` policies — they call
  `auth.uid()` un-wrapped, re-evaluated per row. **Easy win:** replace with
  `(select auth.uid())`. (Ships as a small migration; see §3.)
- `unindexed_foreign_keys` (INFO): `bookmarks.hadith_id` has no covering index.
- `unused_index` (INFO) ×4 — expected at low traffic; don't drop pre-launch.

---

## 3. Pending DB migration deploy plan (decision required — touches prod)

Deploy **0013 → 0014 → 0015** together, in order, before/at launch:

1. **Pre-flight:** snapshot; confirm recorded history (the live DB was hand-built and
   doesn't match files 1:1).
2. **0013** Arabic `'simple'` GIN index. On a ~7k-row table a plain `CREATE INDEX` is
   fine; use `CONCURRENTLY` (outside a txn) if you want zero write-lock.
3. **0014** recreates `search_bukhari_hybrid` (bilingual EN+AR). **Action:** add
   `SET search_path = pg_catalog, public` (+ explicit `SECURITY INVOKER`) *directly*
   to 0014's `CREATE OR REPLACE` so the function is never momentarily un-pinned even
   on a partial deploy (otherwise it relies on 0015 landing immediately after).
4. **0015** pins `search_path` + flips the two DEFINER funcs to INVOKER (idempotent
   backstop).
5. **Don't** let queries hit the new bilingual function before 0013's index exists,
   or the Arabic predicate seq-scans → statement timeout. Deploying in order avoids
   this.
6. **Post-deploy:** re-run the security advisor (expect the WARNs cleared), smoke-test
   an Arabic query + `/api/feedback`, then **regenerate `database.types.ts`** (it's
   missing the four `0016` collection RPCs; harmless only because the admin client is
   untyped).
7. **Optional same-batch win:** a tiny migration rewriting the `bookmarks` RLS
   policies to `(select auth.uid())` (perf advisor 2c).

---

## 4. Security — remaining items (none block web launch by themselves)

- **[Decision] Unauthenticated writes** to `feedback`/`search_logs` (by-design
  "anonymous-friendly"). No data disclosure / no cross-user write (`user_id` is
  server-derived from a *verified* JWT). Hardening: require a valid anon JWT on
  `/api/feedback`, add a `search_logs` retention job. — `app/api/feedback/route.ts`
- **[Decision] Rate-limiter fail-open** to a single `"unknown"` bucket on any
  **non-Vercel** host (no `x-vercel-forwarded-for`/`x-real-ip` and `TRUSTED_PROXY`
  off). **On Vercel this is fine** (the platform header is set and unspoofable). If
  you ever self-host, set `TRUSTED_PROXY=true` behind a proxy that strips inbound
  XFF. — `lib/server/rate-limit.ts`
- **Verified safe (not issues):** no SQL injection; XSS mitigated (React-fragment
  highlighting; the one `dangerouslySetInnerHTML` is `<`-escaped JSON-LD); the
  Sentry body-scrub correctly matches `/api/(search|feedback)`; service-role key is
  `server-only` and never bundled; `.env.example` holds placeholders only; BGE/Cohere
  outbound URLs are env-only (no user-driven SSRF); reference-parser/clean regexes are
  ReDoS-safe; bookmarks RLS is `auth.uid()`-scoped (no IDOR).

---

## 5. Dependencies (decision required: how aggressive?)

`next@16.2.7` is current (the May-2026 security release; verify the live Vercel deploy
is on it). Notable gaps:

| Package | Current | Latest | Jump | Safe now? |
|---|---|---|---|---|
| `@supabase/ssr` | 0.5.2 | 0.10.x | minor | yes (review cookie API) |
| `@supabase/supabase-js` | ~2.105 | ~2.107 | patch | yes |
| `@tanstack/react-query` | 5.100 | 5.101 | patch | yes |
| `zustand` | 5.0.13 | 5.0.14 | patch | yes |
| `pnpm` (packageManager) | 10.0.0 | 10.26 | patch | yes (trivial) |
| `cohere-ai` | 7.21 | 8.0 | **major** | needs wrapper audit (`lib/server/cohere.ts`) |
| `zod` | 3.25 | 4.x | **major** | coordinated across all 3 packages + `@hookform/resolvers` |
| `lucide-react(-native)` | 0.468 | 1.x | **major** | icon-rename audit |
| `@sentry/react-native` | 7.2 | 8.x | **major** | needs Xcode 16.4+; before store submit |
| `@biomejs/biome` | 1.9 | 2.x | **major** | `biome migrate`, new rules |
| `typescript` | 5.9 | 6.0 | **major** | re-typecheck |
| `expo` / `react-native` | SDK 54 / 0.81 | SDK 56 / 0.85 | **2 majors** | post-launch; New-Arch migration |

**Recommended order:** (1) safe patch/minor bumps now; (2) `cohere-ai` 8 + `lucide` 1
+ TS 6 with testing; (3) `zod` 4 + Biome 2 (coordinated); (4) Expo 56 as a post-launch
milestone (would require relaxing the deliberate React-19.1 pin).

---

## 6. Tooling / CI (added + recommended)

- ✅ Added Dependabot + `pnpm audit`.
- **No test suite** (the repo has no test runner). CI only builds against *mock* data
  (placeholder Supabase env → `MOCK_HADITHS`), so `runSearch()`, the rate limiter, and
  the Zod contracts are never exercised. **Strongly recommend** a small Vitest suite:
  `search-pipeline` degraded-mode/cache/ratelimit, `shared-types` map/clean, an API
  smoke test against the local Supabase stack.
- Recommend: CodeQL workflow; `apps/mobile/tsconfig.json` add `verbatimModuleSyntax`;
  `packages/shared-types/tsconfig.json` drop vestigial `outDir`/`declaration`; bump
  `packageManager` to `pnpm@10.26`.

---

## 7. Mobile — pre-store-submission (not web-blocking)

1. **Register the `@sentry/react-native` Expo config plugin** in `app.config.ts` —
   without it, native crashes are silently dropped.
2. **Add `EXPO_PUBLIC_POSTHOG_KEY`** to the EAS profiles — analytics is dead in every
   built binary today.
3. **Move secrets out of `eas.json`** to EAS Secrets and **rotate the Sentry DSN**
   (it's in git history). The Supabase anon key is publishable but shouldn't be in
   source.
4. **`StatusBar style="light"` is hardcoded** (`app/_layout.tsx`) — wrong contrast on
   the dark theme and over light backgrounds during transitions. Make it theme-aware
   (entangled with the new `StatusBarStrip`; verify on a device).
5. **Offline detection** uses a brittle `/network|fetch/` regex; `@react-native-community/netinfo`
   is installed but unused — wire `useNetInfo()` or soften the copy.
6. **Safe-area insets** missing on the collection-picker modal, browse list, and detail
   scroll (content clipped under the home indicator on iPhone X+).
7. **Baseline `ios.buildNumber`/`android.versionCode`**, bookmark-store `migrate` fn,
   pin `@react-navigation/bottom-tabs` to the Expo-endorsed version, dark-theme splash
   color, remove unused `react-hook-form`/`@hookform/resolvers`.

---

## 8. Web go-live checklist

- [ ] Set Vercel env: `NEXT_PUBLIC_SITE_URL` (**required** — falls back to the ephemeral
      `VERCEL_URL` for canonical/sitemap/OG otherwise), `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `COHERE_API_KEY`,
      Sentry + PostHog keys. Keep `TRUSTED_PROXY` unset.
- [ ] Deploy migrations 0013→0015 (§3) and re-check advisors.
- [ ] Smoke-test the CSP on a preview deploy (§1 caveat).
- [ ] Confirm the production deploy is on `next@16.2.7`.
- [ ] (Recommended) add a minimal Vitest suite before the next refactor.

_Deferred (non-blocking) frontend polish: AbortController on rapid-typing search,
font-size CLS inline script, root/search/browse OG image, PostHog anon-UUID `identify`
review, JSON-LD `author` field._
