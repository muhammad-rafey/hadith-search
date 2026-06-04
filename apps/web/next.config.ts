import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
