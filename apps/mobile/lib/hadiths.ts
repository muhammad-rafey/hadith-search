import { HadithSchema, type Hadith } from "@hadith/shared-types";
import { z } from "zod";

import { ENV } from "@/lib/env";
import { getSupabase, isPlaceholderSupabase } from "@/lib/supabase";

/**
 * Data layer for the mobile app. Mirrors apps/web/lib/hadiths.ts. Each call
 * hits the Next.js API service at `${ENV.API_URL}/api/...` so the same
 * service backs both web and mobile.
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

async function authHeader(): Promise<Record<string, string>> {
  if (isPlaceholderSupabase()) return {};
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = await authHeader();
  const headers = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
    ...auth,
  };
  return fetch(`${ENV.API_URL}${path}`, { ...init, headers });
}

export async function getAllBooks(): Promise<BookSummary[]> {
  try {
    const res = await apiFetch("/api/books");
    if (!res.ok) return [];
    const parsed = BookListSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function getBookByNumber(bookNumber: number): Promise<BookSummary | null> {
  const all = await getAllBooks();
  return all.find((b) => b.book_number === bookNumber) ?? null;
}

export async function getHadithsForBook(bookNumber: number): Promise<Hadith[]> {
  try {
    const res = await apiFetch(`/api/books/${bookNumber}/hadiths?limit=500`);
    if (!res.ok) return [];
    const parsed = BookHadithsSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.hadiths : [];
  } catch {
    return [];
  }
}

export async function getHadithById(id: string): Promise<Hadith | null> {
  try {
    const res = await apiFetch(`/api/hadiths/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const parsed = HadithSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getHadithsByIds(ids: string[]): Promise<Hadith[]> {
  if (ids.length === 0) return [];
  try {
    const res = await apiFetch("/api/hadiths/by-bookmark-ids", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return [];
    const parsed = z.object({ hadiths: z.array(HadithSchema) }).safeParse(await res.json());
    return parsed.success ? parsed.data.hadiths : [];
  } catch {
    return [];
  }
}
