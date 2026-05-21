import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Resolve a Supabase user from the `Authorization: Bearer <jwt>` header that
 * the browser forwards explicitly. Returns null when the header is missing or
 * the JWT is rejected. Never throws on auth failures.
 *
 * We use a one-shot anon client per call (not the admin client) so the JWT
 * actually drives validation. The admin client's service role would bypass it.
 */
export async function userIdFromRequest(req: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];
  if (!token) return null;
  try {
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
