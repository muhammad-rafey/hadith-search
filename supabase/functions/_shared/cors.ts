// =============================================================================
// _shared/cors.ts — reusable CORS helpers for hadith-search Edge Functions
// =============================================================================
//
// v1: open `*` origin so the web app + curl + the uptime canary all work
// without per-request configuration.
// TODO §6.2 (plan/01-search-api.md): tighten CORS `*` to the production web
// app origin once the domain is known and DNS is confirmed. Replace `*` with
// the explicit allow-list and add a dynamic origin-check helper.
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

/**
 * Returns a 204 No Content response with CORS headers.
 * Use for successful mutations that return no body (e.g. feedback endpoint).
 */
export function noContentResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}
