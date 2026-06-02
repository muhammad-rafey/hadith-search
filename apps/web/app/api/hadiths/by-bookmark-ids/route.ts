import { NextResponse } from "next/server";
import { z } from "zod";

import { HadithRowSchema, mapHadithRow, parseHadithId } from "@hadith/shared-types";

import { checkRateLimit, clientKeyFromRequest } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-id cap fits the longest "{collection}:{urn}" (e.g. "riyadussalihin:1500010").
const RequestSchema = z.object({
  ids: z.array(z.string().min(1).max(40)).max(500),
});

export async function POST(req: Request) {
  const rl = checkRateLimit(clientKeyFromRequest(req));
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Bound body size up front — Zod will reject oversize arrays, but parsing a
  // 10 MB JSON first wastes CPU. content-length is advisory; the route is
  // still safe if missing.
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 40_000) {
    return NextResponse.json({ error: "request_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  // arabicURN is the global PK across every collection, so the URN alone
  // identifies a row — we don't need to filter by collection in the query.
  const urns = parsed.data.ids
    .map(parseHadithId)
    .filter((p): p is { collection: string; urn: number } => p !== null)
    .map((p) => p.urn);
  if (urns.length === 0) {
    return NextResponse.json({ hadiths: [] });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("hadith_table")
    .select(
      'collection,"arabicURN","bookNumber","hadithNumber","ourHadithNumber","englishBabName","arabicBabName","englishText","arabicText","englishgrade1","arabicgrade1"',
    )
    .in('"arabicURN"', urns);
  if (error) {
    console.error("/api/hadiths/by-bookmark-ids error:", error.message.slice(0, 200));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const rows = ((data ?? []) as Record<string, unknown>[])
    .map((r) =>
      HadithRowSchema.safeParse({
        collection: r.collection,
        arabic_urn: r.arabicURN,
        book_number_raw: r.bookNumber == null ? null : String(r.bookNumber),
        hadith_number_raw: r.hadithNumber,
        our_hadith_number: r.ourHadithNumber,
        english_bab_name: r.englishBabName,
        arabic_bab_name: r.arabicBabName,
        english_text: r.englishText,
        arabic_text: r.arabicText,
        english_grade: r.englishgrade1,
        arabic_grade: r.arabicgrade1,
      }),
    )
    .filter(
      (p): p is { success: true; data: ReturnType<typeof HadithRowSchema.parse> } => p.success,
    )
    .map((p) => mapHadithRow(p.data));

  // Sort to match the request order (by URN).
  const byUrn = new Map(rows.map((h) => [h.urn, h]));
  const ordered = urns
    .map((u) => byUrn.get(u))
    .filter((h): h is NonNullable<typeof h> => Boolean(h));

  return NextResponse.json({ hadiths: ordered });
}
