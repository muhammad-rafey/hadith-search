import { NextResponse } from "next/server";

import { COHERE_AVAILABLE } from "@/lib/server/cohere";
import { getSupabaseAdmin, hasServiceRole } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health endpoint. Exposes:
 *   - `ok`: top-level DB reachability
 *   - `cohere_configured`: whether Cohere is wired up (true semantic + rerank)
 *   - `service_role`: whether writes (cache/log/feedback) will succeed
 *
 * Production monitoring should alert on `service_role: false` because the
 * app silently runs in degraded write mode otherwise.
 */
export async function GET() {
  const start = Date.now();
  const flags = {
    cohere_configured: COHERE_AVAILABLE(),
    service_role: hasServiceRole(),
  };
  try {
    const supabase = getSupabaseAdmin();
    // Cheap reachability probe — a HEAD/count on query_cache validates the
    // service-role (or anon) connection without pulling the full book aggregation.
    const { error } = await supabase
      .from("query_cache")
      .select("query_hash", { head: true, count: "exact" })
      .limit(1);
    if (error) {
      // Don't leak raw DB/PostgREST error text to anonymous callers — log it
      // server-side and return only a coarse status + the boolean flags.
      console.error("/api/health db error:", error.message.slice(0, 200));
      return NextResponse.json(
        { ok: false, latency_ms: Date.now() - start, ...flags },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, latency_ms: Date.now() - start, ...flags });
  } catch (err) {
    console.error(
      "/api/health error:",
      err instanceof Error ? err.message.slice(0, 200) : "unknown",
    );
    return NextResponse.json(
      { ok: false, latency_ms: Date.now() - start, ...flags },
      { status: 503 },
    );
  }
}
