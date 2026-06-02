import "server-only";

import { cache } from "react";

import {
  BukhariRpcRowSchema,
  type Hadith,
  makeBukhariId,
  mapRowToHadith,
  MOCK_HADITHS,
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

// These run during static generation / ISR (browse, detail, sitemap), so a DB
// read must FAIL FAST rather than hang Next's per-page timeout — e.g. against an
// unreachable DB during a CI build with placeholder Supabase env. A real prod
// read returns in well under this; on timeout the helpers below catch the abort
// and return empty, so the page prerenders blank and revalidates later.
const RPC_TIMEOUT_MS = Number(process.env.BUILD_RPC_TIMEOUT_MS ?? 15000);

/**
 * Offline / placeholder fallback. When `NEXT_PUBLIC_SUPABASE_URL` is unset or
 * the placeholder host (a CI build, or local dev with no project), the DB is
 * unreachable — serving the bundled `MOCK_HADITHS` keeps browse/detail/sitemap
 * working AND lets `next build` prerender without hanging on a doomed fetch.
 * Production has a real URL, so this never triggers there.
 */
function isPlaceholderSupabase(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return (
    url === "" ||
    url.includes("placeholder.supabase.co") ||
    url.includes("your-project-ref.supabase.co")
  );
}

function mockBooks(): BookSummary[] {
  const counts = new Map<number, { name: string; n: number }>();
  for (const h of MOCK_HADITHS) {
    const cur = counts.get(h.book_number) ?? { name: `Book ${h.book_number}`, n: 0 };
    cur.n += 1;
    counts.set(h.book_number, cur);
  }
  return [...counts.entries()]
    .map(([book_number, { name, n }]) => ({ book_number, book_name_en: name, hadith_count: n }))
    .sort((a, b) => a.book_number - b.book_number);
}

/**
 * `cache()` dedupes the call within a single React render pass — e.g. the
 * detail page's metadata + body call `getHadithById` separately but only
 * pay for one RPC.
 */
export const getAllBooks = cache(async (): Promise<BookSummary[]> => {
  if (isPlaceholderSupabase()) return mockBooks();
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .rpc("get_bukhari_book_list")
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
    if (error) {
      console.error("getAllBooks rpc error:", error.message.slice(0, 200));
      return [];
    }
    const rows = (data ?? []) as { book_number: number | null; hadith_count: number }[];
    return rows
      .filter(
        (r): r is { book_number: number; hadith_count: number } =>
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
});

export const getBookByNumber = cache(async (bookNumber: number): Promise<BookSummary | null> => {
  const all = await getAllBooks();
  return all.find((b) => b.book_number === bookNumber) ?? null;
});

export const getHadithsForBook = cache(async (bookNumber: number): Promise<Hadith[]> => {
  if (isPlaceholderSupabase()) return MOCK_HADITHS.filter((h) => h.book_number === bookNumber);
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .rpc("get_bukhari_book_hadiths", {
        p_book: bookNumber,
        p_limit: 500,
        p_offset: 0,
      })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
    if (error) {
      console.error("getHadithsForBook rpc error:", error.message.slice(0, 200));
      return [];
    }
    return ((data ?? []) as unknown[])
      .map((r) => BukhariRpcRowSchema.safeParse(r))
      .filter(
        (p): p is { success: true; data: ReturnType<typeof BukhariRpcRowSchema.parse> } =>
          p.success,
      )
      .map((p) => mapRowToHadith(p.data));
  } catch (err) {
    console.error("getHadithsForBook failed:", err instanceof Error ? err.message : err);
    return [];
  }
});

export const getHadithById = cache(async (id: string): Promise<Hadith | null> => {
  const value = parseBukhariId(id);
  if (value === null) return null;
  if (isPlaceholderSupabase())
    return MOCK_HADITHS.find((h) => h.urn === value || h.hadith_number === value) ?? null;
  try {
    const supabase = getSupabaseAdmin();
    const tryRpc = async (
      rpc: "get_bukhari_hadith_by_urn" | "get_bukhari_hadith_by_number",
      args: Record<string, number>,
    ) => {
      const { data, error } = await supabase
        .rpc(rpc, args)
        .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
      if (error || !data) return null;
      const first = (data as unknown[])[0];
      if (!first) return null;
      const parsed = BukhariRpcRowSchema.safeParse(first);
      return parsed.success ? mapRowToHadith(parsed.data) : null;
    };
    const first =
      value >= 10000
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
});

/**
 * Used by the sitemap generator. Goes through `get_bukhari_hadith_ids` which
 * returns only URNs — orders of magnitude faster than the per-book hadith
 * pull the original implementation used (which timed out on Vercel).
 */
export const getAllHadithIds = cache(async (): Promise<string[]> => {
  if (isPlaceholderSupabase()) return MOCK_HADITHS.map((h) => h.id);
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .rpc("get_bukhari_hadith_ids")
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
    if (error) {
      console.error("getAllHadithIds rpc error:", error.message.slice(0, 200));
      return [];
    }
    return ((data ?? []) as { arabic_urn: number }[])
      .filter((r) => typeof r.arabic_urn === "number")
      .map((r) => makeBukhariId(r.arabic_urn));
  } catch (err) {
    console.error("getAllHadithIds failed:", err instanceof Error ? err.message : err);
    return [];
  }
});
