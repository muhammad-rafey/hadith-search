import { NextResponse } from "next/server";

import {
  BukhariRpcRowSchema,
  mapRowToHadith,
  parseBukhariId,
} from "@hadith/shared-types";

import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  // Next.js already decodes route params, so we don't double-decode here.
  const { id } = await ctx.params;
  const value = parseBukhariId(id);
  if (value === null) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // Try URN first for the unambiguous case (value >= 10000); else by hadith number.
  const row = await (value >= 10000
    ? lookup(supabase, "get_bukhari_hadith_by_urn", { p_urn: value })
    : lookup(supabase, "get_bukhari_hadith_by_number", { p_n: value }));

  // If the URN guess missed, fall through to hadithNumber (and vice versa).
  const finalRow =
    row ??
    (await (value >= 10000
      ? lookup(supabase, "get_bukhari_hadith_by_number", { p_n: value })
      : lookup(supabase, "get_bukhari_hadith_by_urn", { p_urn: value })));

  if (!finalRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(mapRowToHadith(finalRow), {
    headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=3600" },
  });
}

async function lookup(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rpc: "get_bukhari_hadith_by_urn" | "get_bukhari_hadith_by_number",
  args: Record<string, number>,
) {
  const { data, error } = await supabase.rpc(rpc, args);
  if (error || !data) return null;
  const first = (data as unknown[])[0];
  if (!first) return null;
  const parsed = BukhariRpcRowSchema.safeParse(first);
  return parsed.success ? parsed.data : null;
}
