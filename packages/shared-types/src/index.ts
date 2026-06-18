import { z } from "zod";

/**
 * Search request/response schemas — the API contract shared between the
 * Next.js BFF (apps/web/app/api/*) and both clients (web UI + Expo mobile).
 */

export const LanguageSchema = z.enum(["en", "ar", "ur"]);
export type Language = z.infer<typeof LanguageSchema>;

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  language: LanguageSchema.default("en"),
  topK: z.number().int().min(1).max(20).default(10),
  /** When true, skip cache READ and cache WRITE for this request (Private mode). */
  skip_cache: z.boolean().optional(),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const SearchResultSchema = z.object({
  id: z.string(),
  /** Collection slug, e.g. "bukhari" / "muslim". Parsed from `id`. */
  collection: z.string(),
  hadith_number: z.number().int(),
  /** Display reference, e.g. "8a" / "521, 522". Use this over hadith_number for UI. */
  hadith_number_label: z.string(),
  book_number: z.number().int(),
  book_name_en: z.string(),
  chapter_title_en: z.string().nullable(),
  in_book_ref: z.string(),
  usc_msa_ref: z.string().nullable(),
  narrator: z.string().nullable(),
  text_en_full: z.string(),
  text_ar: z.string().nullable(),
  /**
   * Urdu translation (isnad + matn combined), cleaned. `.nullish()` keeps the
   * contract backward-compatible: an older client tolerates its absence, and a
   * pre-Urdu `query_cache` row still parses on read instead of churning.
   */
  text_ur: z.string().nullish(),
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
 * RAG answer request/response — the contract for the grounded-answer endpoint
 * (`/api/answer`), shared between the BFF and both clients. The endpoint
 * re-runs the search pipeline internally from `query`, so the client only
 * sends the question (not the retrieved hadiths) and the answer is always
 * grounded in the same results the search response returns.
 */
export const AnswerRequestSchema = z.object({
  query: z.string().min(1).max(500),
  language: LanguageSchema.default("en"),
  /** How many top hadiths to ground the answer in. */
  topK: z.number().int().min(1).max(20).default(8),
  /** When true, skip the answer + search cache read/write (Private mode). */
  skip_cache: z.boolean().optional(),
});
export type AnswerRequest = z.infer<typeof AnswerRequestSchema>;

/**
 * - `answered`  — the model produced a grounded answer with citations.
 * - `abstained` — retrieval found nothing strong enough, or generation is
 *   unavailable/disabled; `answer` carries a plain "couldn't find" message and
 *   `citations` is empty. NEVER a fabricated answer.
 * - `degraded`  — retrieval/generation was unreliable (provider outage, embed
 *   fallback); treated like an abstention so we never synthesize over bad data.
 */
export const AnswerStatusSchema = z.enum(["answered", "abstained", "degraded"]);
export type AnswerStatus = z.infer<typeof AnswerStatusSchema>;

/**
 * A hadith the answer drew on. `hadith_id` joins back to a `SearchResult.id`
 * so the UI can label and link the cited hadith in the results list below.
 */
export const AnswerCitationSchema = z.object({
  hadith_id: z.string(),
  hadith_number_label: z.string(),
  in_book_ref: z.string(),
  collection: z.string(),
});
export type AnswerCitation = z.infer<typeof AnswerCitationSchema>;

export const AnswerResponseSchema = z.object({
  answer: z.string(),
  status: AnswerStatusSchema,
  citations: z.array(AnswerCitationSchema),
  /** Generation model id used, or "" when abstained without calling a model. */
  model: z.string(),
  latency_ms: z.number().int().nonnegative(),
  degraded: z.boolean().optional(),
});
export type AnswerResponse = z.infer<typeof AnswerResponseSchema>;

/**
 * Richer hadith record used by the detail / browse pages. Produced by
 * mapRowToHadith from a `hadith_table` RPC row (see map.ts). `text_en` and
 * `text_en_full` are both narrator-prefix-stripped; the narrator is carried
 * separately and rendered on its own line by every consumer.
 */
export const HadithSchema = z.object({
  id: z.string(),
  collection: z.string(),
  hadith_number: z.number().int(),
  /** Display reference, e.g. "8a" / "521, 522". Use this over hadith_number for UI. */
  hadith_number_label: z.string(),
  arabic_number: z.number().int().nullable(),
  book_number: z.number().int(),
  book_name_en: z.string(),
  chapter_number: z.number().int().nullable(),
  chapter_title_en: z.string().nullable(),
  /** Chapter (bab) name in Arabic, cleaned of markup. */
  chapter_title_ar: z.string().nullable(),
  in_book_ref: z.string(),
  usc_msa_ref: z.string().nullable(),
  narrator: z.string().nullable(),
  narrator_normalized: z.string().nullable(),
  text_en: z.string(),
  text_en_full: z.string(),
  text_ar: z.string().nullable(),
  /** Urdu translation (isnad + matn combined), cleaned. Null when none scraped. */
  text_ur: z.string().nullish(),
  /** `grade_ar` is the Arabic-script grade (e.g. "صحيح" for "Sahih"); null when absent. */
  grades: z
    .array(z.object({ grader: z.string(), grade: z.string(), grade_ar: z.string().nullable() }))
    .nullable(),
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

export {
  cleanArabicText,
  cleanEnglishText,
  cleanUrduText,
  splitArabicSnad,
  extractNarratorFromEnglish,
  stripNarratorPrefix,
  normalizeNarrator,
} from "./clean";

export {
  BukhariRpcRowSchema,
  type BukhariRpcRow,
  HadithRowSchema,
  type HadithRow,
  makeBukhariId,
  parseBukhariId,
  makeHadithId,
  parseHadithId,
  mapRowToSearchResult,
  mapRowToHadith,
  mapSearchRow,
  mapHadithRow,
} from "./map";

export {
  type CollectionMeta,
  COLLECTION_ORDER,
  collectionName,
  collectionArabicName,
  isKnownCollection,
  collectionMeta,
  collectionSortIndex,
} from "./collections";
