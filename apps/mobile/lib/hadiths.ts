import { HadithSchema, type Hadith } from "@hadith/shared-types";
import { z } from "zod";

import { apiFetch } from "@/lib/api";

/**
 * Data layer for the mobile app. Mirrors apps/web/lib/hadiths.ts. Each call
 * hits the Next.js API service at `${ENV.API_URL}/api/...` so the same
 * service backs both web and mobile.
 *
 * All calls throw on non-2xx so TanStack `error` state drives the UI
 * (retry buttons, "network error" banners) — never silently return [] or
 * null, which would render as "No bookmarks" / "Not found" and risk
 * users panic-deleting data on a transient blip. (`getHadithById` and the
 * jump-by-number lookup are the two exceptions: a genuine 404 returns null
 * so the UI shows a clean "not found" state instead of a failure banner.)
 */

/** A bukhari book, used only by the semantic-search book filter. */
export interface BookSummary {
  book_number: number;
  book_name_en: string;
  hadith_count: number;
}

/** One collection on the Browse landing (display names already resolved server-side). */
export interface CollectionSummary {
  collection: string;
  name: string;
  arabic_name: string | null;
  hadith_count: number;
}

const BookListSchema = z.array(
  z.object({
    book_number: z.number().int().positive(),
    book_name_en: z.string(),
    hadith_count: z.number().int().nonnegative(),
  }),
);

const CollectionListSchema = z.array(
  z.object({
    collection: z.string(),
    name: z.string(),
    arabic_name: z.string().nullable(),
    hadith_count: z.number().int().nonnegative(),
  }),
);

const CollectionHadithsSchema = z.object({
  collection: z.string(),
  limit: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  hadiths: z.array(HadithSchema),
});

async function jsonOrThrow<T>(res: Response, label: string, schema: z.ZodType<T>): Promise<T> {
  if (!res.ok) throw new Error(`${label} failed (${res.status})`);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new Error(`${label} response malformed`);
  return parsed.data;
}

export async function getAllBooks(): Promise<BookSummary[]> {
  const res = await apiFetch("/api/books");
  return jsonOrThrow(res, "getAllBooks", BookListSchema);
}

/** All 15 collections + counts, ordered for the Browse landing. */
export async function getCollectionList(): Promise<CollectionSummary[]> {
  const res = await apiFetch("/api/collections");
  return jsonOrThrow(res, "getCollectionList", CollectionListSchema);
}

/** One page of a collection in canonical reading order (paginate via offset). */
export async function getCollectionHadiths(
  collection: string,
  limit = 50,
  offset = 0,
): Promise<Hadith[]> {
  const res = await apiFetch(
    `/api/collections/${encodeURIComponent(collection)}/hadiths?limit=${limit}&offset=${offset}`,
  );
  const data = await jsonOrThrow(res, "getCollectionHadiths", CollectionHadithsSchema);
  return data.hadiths;
}

/**
 * Jump to a hadith by its display number within a collection (e.g. "8a").
 * 400 (bad number) and 404 (no such hadith) both return null so the caller
 * shows a "not found" hint rather than a generic failure.
 */
export async function getHadithByNumber(collection: string, num: string): Promise<Hadith | null> {
  const res = await apiFetch(
    `/api/collections/${encodeURIComponent(collection)}/lookup?number=${encodeURIComponent(num)}`,
  );
  if (res.status === 400 || res.status === 404) return null;
  return jsonOrThrow(res, "getHadithByNumber", HadithSchema);
}

export async function getHadithById(id: string): Promise<Hadith | null> {
  const res = await apiFetch(`/api/hadiths/${encodeURIComponent(id)}`);
  // 404 is meaningful — return null so the UI shows the empty state without
  // a generic "failed" banner.
  if (res.status === 404) return null;
  return jsonOrThrow(res, "getHadithById", HadithSchema);
}

export async function getHadithsByIds(ids: string[]): Promise<Hadith[]> {
  if (ids.length === 0) return [];
  const res = await apiFetch("/api/hadiths/by-bookmark-ids", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  const data = await jsonOrThrow(
    res,
    "getHadithsByIds",
    z.object({ hadiths: z.array(HadithSchema) }),
  );
  return data.hadiths;
}
