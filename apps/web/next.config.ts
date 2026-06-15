import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// ── Security response headers ───────────────────────────────────────────────
// A public, unauthenticated site needs these at the edge. frame-ancestors /
// X-Frame-Options stop clickjacking; nosniff stops MIME sniffing; HSTS forces
// HTTPS; the CSP constrains script/connect/style origins to self + the exact
// external services this app talks to (Supabase, PostHog, Sentry). Inline
// script/style is allowed because Next.js (hydration bootstrap) + next-themes
// inject inline <script> and Tailwind injects inline <style>; tighten to
// nonces in a follow-up if needed.
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function contentSecurityPolicy(): string {
  const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const posthog = originOf(process.env.NEXT_PUBLIC_POSTHOG_HOST) ?? "https://us.i.posthog.com";
  const connectSrc = [
    "'self'",
    supabase,
    "https://*.supabase.co",
    posthog,
    "https://*.posthog.com",
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    "https://*.ingest.de.sentry.io",
  ]
    .filter(Boolean)
    .join(" ");
  // React's development build (and Turbopack's dev runtime) require eval() for
  // debugging features like reconstructing callstacks. Production never uses it,
  // so 'unsafe-eval' is scoped to dev only to keep the prod CSP tight.
  const devEval = process.env.NODE_ENV !== "production" ? ["'unsafe-eval'"] : [];
  const scriptSrc = ["'self'", "'unsafe-inline'", ...devEval, posthog, "https://*.posthog.com"]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hadith/shared-types"],
  // Keep the Cohere SDK out of the server bundle. When the bundler inlines it,
  // the SDK's generated request serializer is mangled and silently drops the
  // `outputDimension` field — Cohere then returns embed-v4.0's 1536-d default,
  // which fails the 1024-d check in embedQuery and degrades every search to the
  // stub embedding. Requiring it at runtime preserves the serializer.
  serverExternalPackages: ["cohere-ai"],
  // `typedRoutes` graduated from `experimental` to a stable top-level option in
  // Next.js 16 (it also works under Turbopack, the v16 default bundler).
  typedRoutes: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Bundler-agnostic Sentry build options (the v10 SDK applies these under both
// Turbopack — the Next.js 16 default — and webpack).
const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  // Upload source maps only when an auth token is configured (CI / production).
  // Local builds without a token still succeed.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  sourcemaps: {
    // Don't ship source maps to public users — they go to Sentry only.
    deleteSourcemapsAfterUpload: true,
  },
};

export default withSentryConfig(nextConfig, sentryBuildOptions);
