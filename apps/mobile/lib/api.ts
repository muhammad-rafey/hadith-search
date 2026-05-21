import { ENV } from "@/lib/env";
import { getSupabase, isPlaceholderSupabase } from "@/lib/supabase";

/**
 * fetch wrapper for mobile that forwards the Supabase anon JWT in the
 * Authorization header so the Next.js API can attribute requests to a user_id.
 * Mirrors apps/web/lib/api.ts — kept here separately because the mobile
 * Supabase client lives in a different module (uses AsyncStorage).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (!isPlaceholderSupabase()) {
    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.set("authorization", `Bearer ${token}`);
    } catch {
      // Anonymous session may not have settled yet; proceed without auth.
    }
  }
  return fetch(`${ENV.API_URL}${path}`, { ...init, headers });
}
