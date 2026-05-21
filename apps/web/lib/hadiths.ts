import "server-only";

import {
  BukhariRpcRowSchema,
  type Hadith,
  mapRowToHadith,
  parseBukhariId,
} from "@hadith/shared-types";

import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * Data layer for browse / detail / sitemap pages. Called from Server
 * Components and the sitemap loader. Goes straight to Supabase (RPC) — no
 * HTTP hop through /api/* — so it works at build time as well as on each
 * request. Client components must go through /api/* via fetch instead.
 */

export interface BookSummary {
  book_number: number;
  book_name_en: string;
  hadith_count: number;
}

export async function getAllBooks(): Promise<BookSummary[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("get_bukhari_book_list");
    if (error) {
      console.error("getAllBooks rpc error:", error.message.slice(0, 200));
      return [];
    }
    const rows = (data ?? []) as { book_number: number | null; hadith_count: number }[];
    return rows
      .filter((r): r is { book_number: number; hadith_count: number } =>
        typeof r.book_number === "number" && r.book_number > 0,
      )
      .map((r) => ({
        book_number: r.book_number,
        book_name_en: `Book ${r.book_number}`,
        hadith_count: r.hadith_count,
      }));
  } catch (err) {
    console.error("getAllBooks failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getBookByNumber(bookNumber: number): Promise<BookSummary | null> {
  const all = await getAllBooks();
  return all.find((b) => b.book_number === bookNumber) ?? null;
}

export async function getHadithsForBook(bookNumber: number): Promise<Hadith[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("get_bukhari_book_hadiths", {
      p_book: bookNumber,
      p_limit: 500,
      p_offset: 0,
    });
    if (error) {
      console.error("getHadithsForBook rpc error:", error.message.slice(0, 200));
      return [];
    }
    return ((data ?? []) as unknown[])
      .map((r) => BukhariRpcRowSchema.safeParse(r))
      .filter((p): p is { success: true; data: ReturnType<typeof BukhariRpcRowSchema.parse> } => p.success)
      .map((p) => mapRowToHadith(p.data));
  } catch (err) {
    console.error("getHadithsForBook failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getHadithById(id: string): Promise<Hadith | null> {
  const value = parseBukhariId(id);
  if (value === null) return null;
  try {
    const supabase = getSupabaseAdmin();
    const tryRpc = async (
      rpc: "get_bukhari_hadith_by_urn" | "get_bukhari_hadith_by_number",
      args: Record<string, number>,
    ) => {
      const { data, error } = await supabase.rpc(rpc, args);
      if (error || !data) return null;
      const first = (data as unknown[])[0];
      if (!first) return null;
      const parsed = BukhariRpcRowSchema.safeParse(first);
      return parsed.success ? mapRowToHadith(parsed.data) : null;
    };
    const first = value >= 10000
      ? await tryRpc("get_bukhari_hadith_by_urn", { p_urn: value })
      : await tryRpc("get_bukhari_hadith_by_number", { p_n: value });
    if (first) return first;
    return value >= 10000
      ? await tryRpc("get_bukhari_hadith_by_number", { p_n: value })
      : await tryRpc("get_bukhari_hadith_by_urn", { p_urn: value });
  } catch (err) {
    console.error("getHadithById failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Used by the sitemap generator. */
export async function getAllHadithIds(): Promise<string[]> {
  const books = await getAllBooks();
  const out: string[] = [];
  for (const b of books) {
    const list = await getHadithsForBook(b.book_number);
    for (const h of list) out.push(h.id);
  }
  return out;
}
