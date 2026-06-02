import "server-only";

import { createHash } from "node:crypto";

/**
 * Normalize a query string: NFKC, lowercased, whitespace-collapsed, and stripped
 * of trailing whitespace/punctuation. This is the `canonical_query` component of
 * the cache key, and is ALSO the text handed to the FTS leg and the reranker —
 * never the full canonicalKey (which is prefixed with `lang|book|narrator|` and
 * would pollute a websearch_to_tsquery into matching nothing).
 */
export function normalizeQuery(query: string): string {
  return query
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s\p{P}]+$/u, "");
}

/**
 * Canonical query key used for both query_cache lookups and search_logs.
 *
 * Format: `language | book | narrator | canonical_query`
 *
 * `canonical_query` is the user's input run through normalizeQuery(). The
 * client mirror lives at apps/web/lib/queries/use-search.ts:canonicalKey and
 * apps/mobile/lib/queries/use-search.ts:canonicalKey — keep all three in sync,
 * including the NFKC step (without it, two visually-identical Arabic queries
 * in different normalization forms produce different hashes → cache misses).
 */
export function canonicalKey(p: {
  language: string;
  book?: number | null;
  narrator?: string | null;
  query: string;
}): string {
  const q = normalizeQuery(p.query);
  const narrator = (p.narrator ?? "").normalize("NFKC").trim().toLowerCase();
  return `${p.language}|${p.book ?? ""}|${narrator}|${q}`;
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
