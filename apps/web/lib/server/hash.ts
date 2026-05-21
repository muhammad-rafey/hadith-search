import "server-only";

import { createHash } from "node:crypto";

/**
 * Canonical query key used for both query_cache lookups and search_logs.
 *
 * Format: `language | book | narrator | canonical_query`
 *
 * `canonical_query` is the user's input NFKC-normalized, lowercased,
 * whitespace-collapsed, and stripped of trailing whitespace/punctuation. The
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
  const q = p.query
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s\p{P}]+$/u, "");
  const narrator = (p.narrator ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
  return `${p.language}|${p.book ?? ""}|${narrator}|${q}`;
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
