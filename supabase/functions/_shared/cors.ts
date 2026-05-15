// =============================================================================
// _shared/cors.ts — reusable CORS helpers for hadith-search Edge Functions
// =============================================================================
//
// v1: open `*` origin so the web app + curl + the uptime canary all work
// without per-request configuration. Tighten in production once the web app's
// origin is known (see plan/01-search-api.md "Verification").
//
// =============================================================================

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/**
 * Returns a 204 preflight response if the request is an OPTIONS preflight,
 * else null. Call from the top of every Deno.serve handler.
 */
export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
}

/**
 * Wraps Response.json with CORS headers merged in.
 */
export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}
