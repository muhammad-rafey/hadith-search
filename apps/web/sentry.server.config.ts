import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Server-side uses the non-public SENTRY_DSN env var (never exposed to the browser).
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
