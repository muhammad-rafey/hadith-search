/**
 * tokenizeQuery is byte-identical to apps/web/lib/highlight.ts. The web's
 * highlightTokens() returns DOM <mark> elements; RN can't render those, so
 * we expose splitByTokens() returning plain segments and let
 * components/highlight-text.tsx paint matched spans with <Text>.
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

export interface Segment {
  text: string;
  match: boolean;
}

/**
 * Splits text into ordered segments, flagging which ones matched a token
 * (case-insensitive). Same split semantics as the web's regex approach;
 * never interprets content as markup (RN has no innerHTML to worry about).
 */
const MAX_TOKENS = 32;
const MAX_TOKEN_LEN = 64;

export function splitByTokens(text: string, tokens: string[]): Segment[] {
  if (!text) return [];
  // Bound and normalize the token set before building the alternation regex:
  // dedupe, cap length/count, and sort longest-first so longer tokens win
  // over shorter prefixes. Prevents pathological regexes from pasted input.
  const normalized = [
    ...new Set(
      tokens
        .map((t) => t.toLowerCase().trim())
        .filter((t) => t.length >= 2)
        .map((t) => t.slice(0, MAX_TOKEN_LEN)),
    ),
  ]
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_TOKENS);
  if (normalized.length === 0) return [{ text, match: false }];
  const pattern = new RegExp(`(${normalized.map(escapeRegex).join("|")})`, "gi");
  // split() with a capturing group puts matches at odd indices. Determine
  // match flag from the original index BEFORE dropping empty segments.
  return text
    .split(pattern)
    .map((part, i) => ({ text: part, match: i % 2 === 1 }))
    .filter((seg) => seg.text.length > 0);
}
