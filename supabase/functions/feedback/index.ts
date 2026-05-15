// =============================================================================
// supabase/functions/feedback/index.ts — thumbs up/down on a search result
// =============================================================================
//
// Per plan/01-search-api.md §Phase 2 "feedback endpoint" and the
// `FeedbackRequestSchema` contract in packages/shared-types/src/index.ts.
//
// POST /functions/v1/feedback with JSON body:
//   { query_hash: string(64), hadith_id: string, position: number, thumb: "up"|"down" }
//
// Response: 204 No Content on success; 400 on bad payload; 500 on insert error.
//
// Auth: optional. The function captures `auth.uid()` from the JWT if present
// so signed-in feedback can be deduped per user, but anonymous-JWT feedback
// is also allowed (Supabase issues anon JWTs to every visitor).
//
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Mirrors FeedbackRequestSchema in packages/shared-types/src/index.ts.
const FeedbackRequestSchema = z.object({
  query_hash: z.string().length(64),
  hadith_id: z.string().min(1).max(64),
  position: z.number().int().min(0),
  thumb: z.enum(["up", "down"]),
});

async function userIdFromAuth(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  try {
    const { data, error } = await supabase.auth.getUser(auth.slice(7));
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, { status: 405 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = FeedbackRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { error: "invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userId = await userIdFromAuth(req);

  const { error } = await supabase.from("feedback").insert({
    user_id: userId,
    query_hash: parsed.data.query_hash,
    hadith_id: parsed.data.hadith_id,
    position: parsed.data.position,
    thumb: parsed.data.thumb,
  });

  if (error) {
    console.error("feedback insert failed:", error.message);
    return jsonResponse({ error: "insert failed" }, { status: 500 });
  }

  // 204 No Content per spec.
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
});
