import { useMutation } from "@tanstack/react-query";
import {
  SearchResponseSchema,
  type SearchRequest,
  type SearchResponse,
} from "@hadith/shared-types";

import { apiFetch } from "@/lib/api";
import { useUiStore } from "@/lib/store/ui-store";

/**
 * Canonical key — mirrors apps/web/lib/queries/use-search.ts and the server
 * canonicalKey at apps/web/lib/server/hash.ts. Drift between any of the three
 * would fragment the cache and split analytics populations.
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
 * Search mutation. POSTs to the Next.js API at `${ENV.API_URL}/api/search`
 * which runs the full hybrid pipeline (embed + RRF + rerank + cache + log).
 * Uses the shared apiFetch so Authorization JWT forwarding stays in one place.
 *
 * Forwards `skip_cache` from the persisted Private-mode toggle (ui-store) so
 * the server skips both the cache read and write — mirrors the web client.
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
