import "server-only";

import { createHash } from "node:crypto";

/**
 * Canonical query key used for both query_cache lookups and search_logs.
 *
 * Format: `language | book | narrator | canonical_query`
 *
 * `canonical_query` is the user's input lowercased, whitespace-collapsed, and
 * stripped of trailing whitespace/punctuation. The client mirror lives at
 * apps/web/lib/queries/use-search.ts:canonicalKey — keep them in sync.
 */
export function canonicalKey(p: {
  language: string;
  book?: number | null;
  narrator?: string | null;
  query: string;
}): string {
  const q = p.query
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s\p{P}]+$/u, "");
  return `${p.language}|${p.book ?? ""}|${(p.narrator ?? "").trim().toLowerCase()}|${q}`;
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
