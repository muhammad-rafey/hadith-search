import { useMutation } from "@tanstack/react-query";
import {
  MOCK_HADITHS,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
} from "@hadith/shared-types";
import { getSupabase, isPlaceholderSupabase } from "@/lib/supabase";

/**
 * Search mutation hook — a faithful port of apps/web/lib/queries/use-search.ts.
 * Calls the Supabase Edge Function `search` when a real project is configured,
 * and falls back to a client-side substring filter against MOCK_HADITHS when
 * running with placeholder env (so the app works end-to-end with no backend).
 */
export function useSearch() {
  return useMutation<SearchResponse, Error, SearchRequest>({
    mutationKey: ["search"],
    mutationFn: async (vars) => {
      const start = Date.now();
      if (isPlaceholderSupabase()) {
        return mockSearch(vars, start);
      }
      const supabase = getSupabase();
      const { data, error } = await supabase.functions.invoke("search", { body: vars });
      if (error) throw error;
      return data as SearchResponse;
    },
  });
}

function mockSearch(vars: SearchRequest, start: number): SearchResponse {
  const q = vars.query.toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);

  // Reference lookup: "bukhari:1" -> exact id match.
  const direct = MOCK_HADITHS.find((h) => h.id.toLowerCase() === q);
  if (direct) {
    return {
      results: [toResult(direct, 1)],
      mode: "reference",
      latency_ms: Math.max(0, Date.now() - start),
    };
  }

  const filtered = MOCK_HADITHS.filter((h) => {
    if (vars.book && h.book_number !== vars.book) return false;
    if (vars.narrator) {
      const needle = vars.narrator.toLowerCase();
      if (!(h.narrator_normalized ?? h.narrator ?? "").toLowerCase().includes(needle)) {
        return false;
      }
    }
    if (tokens.length === 0) return true;
    const hay = `${h.text_en_full} ${h.narrator ?? ""} ${h.chapter_title_en ?? ""}`.toLowerCase();
    return tokens.some((t) => hay.includes(t));
  })
    .slice(0, vars.topK)
    .map((h) => toResult(h, scoreFor(h, tokens)));

  const mode: SearchResponse["mode"] = filtered.length === 0 ? "empty" : "fresh";
  return {
    results: filtered,
    mode,
    latency_ms: Math.max(0, Date.now() - start),
  };
}

function scoreFor(h: { text_en_full: string }, tokens: string[]): number {
  if (tokens.length === 0) return 0.5;
  const text = h.text_en_full.toLowerCase();
  const hits = tokens.filter((t) => text.includes(t)).length;
  return Math.min(1, hits / tokens.length);
}

function toResult(h: (typeof MOCK_HADITHS)[number], relevance: number): SearchResult {
  return {
    id: h.id,
    hadith_number: h.hadith_number,
    book_number: h.book_number,
    book_name_en: h.book_name_en,
    chapter_title_en: h.chapter_title_en,
    in_book_ref: h.in_book_ref,
    usc_msa_ref: h.usc_msa_ref,
    narrator: h.narrator,
    text_en_full: h.text_en_full,
    text_ar: h.text_ar,
    relevance,
  };
}
