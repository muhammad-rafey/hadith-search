import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// CDN-level caching — Vercel honors s-maxage on edge. revalidate is omitted
// here so the build doesn't try to prerender this route (which would require
// DB credentials at build time).

export type BookListEntry = {
  book_number: number;
  book_name_en: string;
  hadith_count: number;
};

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("get_bukhari_book_list");
  if (error) {
    console.error("/api/books error:", error.message.slice(0, 200));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  const rows = (data ?? []) as { book_number: number; hadith_count: number }[];
  const books: BookListEntry[] = rows
    .filter((r) => typeof r.book_number === "number" && r.book_number > 0)
    .map((r) => ({
      book_number: r.book_number,
      book_name_en: `Book ${r.book_number}`,
      hadith_count: r.hadith_count,
    }));
  return NextResponse.json(books, {
    headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=3600" },
  });
}
