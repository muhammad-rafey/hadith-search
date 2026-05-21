import { NextResponse } from "next/server";
import { z } from "zod";

import {
  BukhariRpcRowSchema,
  mapRowToHadith,
  parseBukhariId,
} from "@hadith/shared-types";

import { checkRateLimit, clientKeyFromRequest } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-id cap matches the longest valid bukhari:N (URN can be ≤ 6 digits;
// "bukhari:999999" = 14 chars). 32 is generous and bounds body size.
const RequestSchema = z.object({
  ids: z.array(z.string().min(1).max(32)).max(500),
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
  if (contentLength > 32_000) {
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
  const urns = parsed.data.ids
    .map(parseBukhariId)
    .filter((n): n is number => typeof n === "number");
  if (urns.length === 0) {
    return NextResponse.json({ hadiths: [] });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("hadith_table")
    .select(
      '"arabicURN","bookNumber","hadithNumber","ourHadithNumber","englishBabName","arabicBabName","englishText","arabicText","englishgrade1","arabicgrade1"',
    )
    .eq("collection", "bukhari")
    .in('"arabicURN"', urns);
  if (error) {
    console.error("/api/hadiths/by-bookmark-ids error:", error.message.slice(0, 200));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const rows = ((data ?? []) as Record<string, unknown>[])
    .map((r) =>
      BukhariRpcRowSchema.safeParse({
        arabic_urn: r.arabicURN,
        book_number: typeof r.bookNumber === "string" ? Number.parseInt(r.bookNumber, 10) : r.bookNumber,
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
    .filter((p): p is { success: true; data: ReturnType<typeof BukhariRpcRowSchema.parse> } => p.success)
    .map((p) => mapRowToHadith(p.data));

  // Sort to match the request order.
  const byUrn = new Map(rows.map((h) => [h.urn, h]));
  const ordered = urns.map((u) => byUrn.get(u)).filter((h): h is NonNullable<typeof h> => Boolean(h));

  return NextResponse.json({ hadiths: ordered });
}
