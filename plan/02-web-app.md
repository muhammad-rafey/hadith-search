# 02 — Web App (Next.js 15 App Router)

## Goal

A fast, accessible, SEO-friendly web app at (proposed) `https://hadithapp.tld` that lets users search Sahih al-Bukhari semantically, browse by book/chapter, and read individual hadiths with full Arabic + English + references. Designed so the future mobile app can reuse the same Supabase backend without changes.

---

## Decisions

| Concern | Pick | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router)** + TypeScript strict | Server Components for SEO; matches user's existing stack |
| Styling | **Tailwind v4** | Fast iteration, low-runtime |
| UI primitives | **shadcn/ui** (copy-paste, Radix-based) | Ownable components, no vendor lock-in |
| Server state | **TanStack Query v5** | Standard for React data fetching |
| Client UI state | **Zustand** | Tiny, ergonomic; for filter chips, recent searches |
| Forms | **React Hook Form** + **Zod** | Schema validation shared with server |
| Supabase | `@supabase/ssr` (SSR-safe client) | Server Components + Server Actions |
| Icons | `lucide-react` | Tree-shaken |
| Theming | `next-themes` | Light / dark / sepia |
| Fonts | `next/font` — Inter (UI), Amiri or KFGQPC Uthman Taha Naskh (Arabic) | Self-hosted, no FOUT |
| i18n | Scaffold with `next-intl` (not enabled at launch) | Arabic + Urdu in Phase 7+ |
| Analytics | `posthog-js` (browser SDK) | See `03-analytics-monitoring.md` |
| Error tracking | `@sentry/nextjs` | Standard |
| Deployment | **Vercel** | Native Next.js host; preview URLs per PR |

---

## Routing tree

```text
app/
├── (marketing)/
│   ├── layout.tsx                 minimal shell, no auth
│   └── page.tsx                   landing / explainer
├── (app)/
│   ├── layout.tsx                 shared app shell, auth bootstrap (anon sign-in),
│   │                              top nav, theme toggle, language switcher (stub)
│   ├── search/
│   │   └── page.tsx               search box + results + filter chips
│   ├── browse/
│   │   ├── page.tsx               97 books grid
│   │   └── [book]/
│   │       ├── page.tsx           chapter list for the book
│   │       └── [chapter]/
│   │           └── page.tsx       hadiths in this chapter
│   ├── hadith/
│   │   └── [id]/
│   │       └── page.tsx           detail: Arabic + English, refs, share, bookmark
│   ├── bookmarks/
│   │   └── page.tsx               user bookmarks (localStorage v1, Supabase later)
│   └── settings/
│       └── page.tsx               theme, font size, default Arabic display, privacy
├── api/
│   └── search/
│       └── route.ts               OPTIONAL: thin proxy to Edge Function (CORS/edge cache);
│                                  client can also hit Supabase directly
├── opengraph-image.tsx            default OG image
├── sitemap.ts                     dynamic: marketing + every hadith id
├── robots.ts
├── layout.tsx                     root html, font setup
└── globals.css                    Tailwind base + custom CSS variables for themes
```

Route groups:
- `(marketing)` for the public landing — no auth bootstrap, lighter shell.
- `(app)` for the actual product — anonymous sign-in fires on mount.

---

## Server vs client components

**Default: Server Components.** They handle:
- Hadith detail page (fetches via Supabase server client, fully SSR for SEO).
- Browse pages (book/chapter lists are static-ish, cache aggressively).
- Marketing landing.

**`"use client"` only where needed:**
- `<SearchBox />` (input state, debounced mutation).
- `<SearchResults />` (client-side highlight rendering on user-typed query).
- `<BookmarkButton />` (writes to localStorage / Supabase).
- `<ThemeToggle />`, `<FontSizeControl />`.
- Filter chips on search page (Zustand-backed).

Rule of thumb: a component is a Client Component only if it owns state, event handlers, or browser-only APIs.

---

## Data fetching

| Surface | How |
|---|---|
| Hadith detail page | Server Component fetches directly from Supabase via `@supabase/ssr` server client. Cached via `revalidate: 3600`. |
| Browse pages | Server Component, same; lists are stable, cache 1 day. |
| Search | Client Component fires TanStack Query mutation → Edge Function `/functions/v1/search`. No SSR (queries are personal). |
| Bookmarks | Server Component reads from Supabase (after auth); falls back to localStorage when anonymous. |

Mutation hook sketch:

```ts
// app/(app)/search/use-search.ts
"use client";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export function useSearch() {
  return useMutation({
    mutationKey: ["search"],
    mutationFn: async (vars: SearchRequest) => {
      const { data, error } = await supabase.functions.invoke("search", { body: vars });
      if (error) throw error;
      return data as SearchResponse;
    },
  });
}
```

---

## SEO

- Each hadith detail page renders fully on the server with:
  - `<title>` = `Sahih al-Bukhari {n}: {chapter_title_en}`
  - Meta description = first ~150 chars of body
  - OG image = generated (`opengraph-image.tsx`) showing reference + first line
  - JSON-LD `Article` with `author` = narrator, `publisher` = "Sunnah.com (translation by Muhsin Khan)" — only if Sunnah.com permission allows
