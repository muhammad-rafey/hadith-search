"use client";

import * as React from "react";
import posthog from "posthog-js";
import { getSupabaseBrowserClient, isPlaceholderSupabase } from "@/lib/supabase/client";

/**
 * Triggers Supabase anonymous sign-in once per app session, then identifies
 * the PostHog distinct ID with the auth UID so the analytics history persists
 * across the eventual anonymous-to-registered upgrade
 * (see plan/02-web-app.md "Bookmark migration on auth upgrade").
 *
 * Renders nothing.
 */
export function AnonAuthBootstrap() {
  React.useEffect(() => {
    if (isPlaceholderSupabase()) return;

    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        let userId = data.session?.user?.id;
        if (!data.session) {
          const { data: signed, error } = await supabase.auth.signInAnonymously();
          if (error || cancelled) return;
          userId = signed.user?.id;
        }
        if (cancelled) return;
        if (userId && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
          posthog.identify(userId);
        }
      } catch {
        // Auth bootstrap is best-effort; failures are non-fatal for browsing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
