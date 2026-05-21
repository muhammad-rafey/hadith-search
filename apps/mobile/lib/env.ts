/**
 * Typed reader for EXPO_PUBLIC_* env vars. Expo inlines anything prefixed
 * with EXPO_PUBLIC_ at build time; anything else is stripped. All values
 * are optional — when empty the app runs fully in mock mode, exactly like
 * the web app's isPlaceholderSupabase() shortcut.
 */
export const ENV = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "",
  POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
  SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
  /** Base URL of the Next.js API service (apps/web). Mobile fetches /api/* here. */
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
  // Base for share links. Defaults to the planned canonical web host
  // (plan/02-web-app.md); override once a production domain is decided.
  SHARE_BASE_URL: process.env.EXPO_PUBLIC_SHARE_BASE_URL ?? "https://hadithapp.tld/hadith/",
} as const;

export const HAS_POSTHOG = ENV.POSTHOG_KEY.length > 0;
export const HAS_SENTRY = ENV.SENTRY_DSN.length > 0;
export const HAS_API = ENV.API_URL.length > 0;
