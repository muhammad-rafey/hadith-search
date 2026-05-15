"use client";

import { useMutation } from "@tanstack/react-query";
import {
  MOCK_HADITHS,
  SearchResponseSchema,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
} from "@hadith/shared-types";
import { getSupabaseBrowserClient, isPlaceholderSupabase } from "@/lib/supabase/client";
import { useUiStore } from "@/lib/store";

/**
 * Canonical key format for hashing.
 *
 * Format: `language + "|" + (book ?? "") + "|" + (narrator ?? "") + "|" + canonical_query`
 *
 * This MUST match what the Edge Function hashes before writing to `search_logs`
 * and `query_cache`. Components can import and use this to produce the same hash.
 *
 * canonical_query is the lowercased, whitespace-collapsed query string.
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
  const canonicalQuery = query.toLowerCase().replace(/\s+/g, " ").trim();
  return `${language}|${book ?? ""}|${narrator ?? ""}|${canonicalQuery}`;
}

/**
 * Search mutation hook. Calls the Supabase Edge Function `search` when a real
 * Supabase project is configured, and falls back to a client-side substring
 * filter against MOCK_HADITHS when running with placeholder env vars (so the
 * dev experience and the CI build both work without a real backend).
 */
export function useSearch() {
  return useMutation<SearchResponse, Error, SearchRequest>({
    mutationKey: ["search"],
    mutationFn: async (vars) => {
      const start = performance.now();
      if (isPlaceholderSupabase()) {
        return mockSearch(vars, start);
      }
      const supabase = getSupabaseBrowserClient();
      const privateMode = useUiStore.getState().privateMode;
      const body: SearchRequest = { ...vars, skip_cache: privateMode };
      const { data, error } = await supabase.functions.invoke("search", { body });
      if (error) throw error;
      // Parse via Zod to surface contract violations from the Edge Function.
      return SearchResponseSchema.parse(data);
    },
  });
}

/**
 * Parse reference shortcut patterns from a user query.
 *
 * Supported patterns (case-insensitive):
 *   - `bukhari:N`        — exact collection:number id
 *   - `bukhari N`        — collection name followed by number
 *   - `Book N, Hadith M` — in-book reference style
 *
 * Returns the resolved SearchResult, or null if no match.
 *
 * NOTE: This logic mirrors (but cannot perfectly replicate) what the real Edge
 * Function does; the mock exists only for local dev. The real search may resolve
 * additional patterns not handled here.
 */
function resolveReferenceShortcut(q: string): (typeof MOCK_HADITHS)[number] | null {
  const normalized = q.trim().toLowerCase();

  // Pattern 1: exact id match — "bukhari:1"
  const exactMatch = MOCK_HADITHS.find((h) => h.id.toLowerCase() === normalized);
  if (exactMatch) return exactMatch;

  // Pattern 2: "bukhari N" — collection name + hadith number
  const collectionNumberMatch = normalized.match(/^([a-z]+)\s+(\d+)$/);
  if (collectionNumberMatch) {
    const collection = collectionNumberMatch[1];
    const numStr = collectionNumberMatch[2];
    if (collection && numStr) {
      const num = Number.parseInt(numStr, 10);
      const found = MOCK_HADITHS.find(
        (h) => h.collection.toLowerCase() === collection && h.hadith_number === num,
      );
      if (found) return found;
    }
  }

  // Pattern 3: "Book N, Hadith M" — in-book reference style
  const inBookMatch = normalized.match(/^book\s+(\d+),\s*hadith\s+(\d+)$/);
  if (inBookMatch) {
    const bookNumStr = inBookMatch[1];
    const hadithNumStr = inBookMatch[2];
    if (bookNumStr && hadithNumStr) {
      const bookNum = Number.parseInt(bookNumStr, 10);
      const hadithNum = Number.parseInt(hadithNumStr, 10);
      // hadith_number is the global number; in_book_ref matches "Book N, Hadith M"
      const found = MOCK_HADITHS.find(
        (h) =>
          h.book_number === bookNum &&
          h.in_book_ref.toLowerCase() === `book ${bookNum}, hadith ${hadithNum}`,
      );
      if (found) return found;
    }
  }

  return null;
}

/**
 * Client-side mock search against MOCK_HADITHS.
 *
 * DIVERGENCE FROM REAL SEMANTIC SEARCH:
 *   - Uses substring token matching (AND logic) rather than vector similarity.
 *   - Reference shortcuts are resolved via id / collection / in_book_ref lookups
 *     only — no synonym expansion, transliteration, or semantic relevance.
 *   - Ranking is by raw token-hit count, not cosine similarity.
 *   - Results are NOT re-ranked by Cohere.
 * This mock exists purely for local dev / CI without a real backend.
 */
function mockSearch(vars: SearchRequest, start: number): SearchResponse {
  const q = vars.query.toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);

  // Reference lookup: exact id, collection:N, "bukhari N", "Book N, Hadith M"
  const direct = resolveReferenceShortcut(q);
  if (direct) {
    return {
      results: [toResult(direct, 1)],
      mode: "reference",
      latency_ms: Math.round(performance.now() - start),
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
    // AND semantics: all tokens must appear in the haystack for a match.
    // (Real semantic search uses vector similarity — this is an approximation.)
    return tokens.every((t) => hay.includes(t));
  })
    .slice(0, vars.topK ?? 10) // defensive default when topK is undefined
    .map((h, i) => toResult(h, scoreFor(h, tokens), i));

  const mode: SearchResponse["mode"] = filtered.length === 0 ? "empty" : "fresh";
  return {
    results: filtered,
    mode,
    latency_ms: Math.round(performance.now() - start),
  };
}

function scoreFor(h: { text_en_full: string }, tokens: string[]): number {
  if (tokens.length === 0) return 0.5;
  const text = h.text_en_full.toLowerCase();
  const hits = tokens.filter((t) => text.includes(t)).length;
  return Math.min(1, hits / tokens.length);
}

function toResult(
  h: (typeof MOCK_HADITHS)[number],
  relevance: number,
  _position?: number,
): SearchResult {
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
