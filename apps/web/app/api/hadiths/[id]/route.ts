import { NextResponse } from "next/server";

import { parseHadithId } from "@hadith/shared-types";

import { getHadithById } from "@/lib/hadiths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  // The App Router may hand a route handler a percent-encoded id; parseHadithId
  // decodes it defensively (see shared-types/map.ts), so this validates the same
  // way whether the platform decoded the param or not.
  const { id } = await ctx.params;
  if (!parseHadithId(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const hadith = await getHadithById(id);
  if (!hadith) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(hadith, {
    headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=3600" },
  });
}
