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
} as const;

export const HAS_POSTHOG = ENV.POSTHOG_KEY.length > 0;
export const HAS_SENTRY = ENV.SENTRY_DSN.length > 0;
