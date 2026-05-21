import { NextResponse } from "next/server";

import { FeedbackRequestSchema, parseBukhariId } from "@hadith/shared-types";

import { userIdFromRequest } from "@/lib/server/auth";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = checkRateLimit(clientKeyFromRequest(req));
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = FeedbackRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const urn = parseBukhariId(parsed.data.hadith_id);
  if (urn === null) {
    return NextResponse.json({ error: "invalid_hadith_id" }, { status: 400 });
  }

  const userId = await userIdFromRequest(req);
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("feedback").upsert(
    {
      user_id: userId,
      query_hash: parsed.data.query_hash,
      hadith_id: urn,
      position: parsed.data.position,
      thumb: parsed.data.thumb,
    },
    { onConflict: "user_id,query_hash,hadith_id,thumb", ignoreDuplicates: true },
  );

  if (error) {
    console.error("/api/feedback error:", error.message.slice(0, 200));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
