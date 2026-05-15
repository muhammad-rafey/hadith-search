import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Client-side uses NEXT_PUBLIC_SENTRY_DSN (exposed to the browser bundle).
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeBreadcrumb(breadcrumb) {
    // Match only the actual Supabase Edge Function path, not any URL that happens
    // to contain "/search" (e.g., a future /settings/search page).
    // PRESERVED CodeRabbit fix — do not loosen to .includes('/search').
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

// Optional router-transition tracing — only export when available in this SDK.
export const onRouterTransitionStart = (
  Sentry as unknown as { captureRouterTransitionStart?: unknown }
).captureRouterTransitionStart;
