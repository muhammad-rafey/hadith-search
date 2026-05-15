import { QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { identify } from "@/lib/analytics";
import { queryClient } from "@/lib/queries/query-client";
import { getSupabase, isPlaceholderSupabase } from "@/lib/supabase";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Anonymous Supabase sign-in, once per session — port of
 * apps/web/app/(app)/anon-auth-bootstrap.tsx. Identifies PostHog with the
 * auth UID so analytics history survives the eventual anon→registered
 * upgrade. Best-effort: failures never block browsing. Also re-arms
 * anonymous auth if a token refresh ever fails (plan edge case #7).
 */
function useAnonAuthBootstrap() {
  React.useEffect(() => {
    if (isPlaceholderSupabase()) return;
    let cancelled = false;
    const supabase = getSupabase();

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        let userId = data.session?.user?.id;
        if (!data.session) {
          const { data: signed, error } = await supabase.auth.signInAnonymously();
          if (error || cancelled) return;
          userId = signed.user?.id;
        }
        if (userId) identify(userId);
      } catch {
        // Best-effort; browsing works without auth.
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" && !session) {
        supabase.auth.signInAnonymously().catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useAnonAuthBootstrap();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
