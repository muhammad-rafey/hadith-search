import { useMutation } from "@tanstack/react-query";
import {
  SearchResponseSchema,
  type SearchRequest,
  type SearchResponse,
} from "@hadith/shared-types";

import { ENV } from "@/lib/env";
import { getSupabase, isPlaceholderSupabase } from "@/lib/supabase";

/**
 * Canonical key — mirrors apps/web/lib/queries/use-search.ts and the server
 * canonicalKey at apps/web/lib/server/hash.ts. Drift between platforms would
 * fragment the cache.
 */
export function canonicalKey({
  language,
  book,
  narrator,
  query,
}: {
  language: string;
  book?: number | null;
  narrator?: string | null;
  query: string;
}): string {
  const canonicalQuery = query
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s\p{P}]+$/u, "");
  return `${language}|${book ?? ""}|${(narrator ?? "").trim().toLowerCase()}|${canonicalQuery}`;
}

/**
 * Search mutation. POSTs to the Next.js API at `${ENV.API_URL}/api/search`
 * which runs the full hybrid pipeline (Cohere embed + RRF + rerank +
 * cache + log).
 */
export function useSearch() {
  return useMutation<SearchResponse, Error, SearchRequest>({
    mutationKey: ["search"],
    mutationFn: async (vars) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (!isPlaceholderSupabase()) {
        try {
          const supabase = getSupabase();
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (token) headers.authorization = `Bearer ${token}`;
        } catch {
          // Anonymous session may not have settled yet; proceed without auth.
        }
      }
      const res = await fetch(`${ENV.API_URL}/api/search`, {
        method: "POST",
        headers,
        body: JSON.stringify(vars),
      });
      if (!res.ok) {
        let detail = "";
        try {
          detail = JSON.stringify(await res.json());
        } catch {
          /* ignore */
        }
        throw new Error(`search failed (${res.status})${detail ? `: ${detail}` : ""}`);
      }
      return SearchResponseSchema.parse(await res.json());
    },
  });
}
