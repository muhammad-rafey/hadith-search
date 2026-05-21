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
 */
export type Reference =
  | { kind: "by_urn_or_number"; value: number }
  | { kind: "by_book_and_seq"; book: number; seq: number };

const BUKHARI_NAMES = [
  "bukhari",
  "sahih al-bukhari",
  "sahih bukhari",
  "al-bukhari",
];

export function parseReference(rawInput: string): Reference | null {
  const q = rawInput.trim().toLowerCase();
  if (!q) return null;

  // "book N, hadith M" / "book N hadith M" — must check before generic N:M
  const bookHadith = q.match(/^book\s+(\d+)[,\s]+hadith\s+(\d+)$/i);
  if (bookHadith) {
    const book = Number.parseInt(bookHadith[1] ?? "", 10);
    const seq = Number.parseInt(bookHadith[2] ?? "", 10);
    if (Number.isFinite(book) && Number.isFinite(seq)) {
      return { kind: "by_book_and_seq", book, seq };
    }
  }

  // "N:M" — collection-less, treat as book:seq
  const colon = q.match(/^(\d+):(\d+)$/);
  if (colon) {
    const book = Number.parseInt(colon[1] ?? "", 10);
    const seq = Number.parseInt(colon[2] ?? "", 10);
    if (Number.isFinite(book) && Number.isFinite(seq)) {
      return { kind: "by_book_and_seq", book, seq };
    }
  }

  // "bukhari:N" / "bukhari N" / "bukhari #N" / "bukhari-N" / "Sahih al-Bukhari N"
  for (const name of BUKHARI_NAMES) {
    const re = new RegExp(`^${escapeRe(name)}[\\s:#-]+(\\d+)$`, "i");
    const m = q.match(re);
    if (m) {
      const n = Number.parseInt(m[1] ?? "", 10);
      if (Number.isFinite(n)) return { kind: "by_urn_or_number", value: n };
    }
  }

  // Bare digits — treat as Bukhari hadith number.
  const bare = q.match(/^\d+$/);
  if (bare) {
    const n = Number.parseInt(q, 10);
    if (Number.isFinite(n)) return { kind: "by_urn_or_number", value: n };
  }

  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
