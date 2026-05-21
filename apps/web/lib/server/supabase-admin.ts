import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedAdmin: SupabaseClient | undefined;
let cachedAnon: SupabaseClient | undefined;

/**
 * Supabase client used by Next.js API routes.
 *
 * Prefers the service-role key (bypasses RLS — required for writes to
 * query_cache, search_logs, feedback). Falls back to the anon key when only
 * the anon key is available, so search reads still work in a "degraded"
 * deployment that hasn't provisioned the service role key. In that mode the
 * write-paths (cache/log/feedback) will be rejected by RLS — those failures
 * are logged but never thrown.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be set.");
  }
  const key = serviceKey || anonKey;
  if (!key) {
    throw new Error(
      "Supabase server client unavailable: set SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  if (!serviceKey) {
    console.warn(
      "[supabase-admin] using anon key; cache + log + feedback writes will be rejected by RLS until SUPABASE_SERVICE_ROLE_KEY is set.",
    );
  }
  cachedAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "hadith-search-web" } },
  });
  return cachedAdmin;
}

/** True when the server has a real service-role key (writes will succeed). */
export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Anon client. Used only for verifying a forwarded user JWT in
 * `apps/web/lib/server/auth.ts`. Never used for actual data access.
 */
export function getSupabaseAnonClient(): SupabaseClient | null {
  if (cachedAnon) return cachedAnon;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  cachedAnon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAnon;
}