- `sitemap.ts` enumerates all `/hadith/{id}` URLs from Supabase.
- Canonical link points to our URL but with a `<link rel="alternate" href="https://sunnah.com/bukhari:{n}" />` for attribution.

---

## Accessibility

- All interactive elements reachable by keyboard (Tab, Enter, Escape on modals).
- Search input: `<label>` (visually hidden if needed), `aria-busy` while loading, `aria-live="polite"` region for result count.
- Hadith body: semantic `<article>`, narrator wrapped in `<cite>`, reference in `<footer>`.
- Color contrast WCAG AA across light, dark, sepia themes.
- Arabic text: `dir="rtl"` per-element, never global flip.
- Skip-to-content link in `(app)/layout.tsx`.

---

## Typography & theming

- UI font: Inter via `next/font/google`, subset latin only.
- Arabic font: `Amiri-Regular` (SIL OFL, classical) OR `KFGQPC-Uthman-Taha-Naskh` (Mushaf-style). Bundled, loaded via `next/font/local`.
- Body text: 18 px default, 1.65 line-height, max-width ~70ch.
- Themes: `light`, `dark`, `sepia` (warm paper-like for long reading). `next-themes` with `attribute="class"` and CSS variables.
- Font size control: 3 steps (S/M/L), persisted to localStorage.

---

## Result highlighting

v1 (cheap, ship it):
- Split user query into tokens, normalize (lowercase, strip diacritics).
- Regex-highlight matches in `text_en_full` via `<mark>`.
- Misses purely semantic matches — acceptable.

v2 (post-launch):
- Edge Function returns `highlight_offsets` derived from `ts_headline()`.
- Client renders offsets — handles stems and phrase matches.

---

## Internationalization scaffolding

Don't enable `next-intl` at launch, but structure code so it's a one-week addition:

- All UI strings live in `lib/strings/en.ts` (a flat object).
- Component `Text` wrapper reads from a context that defaults to English.
- Route shape ready for `/{locale}/...` redirect later.
- Arabic detail content is in the DB, not the i18n bundle.

---

## Auth

- Supabase anonymous sign-in on first load (`supabase.auth.signInAnonymously()`).
- JWT stored in cookies via `@supabase/ssr`.
- No sign-up wall at launch.
- Bookmarks: localStorage for anonymous, Supabase row when user upgrades to email/Apple/Google later.

### Bookmark migration on auth upgrade

When an anonymous user signs in with a real provider:

1. Detect the upgrade in the auth state listener (anonymous JWT → authenticated JWT for the same `auth.uid()` — Supabase preserves the UID across the upgrade, so existing rows tied to that UID persist automatically).
2. For bookmarks held only in localStorage (created before the upgrade or while offline): read all entries, dedupe by `hadith_id`, and on conflict prefer the newer `updated_at`.
3. Write the merged set in a single batched `upsert` to the `bookmarks` table, then mark a `bookmarks_migrated_at` flag on the user's profile row to make the migration idempotent.
4. On network failure: leave localStorage intact, surface a non-blocking toast with a manual retry, and re-attempt on next app load.
5. Migration runs automatically — no user prompt — since bookmarks are non-destructive metadata.

---

## Deployment

- Vercel project linked to the GitHub repo, branch `main` = production, PR branches = preview URLs.
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`.
- Edge runtime for API routes where possible; default Node for `/api/search` proxy.

**Key boundary (do not blur):**
- **Anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) — safe in the browser bundle. Used by `@supabase/ssr` for SSR hadith detail / browse / bookmarks reads — RLS enforces row visibility.
- **Service role key** (`SUPABASE_SERVICE_ROLE_KEY`) — server-only, never imported into a Client Component. Used exclusively by the search Edge Function for `search_hadiths` RPC, `query_cache` writes, and `search_logs` analytics inserts (these need to bypass RLS or run with elevated privilege). If a Next.js API route ever needs the service role, mark the file with `import "server-only"` so a stray client import fails the build.

---

## Verification

1. `pnpm dev`, walk through: landing → search → click result → hadith detail → bookmark → bookmarks page.
2. Lighthouse on `/hadith/1`: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95.
3. View source on `/hadith/1` — body text present in initial HTML (SSR working).
4. Keyboard-only navigation across all interactive elements.
5. Screen reader (VoiceOver / NVDA) reads narrator + body coherently.
6. Theme toggle persists across reloads.
7. Search input debounce verified (no request fires until 250 ms idle).
8. Network tab: same query twice within 5 min, second call returns from TanStack cache (no network).
9. RTL spot check: insert a temporary Arabic block on `/hadith/1`, confirm `dir="rtl"` applies only to that block.
10. Production preview deploy on Vercel green; PostHog + Sentry receive events from the preview.

---

## Out of scope (this module)

- Audio recitation playback.
- AI-generated commentary or summaries.
- Social sharing beyond a "copy link" + native share.
- Account dashboards beyond bookmarks + settings.
- Admin / moderation UI — not needed for static corpus.
