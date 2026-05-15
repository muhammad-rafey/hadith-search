import { z } from "zod";

/**
 * Search request/response schemas shared between the web app and the
 * Supabase Edge Function. The schema is the contract between the two.
 */

export const LanguageSchema = z.enum(["en", "ar", "ur"]);
export type Language = z.infer<typeof LanguageSchema>;

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  book: z.number().int().positive().optional(),
  narrator: z.string().min(1).max(100).optional(),
  language: LanguageSchema.default("en"),
  topK: z.number().int().min(1).max(20).default(10),
  /** When true, skip cache READ and cache WRITE for this request (Private mode). */
  skip_cache: z.boolean().optional(),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const SearchResultSchema = z.object({
  id: z.string(),
  hadith_number: z.number().int(),
  book_number: z.number().int(),
  book_name_en: z.string(),
  chapter_title_en: z.string().nullable(),
  in_book_ref: z.string(),
  usc_msa_ref: z.string().nullable(),
  narrator: z.string().nullable(),
  text_en_full: z.string(),
  text_ar: z.string().nullable(),
  relevance: z.number().min(0).max(1).optional(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchModeSchema = z.enum(["reference", "cache", "fresh", "empty"]);
export type SearchMode = z.infer<typeof SearchModeSchema>;

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  mode: SearchModeSchema,
  latency_ms: z.number().int().nonnegative(),
  degraded: z.boolean().optional(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/**
 * Hadith record as stored in the `hadiths` table. Schema is placeholder
 * pending the user-provided data dump (see plan/05-roadmap.md Phase 1).
 */
export const HadithSchema = z.object({
  id: z.string(),
  collection: z.string(),
  hadith_number: z.number().int(),
  arabic_number: z.number().int().nullable(),
  book_number: z.number().int(),
  book_name_en: z.string(),
  chapter_number: z.number().int().nullable(),
  chapter_title_en: z.string().nullable(),
  in_book_ref: z.string(),
  usc_msa_ref: z.string().nullable(),
  narrator: z.string().nullable(),
  narrator_normalized: z.string().nullable(),
  text_en: z.string(),
  text_en_full: z.string(),
  text_ar: z.string().nullable(),
  grades: z.array(z.object({ grader: z.string(), grade: z.string() })).nullable(),
  urn: z.number().int().nullable(),
  language: LanguageSchema,
});
export type Hadith = z.infer<typeof HadithSchema>;

/**
 * Lightweight book record used by the Browse UI.
 * Matches the shape produced by MOCK_BOOKS and the hadiths table projection.
 */
export const BookSchema = z.object({
  book_number: z.number().int().positive(),
  book_name_en: z.string(),
});
export type Book = z.infer<typeof BookSchema>;

/**
 * Feedback request: thumbs up/down on a search result.
 *
 * query_hash must be the lowercase hex SHA-256 of the canonical query key
 * (64 hex chars). This regex enforces that contract and prevents accidental
 * logging of raw query strings.
 *
 * hadith_id length cap is 100 to accommodate real-world IDs such as
 * "bukhari:7563" without being overly restrictive.
 */
export const FeedbackRequestSchema = z.object({
  query_hash: z.string().regex(/^[0-9a-f]{64}$/, {
    message: "query_hash must be 64 lowercase hex characters (SHA-256)",
  }),
  hadith_id: z.string().max(100),
  position: z.number().int().min(0),
  thumb: z.enum(["up", "down"]),
});
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export { MOCK_HADITHS, MOCK_BOOKS } from "./mock-hadiths";
