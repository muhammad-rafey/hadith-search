import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    const supabase = getSupabaseAdmin();
    // Cheap sanity ping; the RPC is stable and read-only.
    const { error } = await supabase.rpc("get_bukhari_book_list");
    if (error) {
      return NextResponse.json(
        { ok: false, latency_ms: Date.now() - start, error: error.message.slice(0, 200) },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, latency_ms: Date.now() - start });
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : "unknown";
    return NextResponse.json(
      { ok: false, latency_ms: Date.now() - start, error: msg },
      { status: 503 },
    );
  }
}
