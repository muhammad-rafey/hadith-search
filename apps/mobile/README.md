# @hadith/mobile

Expo / React Native companion to the web app. Full feature parity: semantic
search, browse by book, hadith detail (Arabic + English + references),
bookmarks, settings (theme / font size / Arabic / private mode).

It reuses the same backend as the web app — the `@hadith/shared-types`
contract and the Supabase `search` Edge Function — so nothing server-side
changes. With no env configured it runs entirely against the bundled sample
corpus (`MOCK_HADITHS`), exactly like the web app's placeholder mode.

## Quick start

```bash
# from the repo root
pnpm install
pnpm --filter @hadith/mobile start     # or: pnpm mobile
```

Then press `i` (iOS simulator), `a` (Android emulator), or scan the QR code
with the **Expo Go** app on a physical device.

## Configuration

All optional. Create `apps/mobile/.env` (see the `EXPO_PUBLIC_*` block in the
repo-root `.env.example`):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
EXPO_PUBLIC_POSTHOG_KEY=<optional>
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
EXPO_PUBLIC_SENTRY_DSN=<optional>
```

- **No Supabase vars** → mock mode (works offline, full UI).
- **Supabase set** → search hits the live Edge Function. No code change.
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
