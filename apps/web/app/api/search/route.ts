import { NextResponse } from "next/server";

import { SearchRequestSchema, SearchResponseSchema } from "@hadith/shared-types";

import { userIdFromRequest } from "@/lib/server/auth";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/server/rate-limit";
import { runSearch } from "@/lib/server/search-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Must exceed the worst-case embed + rerank timeout budget so the in-process
// AbortSignal (and the degraded fallback) fires before the platform kills the
// function. The default Cohere budget is small (EMBED_TIMEOUT_MS 1.5s +
// RERANK_TIMEOUT_MS 2s ≈ 3.5s). EMBED_PROVIDER=bge-local has a much larger
// budget (BGE_QUERY_TIMEOUT_MS 8s + BGE_RERANK_TIMEOUT_MS 20s) and is intended
// for LOCAL dev (where maxDuration is ignored) — raise this if you ever deploy
// the bge-local path.
export const maxDuration = 15;

export async function POST(req: Request) {
  const rl = checkRateLimit(clientKeyFromRequest(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  // Bound the body up front — the schema caps query at 500 chars, so a valid
  // request is a few KB. Reject oversize payloads before parsing JSON.
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
