import type { ReactNode } from "react";
import { Fragment, createElement } from "react";

/**
 * Tokenize a query into unique, lowercased terms suitable for highlighting.
 * Punctuation and short noise tokens are stripped.
 */
export function tokenizeQuery(query: string): string[] {
  if (!query) return [];
  const lowered = query.toLowerCase();
  const raw = lowered.split(/[^\p{L}\p{N}]+/u);
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of raw) {
    if (token.length < 2) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wraps occurrences of any token (case-insensitive) in `<mark>`.
 * Uses React fragments instead of dangerouslySetInnerHTML so untrusted
 * content can never be interpreted as HTML.
 */
export function highlightTokens(text: string, tokens: string[]): ReactNode {
  if (!text) return null;
  if (tokens.length === 0) return text;
  const pattern = new RegExp(`(${tokens.map(escapeRegex).join("|")})`, "gi");
  const parts = text.split(pattern);
  return createElement(
    Fragment,
    null,
    ...parts.map((part, i) => {
      if (i % 2 === 1) {
        return createElement("mark", { key: i }, part);
      }
      return createElement(Fragment, { key: i }, part);
    }),
  );
}
