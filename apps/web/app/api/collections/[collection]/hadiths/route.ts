import { NextResponse } from "next/server";

import { isKnownCollection } from "@hadith/shared-types";

import { getCollectionHadiths } from "@/lib/hadiths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One page of a collection in canonical reading order. */
export async function GET(req: Request, ctx: { params: Promise<{ collection: string }> }) {
  const { collection } = await ctx.params;
  if (!isKnownCollection(collection)) {
    return NextResponse.json({ error: "invalid_collection" }, { status: 400 });
  }
  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 200);
  // Largest collection (~7.5k); 100k offset is comfortably beyond any of them.
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100_000);

  const hadiths = await getCollectionHadiths(collection, limit, offset);
  return NextResponse.json(
    { collection, limit, offset, hadiths },
    { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  );
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  if (!raw) return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}
