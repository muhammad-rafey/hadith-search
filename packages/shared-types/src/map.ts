import { z } from "zod";
import { collectionName } from "./collections";
import {
  cleanArabicText,
  extractNarratorFromEnglish,
  normalizeNarrator,
  stripNarratorPrefix,
} from "./clean";
import type { Hadith, SearchResult } from "./index";

/**
 * Generic row returned by the collection-aware RPCs (0016): get_collection_hadiths,
 * get_hadith_by_collection_urn, get_hadith_by_collection_number. Unlike the
 * bukhari RPCs, `book_number_raw` and `hadith_number_raw` are TEXT — across the
 * full corpus book numbers can be 'introduction' / '35b' and hadith numbers can
 * be '8 a' / '1001b' / comma-joined '521, 522'.
 */
export const HadithRowSchema = z.object({
  collection: z.string(),
  arabic_urn: z.number().int(),
  book_number_raw: z.string().nullable(),
  hadith_number_raw: z.string().nullable(),
  our_hadith_number: z.number().int().nullable(),
  english_bab_name: z.string().nullable(),
  arabic_bab_name: z.string().nullable(),
  english_text: z.string().nullable(),
  arabic_text: z.string().nullable(),
  english_grade: z.string().nullable(),
  arabic_grade: z.string().nullable(),
  score: z.number().optional(),
});
export type HadithRow = z.infer<typeof HadithRowSchema>;

/**
 * Shape returned by the legacy bukhari RPCs (search_bukhari_hybrid,
 * get_bukhari_book_hadiths, get_bukhari_hadith_by_urn, ...). `book_number` is an
 * int here because those RPCs cast it; the generic RPCs return text instead.
 */
export const BukhariRpcRowSchema = z.object({
  arabic_urn: z.number().int(),
  book_number: z.number().int().nullable(),
  hadith_number_raw: z.string().nullable(),
  our_hadith_number: z.number().int(),
  english_bab_name: z.string().nullable(),
  arabic_bab_name: z.string().nullable(),
  english_text: z.string().nullable(),
  arabic_text: z.string().nullable(),
  english_grade: z.string().nullable(),
  arabic_grade: z.string().nullable(),
  score: z.number().optional(),
});
export type BukhariRpcRow = z.infer<typeof BukhariRpcRowSchema>;

/**
 * Build the canonical "{collection}:{urn}" id. URN is unique across the corpus
 * and stable across re-ingest, so it's a better permalink target than
 * hadithNumber (which can be comma-joined like "521, 522" or carry a letter
 * suffix like "8 a").
 */
export function makeHadithId(collection: string, arabicURN: number): string {
  return `${collection}:${arabicURN}`;
}

/**
 * Parse a "{collection}:{urn}" id into its parts. Returns null for any other
 * shape so callers can 404 cleanly. The collection is lowercased.
 *
 * Tolerates a percent-encoded id ("bukhari%3A1"). Next.js's App Router is
 * inconsistent about decoding dynamic route params: `generateMetadata` receives
 * the decoded value ("bukhari:1") while the page/route handler can receive the
 * raw encoded form ("bukhari%3A1") for the same request — so the id's ":" must
 * survive both. We decode defensively here (the single parse chokepoint) rather
 * than at each route boundary. decodeURIComponent throws on a malformed escape,
 * so fall back to the raw input, which then fails the regex and returns null —
 * the same outcome as before for genuinely invalid ids. Decoding is idempotent
 * for already-clean ids (no "%"), so request-body callers are unaffected.
 */
export function parseHadithId(id: string): { collection: string; urn: number } | null {
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    // malformed percent-encoding — keep the raw input; the regex below rejects it
  }
  const m = decoded.match(/^([a-z][a-z0-9_-]*):(\d+)$/i);
  if (!m) return null;
  const urn = Number.parseInt(m[2] ?? "", 10);
  if (!Number.isFinite(urn)) return null;
  return { collection: (m[1] ?? "").toLowerCase(), urn };
}

/** Back-compat: build a "bukhari:URN" id. Prefer makeHadithId for new code. */
export function makeBukhariId(arabicURN: number): string {
  return makeHadithId("bukhari", arabicURN);
}

/** Back-compat: parse "bukhari:N" → N (null for any other collection/shape). */
export function parseBukhariId(id: string): number | null {
  const parsed = parseHadithId(id);
  return parsed && parsed.collection === "bukhari" ? parsed.urn : null;
}

/**
 * Pull the canonical hadith number out of the raw varchar field for the
 * numeric `hadith_number` (used for sorting / a stable fallback). Combined
 * narrations are comma-joined ("521, 522") and some collections add a letter
 * suffix ("8 a") — we take the first integer.
 */
