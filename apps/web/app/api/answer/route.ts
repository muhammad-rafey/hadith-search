import { NextResponse } from "next/server";

import { AnswerRequestSchema, AnswerResponseSchema } from "@hadith/shared-types";

import { userIdFromRequest } from "@/lib/server/auth";
import { generateAnswer } from "@/lib/server/answer";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Generation is slower than search and runs a search internally first, so this
// budget must exceed ANSWER_TIMEOUT_MS (default 12s) plus the embed + rerank
// budget of the nested runSearch. 30s leaves headroom.
export const maxDuration = 30;

export async function POST(req: Request) {
  const rl = checkRateLimit(clientKeyFromRequest(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  // Bound the body — the schema caps query at 500 chars, so a valid request is
  // a few KB. Reject oversize payloads before parsing JSON.
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 16_000) {
    return NextResponse.json({ error: "request_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = AnswerRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userId = await userIdFromRequest(req);

  try {
    const resp = await generateAnswer(parsed.data, userId);
    const validated = AnswerResponseSchema.parse(resp);
    return NextResponse.json(validated);
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error("/api/answer error:", msg);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
