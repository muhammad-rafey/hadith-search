"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { Toaster } from "@/components/ui/toaster";

// NOTE: defaultTheme is intentionally "light" rather than "system" — the app
// has a custom "sepia" theme that next-themes cannot map to a system value, so
// we default to light and let users switch via the ThemeToggle themselves.

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  // Initialise PostHog inside a useEffect so it only ever runs in the browser
  // and is never called more than once (React StrictMode double-invokes effects
  // in dev, but posthog.__loaded guards against double-init).
  React.useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    // posthog.init is idempotent when called with the same key, but guard
    // explicitly to avoid duplicate configuration in strict-mode double runs.
    if (!posthog.__loaded) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: false,
        disable_session_recording: true,
        persistence: "localStorage+cookie",
        // Privacy: the search box navigates to /search?q=<raw query>, so the URL
        // attached to pageviews/events would otherwise ship the user's raw query
        // text to PostHog. Strip the query string + hash from every URL-bearing
        // property so only the path is recorded.
        sanitize_properties: (properties) => {
          const stripQuery = (value: unknown): unknown => {
            if (typeof value !== "string" || value === "") return value;
            try {
              // Resolve relative values (e.g. "/search?q=…") against the origin
              // so their query/hash get stripped too — bare `new URL()` throws on
              // relative input and would otherwise leak the raw query unstripped.
              const url = new URL(value, window.location.origin);
              url.search = "";
              url.hash = "";
              return url.toString();
            } catch {
              return value;
            }
          };
          for (const key of ["$current_url", "$referrer"]) {
            if (key in properties) properties[key] = stripQuery(properties[key]);
          }
          return properties;
        },
      });
    }
  }, []);

  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="light"
      themes={["light", "dark", "sepia"]}
      enableSystem={false}
      enableColorScheme={false}
    >
      <QueryClientProvider client={queryClient}>
        <PostHogProvider client={posthog}>
          {children}
          {/* Toaster is a self-contained portal renderer — NOT a wrapper */}
          <Toaster />
        </PostHogProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
