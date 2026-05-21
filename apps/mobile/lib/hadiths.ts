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
 * null, which would render as "No bookmarks" / "Book not found" and risk
 * users panic-deleting data on a transient blip.
 */
export interface BookSummary {
  book_number: number;
  book_name_en: string;
  hadith_count: number;
}

const BookListSchema = z.array(
  z.object({
    book_number: z.number().int().positive(),
    book_name_en: z.string(),
    hadith_count: z.number().int().nonnegative(),
  }),
);

const BookHadithsSchema = z.object({
  book_number: z.number().int().positive(),
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

export async function getBookByNumber(bookNumber: number): Promise<BookSummary | null> {
  const all = await getAllBooks();
  return all.find((b) => b.book_number === bookNumber) ?? null;
}

export async function getHadithsForBook(bookNumber: number): Promise<Hadith[]> {
  const res = await apiFetch(`/api/books/${bookNumber}/hadiths?limit=500`);
  const data = await jsonOrThrow(res, "getHadithsForBook", BookHadithsSchema);
  return data.hadiths;
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
