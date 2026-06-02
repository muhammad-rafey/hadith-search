import { NextResponse } from "next/server";

import { isKnownCollection } from "@hadith/shared-types";

import { getHadithByNumber } from "@/lib/hadiths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Jump to a hadith by its display number within a collection (?number=8a). */
export async function GET(req: Request, ctx: { params: Promise<{ collection: string }> }) {
  const { collection } = await ctx.params;
  if (!isKnownCollection(collection)) {
    return NextResponse.json({ error: "invalid_collection" }, { status: 400 });
  }
  const num = (new URL(req.url).searchParams.get("number") ?? "").trim();
  if (!num || num.length > 32) {
    return NextResponse.json({ error: "invalid_number" }, { status: 400 });
  }
  const hadith = await getHadithByNumber(collection, num);
  if (!hadith) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(hadith, {
    headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=3600" },
  });
}
