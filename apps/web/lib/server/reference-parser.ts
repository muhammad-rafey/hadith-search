import "server-only";

/**
 * Recognises bukhari-specific reference shortcuts. Returns null when the
 * query is not a recognised reference.
 *
 * Recognised:
 *   - "bukhari:123"            → { kind: "by_urn_or_number", value: 123 }
 *   - "bukhari 123"            → same
 *   - "Bukhari #123"           → same
 *   - "bukhari-123"            → same
 *   - "Sahih al-Bukhari 123"   → same
 *   - "Book 2, Hadith 5"       → { kind: "by_book_and_seq", book: 2, seq: 5 }
 *   - "book 2 hadith 5"        → same (relaxed comma)
 *   - "2:5"                    → same (collection-less, prefer book:seq)
 *   - bare "123"               → { kind: "by_urn_or_number", value: 123 }
 *     (collection defaults to bukhari)
 *
 * All numeric values are bounded to MAX_REFERENCE_VALUE so a 10-digit
 * payload doesn't overflow Postgres `int` and 500 the search route.
 */
export type Reference =
  | { kind: "by_urn_or_number"; value: number }
  | { kind: "by_book_and_seq"; book: number; seq: number };

const MAX_REFERENCE_VALUE = 999_999; // Bukhari URNs are ≤ ~120k; this is comfortably above.

const BUKHARI_NAMES = [
  "bukhari",
  "sahih al-bukhari",
  "sahih bukhari",
  "al-bukhari",
];

function bounded(n: number): number | null {
  if (!Number.isFinite(n) || n < 1 || n > MAX_REFERENCE_VALUE) return null;
  return n;
}

export function parseReference(rawInput: string): Reference | null {
  const q = rawInput.trim().toLowerCase();
  if (!q) return null;

  // "book N, hadith M" / "book N hadith M" — must check before generic N:M
  const bookHadith = q.match(/^book\s+(\d+)[,\s]+hadith\s+(\d+)$/);
  if (bookHadith) {
    const book = bounded(Number.parseInt(bookHadith[1] ?? "", 10));
    const seq = bounded(Number.parseInt(bookHadith[2] ?? "", 10));
    if (book !== null && seq !== null) {
      return { kind: "by_book_and_seq", book, seq };
    }
  }

  // "N:M" — collection-less, treat as book:seq
  const colon = q.match(/^(\d+):(\d+)$/);
  if (colon) {
    const book = bounded(Number.parseInt(colon[1] ?? "", 10));
    const seq = bounded(Number.parseInt(colon[2] ?? "", 10));
    if (book !== null && seq !== null) {
      return { kind: "by_book_and_seq", book, seq };
    }
  }

  // "bukhari:N" / "bukhari N" / "bukhari #N" / "bukhari-N" / "Sahih al-Bukhari N"
  for (const name of BUKHARI_NAMES) {
    const re = new RegExp(`^${escapeRe(name)}[\\s:#-]+(\\d+)$`);
    const m = q.match(re);
    if (m) {
      const n = bounded(Number.parseInt(m[1] ?? "", 10));
      if (n !== null) return { kind: "by_urn_or_number", value: n };
    }
  }

  // Bare digits — treat as Bukhari hadith number.
  const bare = q.match(/^\d+$/);
  if (bare) {
    const n = bounded(Number.parseInt(q, 10));
    if (n !== null) return { kind: "by_urn_or_number", value: n };
  }

  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
