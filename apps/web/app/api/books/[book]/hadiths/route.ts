import { NextResponse } from "next/server";

import { BukhariRpcRowSchema, mapRowToHadith } from "@hadith/shared-types";

import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ book: string }> },
) {
  const { book } = await ctx.params;
  // Reject "12abc" or other near-numeric strings up front.
  if (!/^\d+$/.test(book)) {
    return NextResponse.json({ error: "invalid_book" }, { status: 400 });
  }
  const bookNumber = Number.parseInt(book, 10);
  if (!Number.isFinite(bookNumber) || bookNumber <= 0) {
    return NextResponse.json({ error: "invalid_book" }, { status: 400 });
  }
  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 500);
  // Bukhari has ~7k hadiths total; 10k offset is plenty.
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 10_000);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("get_bukhari_book_hadiths", {
    p_book: bookNumber,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.error("/api/books/[book]/hadiths error:", error.message.slice(0, 200));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  const rows = ((data ?? []) as unknown[])
    .map((r) => BukhariRpcRowSchema.safeParse(r))
    .filter((p): p is { success: true; data: ReturnType<typeof BukhariRpcRowSchema.parse> } => p.success)
    .map((p) => mapRowToHadith(p.data));

  return NextResponse.json(
    { book_number: bookNumber, hadiths: rows },
    { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  );
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  if (!raw) return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}
