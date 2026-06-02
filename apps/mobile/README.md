# @hadith/mobile

Expo / React Native companion to the web app. Full feature parity: semantic
search, browse by book, hadith detail (Arabic + English + references),
bookmarks, settings (theme / font size / Arabic / private mode).

It talks to the web app's Next.js BFF — every request goes to
`${EXPO_PUBLIC_API_URL}/api/*` (the `apps/web` routes), sharing the
`@hadith/shared-types` contract, so nothing server-side changes. Search hits
the web app's Next.js `/api/search` route (apps/web). The mobile app always
needs a reachable `EXPO_PUBLIC_API_URL`; it has no offline mode of its own.

## Quick start

```bash
# from the repo root
pnpm install
pnpm --filter @hadith/mobile start     # or: pnpm mobile
```

Then press `i` (iOS simulator), `a` (Android emulator), or scan the QR code
with the **Expo Go** app on a physical device.

## Configuration

Create `apps/mobile/.env` (see the `EXPO_PUBLIC_*` block in the repo-root
`.env.example`):

```bash
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
EXPO_PUBLIC_POSTHOG_KEY=<optional>
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
EXPO_PUBLIC_SENTRY_DSN=<optional>
EXPO_PUBLIC_SHARE_BASE_URL=https://yourdomain.com/hadith/
```

- **`EXPO_PUBLIC_API_URL`** (required) → points the app at the web BFF;
  defaults to `http://localhost:3000`. On a physical device this must be your
  machine's LAN IP (not `localhost`), and the `apps/web` server must be running.
- **Supabase vars** (optional) → only used to forward an anon JWT as `Bearer`
  on each request. Without them, `apiFetch` simply skips the JWT and still
  fetches from `EXPO_PUBLIC_API_URL`. They do not select the backend.
- **`EXPO_PUBLIC_SHARE_BASE_URL`** → set this for any non-dev build, or share
  links leak the placeholder host.
- **PostHog / Sentry unset** → analytics / error tracking no-op silently.
  Full Sentry native crash reporting needs a dev/EAS build (not Expo Go).

## Scripts

```bash
pnpm --filter @hadith/mobile start       # Metro dev server
pnpm --filter @hadith/mobile typecheck   # tsc --noEmit
pnpm --filter @hadith/mobile lint        # Biome (shared repo config)
```

## Production builds (EAS)

Profiles live in `eas.json` (development / preview / production). When you're
ready to ship binaries:

```bash
npm i -g eas-cli
eas login
eas build --platform all --profile preview     # installable APK + iOS internal
```

Requires an Expo account; store submission additionally needs Apple Developer
/ Google Play accounts. Not needed for Expo Go development.

## Architecture notes

- **Routing**: `expo-router` v4, file-based. Bottom tabs (Search / Browse /
  Bookmarks / Settings); hadith detail is a root-stack screen so it covers
  the tab bar. `/` redirects to `/search`.
- **Styling**: NativeWind v4 — the same Tailwind class names and HSL theme
  tokens as the web. Light / dark / sepia injected at runtime via `vars()`.
- **State**: TanStack Query (search) + Zustand (bookmarks, UI, theme),
  persisted to AsyncStorage with the same storage keys as the web's
  localStorage.
- **Privacy**: raw query text never leaves the device — only its SHA-256
  hash and length, identical to the web (plan/03-analytics-monitoring.md).
