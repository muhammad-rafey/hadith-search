import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "./env";

/**
 * RN Supabase client. @supabase/ssr (used by the web app) is browser-only,
 * so mobile uses the plain SDK with the documented React Native auth config:
 * AsyncStorage for session persistence, no URL session detection.
 */
let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/**
 * Mirrors apps/web/lib/supabase/client.ts isPlaceholderSupabase(). When true,
 * the app runs entirely against MOCK_HADITHS — no network, fully usable.
 */
export function isPlaceholderSupabase(): boolean {
  const url = ENV.SUPABASE_URL;
  return (
    url === "" ||
    url.includes("placeholder.supabase.co") ||
    url.includes("your-project-ref.supabase.co")
  );
}