function parsePrimaryHadithNumber(raw: string | null): number | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  if (!first) return null;
  const m = first.match(/\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Tidy the display reference: "8 a" → "8a", trims surrounding space, keeps
 * comma-joined values ("521, 522") intact. Returns null for empty input.
 */
function normalizeHadithNumberLabel(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  return t.replace(/(\d)\s+([A-Za-z])/g, "$1$2");
}

/**
 * Map a raw book-number string to a best-effort int (for the legacy book
 * filter / sorting) plus a human label. "introduction" → { num: 0,
 * label: "Introduction" }; "35b" → { num: 35, label: "Book 35b" }.
 */
function parseBookNumber(raw: string | null): { num: number; label: string | null } {
  if (!raw) return { num: 0, label: null };
  const t = raw.trim();
  if (!t) return { num: 0, label: null };
  if (t.toLowerCase() === "introduction") return { num: 0, label: "Introduction" };
  const m = t.match(/^(\d+)/);
  const num = m ? Number.parseInt(m[1] ?? "", 10) : 0;
  return { num: Number.isFinite(num) ? num : 0, label: `Book ${t}` };
}

function inBookRef(bookLabel: string | null, seq: number): string {
  return `${bookLabel ?? "Book 0"}, Hadith ${seq}`;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Map a generic collection RPC row to the SearchResult contract. Cleans markup,
 * extracts the narrator, and synthesizes the reference labels.
 */
export function mapSearchRow(row: HadithRow): SearchResult {
  const seq = row.our_hadith_number ?? 0;
  const numLabel = normalizeHadithNumberLabel(row.hadith_number_raw);
  const globalN = parsePrimaryHadithNumber(row.hadith_number_raw) ?? seq;
  const { num: book, label: bookLabel } = parseBookNumber(row.book_number_raw);
  const cleanedAr = cleanArabicText(row.arabic_text);
  const narrator = extractNarratorFromEnglish(row.english_text);
  return {
    id: makeHadithId(row.collection, row.arabic_urn),
    collection: row.collection,
    hadith_number: globalN,
    hadith_number_label: numLabel ?? String(globalN),
    book_number: book,
    book_name_en: bookLabel ?? `Book ${book}`,
    chapter_title_en: row.english_bab_name?.trim() || null,
    in_book_ref: inBookRef(bookLabel, seq),
    usc_msa_ref: null,
    narrator,
    text_en_full: stripNarratorPrefix(row.english_text),
    text_ar: cleanedAr || null,
    ...(typeof row.score === "number" ? { relevance: clamp01(row.score) } : {}),
  };
}

/**
 * Map a generic collection RPC row to the richer Hadith record used by detail /
 * browse pages. The grade's grader is the collection's display name.
 */
export function mapHadithRow(row: HadithRow): Hadith {
  const seq = row.our_hadith_number ?? 0;
  const numLabel = normalizeHadithNumberLabel(row.hadith_number_raw);
  const globalN = parsePrimaryHadithNumber(row.hadith_number_raw) ?? seq;
  const { num: book, label: bookLabel } = parseBookNumber(row.book_number_raw);
  const cleanedAr = cleanArabicText(row.arabic_text);
  // Body-only English (narrator prefix removed). Every consumer renders the
  // narrator on its own line, so keeping "Narrated X:" would print it twice.
  const bodyEn = stripNarratorPrefix(row.english_text);
  const narrator = extractNarratorFromEnglish(row.english_text);
  // One grade entry, graded by the collection itself, carrying both the English
  // ("Sahih") and Arabic ("صحيح") forms. Emitted only when an English grade
  // exists (the Arabic grade rides alongside it).
  const grades: { grader: string; grade: string; grade_ar: string | null }[] = [];
  if (row.english_grade) {
    grades.push({
      grader: collectionName(row.collection),
      grade: row.english_grade,
      grade_ar: row.arabic_grade?.trim() || null,
    });
  }
  return {
    id: makeHadithId(row.collection, row.arabic_urn),
    collection: row.collection,
    hadith_number: globalN,
    hadith_number_label: numLabel ?? String(globalN),
    arabic_number: null,
    book_number: book,
    book_name_en: bookLabel ?? `Book ${book}`,
    chapter_number: null,
    chapter_title_en: row.english_bab_name?.trim() || null,
    chapter_title_ar: cleanArabicText(row.arabic_bab_name) || null,
    in_book_ref: inBookRef(bookLabel, seq),
    usc_msa_ref: null,
    narrator,
    narrator_normalized: narrator ? normalizeNarrator(narrator) : null,
    text_en: bodyEn,
    text_en_full: bodyEn,
    text_ar: cleanedAr || null,
    grades: grades.length > 0 ? grades : null,
    urn: row.arabic_urn,
    language: "en",
  };
}

/** Adapt a legacy bukhari RPC row to the generic shape (collection = bukhari). */
function bukhariRowToGeneric(row: BukhariRpcRow): HadithRow {
  return {
    collection: "bukhari",
    arabic_urn: row.arabic_urn,
    book_number_raw: row.book_number == null ? null : String(row.book_number),
    hadith_number_raw: row.hadith_number_raw,
    our_hadith_number: row.our_hadith_number,
    english_bab_name: row.english_bab_name,
    arabic_bab_name: row.arabic_bab_name,
    english_text: row.english_text,
    arabic_text: row.arabic_text,
    english_grade: row.english_grade,
    arabic_grade: row.arabic_grade,
    ...(row.score !== undefined ? { score: row.score } : {}),
  };
}

/** Map a legacy bukhari RPC row to SearchResult (delegates to the generic path). */
export function mapRowToSearchResult(row: BukhariRpcRow): SearchResult {
  return mapSearchRow(bukhariRowToGeneric(row));
}

/** Map a legacy bukhari RPC row to Hadith (delegates to the generic path). */
export function mapRowToHadith(row: BukhariRpcRow): Hadith {
  return mapHadithRow(bukhariRowToGeneric(row));
}
