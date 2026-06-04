import "server-only";

import { cache } from "react";

import {
  BukhariRpcRowSchema,
  type Hadith,
  HadithRowSchema,
  makeBukhariId,
  mapHadithRow,
  mapRowToHadith,
  MOCK_HADITHS,
  parseHadithId,
} from "@hadith/shared-types";

import { numEnv } from "@/lib/server/env";
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
const RPC_TIMEOUT_MS = numEnv("BUILD_RPC_TIMEOUT_MS", 15000, { min: 1 });

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
  const parsed = parseHadithId(id);
  if (!parsed) return null;
  const { collection, urn } = parsed;
  if (isPlaceholderSupabase())
    return (
      MOCK_HADITHS.find((h) => h.id === id || h.urn === urn || h.hadith_number === urn) ?? null
    );
  try {
    const supabase = getSupabaseAdmin();
    const tryRpc = async (
      rpc: "get_hadith_by_collection_urn" | "get_hadith_by_collection_number",
      args: Record<string, string | number>,
    ): Promise<Hadith | null> => {
      const { data, error } = await supabase
        .rpc(rpc, args)
        .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
      if (error || !data) return null;
      const first = (data as unknown[])[0];
      if (!first) return null;
      const p = HadithRowSchema.safeParse(first);
      return p.success ? mapHadithRow(p.data) : null;
    };
    // Real URNs are large (≥100k); a small value is a legacy
    // "{collection}:{hadithNumber}" link, so fall back to a number lookup when
    // the URN misses. URNs and hadith numbers don't overlap, so no ambiguity.
    // Skip the URN probe past int4 max — it can't be a real URN and would only
    // provoke a Postgres overflow error (caught, but a wasted round-trip).
    const byUrn =
      urn <= 2_147_483_647
        ? await tryRpc("get_hadith_by_collection_urn", { p_collection: collection, p_urn: urn })
        : null;
    if (byUrn) return byUrn;
    return tryRpc("get_hadith_by_collection_number", {
      p_collection: collection,
      p_number: String(urn),
    });
  } catch (err) {
    console.error("getHadithById failed:", err instanceof Error ? err.message : err);
    return null;
  }
});

export interface CollectionSummary {
  collection: string;
  hadith_count: number;
}

/** All 15 collections + counts, for the Browse landing. */
export const getCollectionList = cache(async (): Promise<CollectionSummary[]> => {
  if (isPlaceholderSupabase())
    return [{ collection: "bukhari", hadith_count: MOCK_HADITHS.length }];
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .rpc("get_collection_list")
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
    if (error) {
      console.error("getCollectionList rpc error:", error.message.slice(0, 200));
      return [];
    }
    return ((data ?? []) as { collection: string | null; hadith_count: number }[])
      .filter(
        (r): r is CollectionSummary => typeof r.collection === "string" && r.collection.length > 0,
      )
      .map((r) => ({ collection: r.collection, hadith_count: r.hadith_count }));
  } catch (err) {
    console.error("getCollectionList failed:", err instanceof Error ? err.message : err);
    return [];
  }
});

/** One page of a collection in canonical reading order. */
export const getCollectionHadiths = cache(
  async (collection: string, limit = 50, offset = 0): Promise<Hadith[]> => {
    if (isPlaceholderSupabase())
      return collection === "bukhari" ? MOCK_HADITHS.slice(offset, offset + limit) : [];
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .rpc("get_collection_hadiths", {
          p_collection: collection,
          p_limit: limit,
          p_offset: offset,
        })
        .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
      if (error) {
        console.error("getCollectionHadiths rpc error:", error.message.slice(0, 200));
        return [];
      }
      return ((data ?? []) as unknown[])
        .map((r) => HadithRowSchema.safeParse(r))
        .filter(
          (p): p is { success: true; data: ReturnType<typeof HadithRowSchema.parse> } => p.success,
        )
        .map((p) => mapHadithRow(p.data));
    } catch (err) {
      console.error("getCollectionHadiths failed:", err instanceof Error ? err.message : err);
      return [];
    }
  },
);

/** Resolve a hadith by its display number within a collection (jump-by-number). */
export const getHadithByNumber = cache(
  async (collection: string, num: string): Promise<Hadith | null> => {
    if (isPlaceholderSupabase()) {
      // Match the RPC's whitespace/case-insensitive comparison so offline jump
      // -by-number behaves like prod ("8a" must find a stored "8 a").
      const normalized = num.toLowerCase().replace(/\s+/g, "");
      return (
        MOCK_HADITHS.find(
          (h) =>
            h.collection === collection &&
            h.hadith_number_label.toLowerCase().replace(/\s+/g, "") === normalized,
        ) ?? null
      );
    }
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .rpc("get_hadith_by_collection_number", { p_collection: collection, p_number: num })
        .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
      if (error || !data) return null;
      const first = (data as unknown[])[0];
      if (!first) return null;
      const p = HadithRowSchema.safeParse(first);
      return p.success ? mapHadithRow(p.data) : null;
    } catch (err) {
      console.error("getHadithByNumber failed:", err instanceof Error ? err.message : err);
      return null;
    }
  },
);

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
