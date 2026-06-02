"use client";

import { useMutation } from "@tanstack/react-query";
import {
  SearchResponseSchema,
  type SearchRequest,
  type SearchResponse,
} from "@hadith/shared-types";

import { apiFetch } from "@/lib/api";
import { useUiStore } from "@/lib/store";

/**
 * Canonical key format for hashing — must match the server canonicalKey() at
 * apps/web/lib/server/hash.ts AND the mobile mirror at
 * apps/mobile/lib/queries/use-search.ts. Drift between any of the three would
 * fragment the cache.
 *
 * Format: `language | book | narrator | canonical_query`
 *
 * canonical_query: NFKC-normalized, lowercased, whitespace-collapsed, trailing
 * whitespace and punctuation removed. NFKC ensures Arabic queries in different
 * normalization forms hash to the same value.
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
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s\p{P}]+$/u, "");
  const n = (narrator ?? "").normalize("NFKC").trim().toLowerCase();
  return `${language}|${book ?? ""}|${n}|${canonicalQuery}`;
}

/**
 * Search mutation hook. POSTs to /api/search; the Next.js API route handles
 * the hybrid pipeline (Cohere embed + RRF + rerank + cache + log).
 */
export function useSearch() {
  return useMutation<SearchResponse, Error, SearchRequest>({
    mutationKey: ["search"],
    mutationFn: async (vars) => {
      const { privateMode } = useUiStore.getState();
      const body: SearchRequest = { ...vars, skip_cache: privateMode };
      const res = await apiFetch("/api/search", {
        method: "POST",
        body: JSON.stringify(body),
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
