"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * fetch wrapper that forwards the Supabase anon JWT in the Authorization
 * header. The Next.js API routes use this to attribute requests to a user_id
 * (anonymous sign-in) without exposing the service role key to the browser.
 *
 * Falls back to a plain fetch if no session is available — the API route
 * still works, it just logs user_id: null.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const supabase = getSupabaseBrowserClient();
  let token: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  } catch {
    // Anonymous auth might not yet have settled; proceed without auth.
  }
  const headers = new Headers(init.headers);
  headers.set("content-type", headers.get("content-type") ?? "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
