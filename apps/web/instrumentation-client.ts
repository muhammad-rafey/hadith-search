import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Client-side uses NEXT_PUBLIC_SENTRY_DSN (exposed to the browser bundle).
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeBreadcrumb(breadcrumb) {
    // Scrub the request body from fetch breadcrumbs to the search/feedback BFF
    // routes — the body carries the raw query, which must never reach Sentry.
    // Match the exact API paths, not any URL containing "/search" (e.g. a future
    // /settings/search page). Do NOT loosen to .includes('/search').
    const url = breadcrumb.data?.url;
    if (
      breadcrumb.category === "fetch" &&
      typeof url === "string" &&
      /\/api\/(search|feedback)(?:[/?]|$)/.test(url)
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
