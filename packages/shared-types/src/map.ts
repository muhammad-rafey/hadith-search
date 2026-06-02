import { z } from "zod";
import {
  cleanArabicText,
  extractNarratorFromEnglish,
  normalizeNarrator,
  stripNarratorPrefix,
} from "./clean";
import type { Hadith, SearchResult } from "./index";

/**
 * Shape returned by the Bukhari RPCs (search_bukhari_hybrid,
 * get_bukhari_book_hadiths, get_bukhari_hadith_by_urn, ...). Field names use
 * snake_case to match the RPC return columns; the row mappers translate to
 * the camelCase / display-ready types the front-end already consumes.
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
 * Build the canonical "bukhari:URN" id. URN is unique across the corpus and
 * stable across re-ingest, so it's a better permalink target than hadithNumber
 * (which can be comma-joined like "521, 522" for combined-narration entries).
 */
export function makeBukhariId(arabicURN: number): string {
  return `bukhari:${arabicURN}`;
}

/**
 * Parse a "bukhari:N" id into its integer component. Returns null for any
 * other shape so callers can 404 cleanly.
 */
export function parseBukhariId(id: string): number | null {
  const m = id.match(/^bukhari:(\d+)$/i);
  if (!m) return null;
  const n = Number.parseInt(m[1] ?? "", 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pull the canonical (global Bukhari) hadith number out of the raw varchar
 * field. Combined-narration entries are stored as comma-joined values like
 * "521, 522" — we use the first number for the display + canonical link,
 * and pass the raw value through as `hadith_number_label` for fidelity.
 */
function parsePrimaryHadithNumber(raw: string | null): number | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  if (!first) return null;
  const n = Number.parseInt(first, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map a raw RPC row to the SearchResult contract the front-end already speaks.
 * Cleans markup, extracts the narrator, and synthesizes the reference labels.
 */
export function mapRowToSearchResult(row: BukhariRpcRow): SearchResult {
  const book = row.book_number ?? 0;
  const seq = row.our_hadith_number ?? 0;
  const globalN = parsePrimaryHadithNumber(row.hadith_number_raw) ?? seq;
  const cleanedAr = cleanArabicText(row.arabic_text);
  const narrator = extractNarratorFromEnglish(row.english_text);
  return {
    id: makeBukhariId(row.arabic_urn),
    hadith_number: globalN,
    book_number: book,
    book_name_en: `Book ${book}`,
    chapter_title_en: row.english_bab_name?.trim() || null,
    in_book_ref: `Book ${book}, Hadith ${seq}`,
    usc_msa_ref: null,
    narrator,
    text_en_full: stripNarratorPrefix(row.english_text),
    text_ar: cleanedAr || null,
    ...(typeof row.score === "number" ? { relevance: Math.max(0, Math.min(1, row.score)) } : {}),
  };
}

/**
 * Map a raw RPC row to the richer Hadith record used by detail / browse pages.
 * Includes grades and uses the global Bukhari hadith number as the canonical
 * display number (which matches Sunnah.com permalink conventions).
 */
export function mapRowToHadith(row: BukhariRpcRow): Hadith {
  const book = row.book_number ?? 0;
  const seq = row.our_hadith_number ?? 0;
  const globalN = parsePrimaryHadithNumber(row.hadith_number_raw) ?? seq;
  const cleanedAr = cleanArabicText(row.arabic_text);
  // Body-only English (narrator prefix removed). Every consumer renders the
  // narrator on its own line, so keeping the "Narrated X:" prefix in the text
  // fields would print the narrator twice. Mirrors mapRowToSearchResult.
  const bodyEn = stripNarratorPrefix(row.english_text);
  const narrator = extractNarratorFromEnglish(row.english_text);
  const grades: { grader: string; grade: string }[] = [];
  if (row.english_grade) {
    grades.push({ grader: "Sahih al-Bukhari", grade: row.english_grade });
  }
  return {
    id: makeBukhariId(row.arabic_urn),
    collection: "bukhari",
    hadith_number: globalN,
    arabic_number: null,
    book_number: book,
    book_name_en: `Book ${book}`,
    chapter_number: null,
    chapter_title_en: row.english_bab_name?.trim() || null,
    in_book_ref: `Book ${book}, Hadith ${seq}`,
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
