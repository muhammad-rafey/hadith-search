import "server-only";

/**
 * Recognises hadith reference shortcuts and returns null when the query is not
 * a recognised reference. Generalised across all collections.
 *
 * Recognised:
 *   - "muslim:8a" / "muslim 8 a" / "Sahih Muslim #8a" / "tirmidhi-1234"
 *                              → { kind: "by_number", collection, value: "8a" }
 *   - "bukhari:123" / "bukhari 123" / "Sahih al-Bukhari 123"
 *                              → { kind: "by_number", collection: "bukhari", value: "123" }
 *   - "Book 2, Hadith 5" / "book 2 hadith 5"
 *                              → { kind: "by_book_and_seq", collection: "bukhari", book: 2, seq: 5 }
 *   - "2:5"                    → same (collection-less colon → bukhari book:seq)
 *   - bare "123"               → { kind: "by_number", collection: "bukhari", value: "123" }
 *
 * `value` is a STRING (hadith numbers carry letter suffixes like "8a"); the
 * resolver matches it against the canonical hadithNumber. by_book_and_seq stays
 * bukhari-only (book+seq is unambiguous only for bukhari's integer book numbers).
 */
export type Reference =
  | { kind: "by_number"; collection: string; value: string }
  | { kind: "by_book_and_seq"; collection: string; book: number; seq: number };

const MAX_REFERENCE_VALUE = 999_999; // bounds the by_book_and_seq integers.
const MAX_NUMBER_LEN = 12; // "8a", "1001b", "521,522" all fit comfortably.

// Recognised collection tokens → canonical slug. Longer aliases are matched
// first (see the length-sorted alternation below) so "sahih al-bukhari" wins
// over "bukhari".
const COLLECTION_ALIASES: Record<string, string> = {
  bukhari: "bukhari",
  "al-bukhari": "bukhari",
  "sahih bukhari": "bukhari",
  "sahih al-bukhari": "bukhari",
  muslim: "muslim",
  "sahih muslim": "muslim",
  nasai: "nasai",
  "an-nasai": "nasai",
  "sunan an-nasai": "nasai",
  abudawud: "abudawud",
  "abu dawud": "abudawud",
  "abu dawood": "abudawud",
  "sunan abi dawud": "abudawud",
  tirmidhi: "tirmidhi",
  "at-tirmidhi": "tirmidhi",
  "jami at-tirmidhi": "tirmidhi",
  ibnmajah: "ibnmajah",
  "ibn majah": "ibnmajah",
  "sunan ibn majah": "ibnmajah",
  ahmad: "ahmad",
  "musnad ahmad": "ahmad",
  riyadussalihin: "riyadussalihin",
  "riyad as-salihin": "riyadussalihin",
  "riyad us-salihin": "riyadussalihin",
  adab: "adab",
  "adab al-mufrad": "adab",
  "al-adab al-mufrad": "adab",
  mishkat: "mishkat",
  "mishkat al-masabih": "mishkat",
  bulugh: "bulugh",
  "bulugh al-maram": "bulugh",
  forty: "forty",
  hisn: "hisn",
  "hisn al-muslim": "hisn",
  shamail: "shamail",
  "shamail muhammadiyah": "shamail",
  virtues: "virtues",
};

// Alternation of aliases, longest first so the regex prefers "sahih al-bukhari"
// over the shorter "bukhari".
const COLLECTION_ALT = Object.keys(COLLECTION_ALIASES)
  .sort((a, b) => b.length - a.length)
  .map(escapeRe)
  .join("|");

// "<collection><sep><number>" — number is digits with an optional single
// letter suffix, e.g. "8", "8a", "8 a", "1001b".
const COLLECTION_NUMBER_RE = new RegExp(`^(${COLLECTION_ALT})[\\s:#-]+([0-9]+(?:\\s?[a-z])?)$`);

function bounded(n: number): number | null {
  if (!Number.isFinite(n) || n < 1 || n > MAX_REFERENCE_VALUE) return null;
  return n;
}

export function parseReference(rawInput: string): Reference | null {
  // Collapse internal whitespace so "Sahih  al-bukhari   123" still parses.
  const q = rawInput.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return null;

  // "book N, hadith M" / "book N hadith M" — bukhari book:seq. Check first.
  const bookHadith = q.match(/^book (\d+)[, ]+hadith (\d+)$/);
  if (bookHadith) {
    const book = bounded(Number.parseInt(bookHadith[1] ?? "", 10));
    const seq = bounded(Number.parseInt(bookHadith[2] ?? "", 10));
    if (book !== null && seq !== null) {
      return { kind: "by_book_and_seq", collection: "bukhari", book, seq };
    }
  }

  // "<collection><sep><number>" — e.g. "muslim 8a", "bukhari:123".
  const cn = q.match(COLLECTION_NUMBER_RE);
  if (cn) {
    const collection = COLLECTION_ALIASES[cn[1] ?? ""];
    const value = (cn[2] ?? "").replace(/\s+/g, "");
    if (collection && value && value.length <= MAX_NUMBER_LEN) {
      return { kind: "by_number", collection, value };
    }
  }

  // "N:M" — collection-less colon → bukhari book:seq.
  const colon = q.match(/^(\d+):(\d+)$/);
  if (colon) {
    const book = bounded(Number.parseInt(colon[1] ?? "", 10));
    const seq = bounded(Number.parseInt(colon[2] ?? "", 10));
    if (book !== null && seq !== null) {
      return { kind: "by_book_and_seq", collection: "bukhari", book, seq };
    }
  }

  // Bare digits — treat as a bukhari hadith number.
  const bare = q.match(/^\d+$/);
  if (bare && q.length <= MAX_NUMBER_LEN) {
    return { kind: "by_number", collection: "bukhari", value: q };
  }

  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
