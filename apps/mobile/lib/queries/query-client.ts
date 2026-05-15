import { QueryClient } from "@tanstack/react-query";

/**
 * Same defaults as apps/web/components/providers.tsx. Lives outside the
 * component tree so Fast Refresh during dev doesn't reset the cache.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
