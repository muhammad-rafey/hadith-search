import "server-only";

import { type SupabaseClient, createClient } from "@supabase/supabase-js";

let cachedAnonClient: SupabaseClient | undefined;

function getAnonClient(): SupabaseClient | null {
  if (cachedAnonClient) return cachedAnonClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  cachedAnonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAnonClient;
}

/**
 * Resolve a Supabase user from the `Authorization: Bearer <jwt>` header that
 * the browser forwards explicitly. Returns null when the header is missing or
 * the JWT is rejected. Never throws on auth failures.
 *
 * Uses a module-cached anon client (not the admin client) so the JWT actually
 * drives validation. `getUser(token)` takes the JWT explicitly and doesn't
 * mutate the client's session state, so sharing the cached client across
 * requests is safe. Adds 50–200 ms latency per authenticated call (Auth API
 * roundtrip) — acceptable for v1; swap for local JWT signature verification
 * if this becomes a hotspot.
 */
export async function userIdFromRequest(req: Request): Promise<string | null> {
  const client = getAnonClient();
  if (!client) return null;
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];
  if (!token) return null;
  try {
    const { data } = await client.auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
