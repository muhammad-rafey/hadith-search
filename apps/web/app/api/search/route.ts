import { NextResponse } from "next/server";

import {
  SearchRequestSchema,
  SearchResponseSchema,
} from "@hadith/shared-types";

import { userIdFromRequest } from "@/lib/server/auth";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/server/rate-limit";
import { runSearch } from "@/lib/server/search-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(req: Request) {
  const rl = checkRateLimit(clientKeyFromRequest(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = SearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userId = await userIdFromRequest(req);

  try {
    const resp = await runSearch(parsed.data, userId);
    const validated = SearchResponseSchema.parse(resp);
    return NextResponse.json(validated);
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error("/api/search error:", msg);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
