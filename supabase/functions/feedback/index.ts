// =============================================================================
// supabase/functions/feedback/index.ts — thumbs up/down on a search result
// =============================================================================
//
// Per plan/01-search-api.md §Phase 2 "feedback endpoint" and the
// `FeedbackRequestSchema` contract in packages/shared-types/src/index.ts.
//
// POST /functions/v1/feedback with JSON body:
//   { query_hash: string(64 hex), hadith_id: string(max 100), position: number, thumb: "up"|"down" }
//
// Response: 204 No Content on success; 400 on bad payload; 500 on insert error.
//
// Auth: optional. The function captures `auth.uid()` from the JWT if present
// so signed-in feedback can be deduped per user, but anonymous-JWT feedback
// is also allowed (Supabase issues anon JWTs to every visitor).
//
// Rate limiting: a partial unique index on (user_id, query_hash, hadith_id)
// is recommended in the DB to prevent duplicate feedback submissions without
// extra application logic. Add this as a migration (not here).
//
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { handlePreflight, jsonResponse, noContentResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Mirrors FeedbackRequestSchema in packages/shared-types/src/index.ts.
// SYNC: keep in sync with packages/shared-types/src/index.ts → FeedbackRequestSchema
// Fields: query_hash (64 hex), hadith_id (max 100), position, thumb
const FeedbackRequestSchema = z.object({
  query_hash: z.string().regex(/^[0-9a-f]{64}$/, {
    message: "query_hash must be 64 lowercase hex characters (SHA-256)",
  }),
  hadith_id: z.string().max(100),
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

  // 204 No Content per spec — use shared noContentResponse() for CORS consistency.
  return noContentResponse();
});
