import * as Crypto from "expo-crypto";
import PostHog from "posthog-react-native";
import { ENV, HAS_POSTHOG } from "./env";

/**
 * Analytics — same function names and event taxonomy as
 * apps/web/lib/analytics.ts. Only the transport differs
 * (posthog-react-native instead of posthog-js, expo-crypto instead of
 * window.crypto.subtle). Privacy posture from plan/03-analytics-monitoring.md
 * is preserved verbatim: raw query text NEVER leaves the device — only the
 * SHA-256 hash and length.
 */

let posthog: PostHog | undefined;

export function getPostHog(): PostHog | undefined {
  if (!HAS_POSTHOG) return undefined;
  if (!posthog) {
    posthog = new PostHog(ENV.POSTHOG_KEY, {
      host: ENV.POSTHOG_HOST,
      // We fire an explicit taxonomy — disable auto lifecycle noise.
      captureNativeAppLifecycleEvents: false,
    });
  }
  return posthog;
}

/**
 * SHA-256 hex (lowercase, 64 chars). Byte-identical output to the web's
 * window.crypto.subtle implementation in apps/web/lib/analytics.ts.
 */
export async function sha256Hex(input: string): Promise<string> {
  try {
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, {
      encoding: Crypto.CryptoEncoding.HEX,
    });
  } catch {
    return "";
  }
}

type EventValue = string | number | boolean | null | undefined;
type EventProps = Record<string, EventValue>;

export function capture(event: string, props?: EventProps): void {
  const client = getPostHog();
  if (!client) return;
  // PostHog's property type rejects `undefined`; drop those keys.
  const clean: Record<string, string | number | boolean | null> = {};
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v !== undefined) clean[k] = v;
    }
  }
  client.capture(event, clean);
}

export function identify(distinctId: string): void {
  const client = getPostHog();
  if (!client) return;
  client.identify(distinctId);
}

// ----- Per-event helpers (taxonomy from plan/03-analytics-monitoring.md) -----

export interface SearchSubmittedProps {
  query_hash: string;
  query_length: number;
  language: string;
}
export function searchSubmitted(props: SearchSubmittedProps): void {
  capture("search_submitted", { ...props });
}

export interface SearchResultsReturnedProps {
  query_hash: string;
  result_count: number;
  mode: "cache" | "fresh" | "reference" | "empty";
  latency_ms: number;
  degraded: boolean;
}
export function searchResultsReturned(props: SearchResultsReturnedProps): void {
  capture("search_results_returned", { ...props });
}

export interface SearchResultClickedProps {
  query_hash: string;
  hadith_id: string;
  position: number;
  relevance: number | null;
}
export function searchResultClicked(props: SearchResultClickedProps): void {
  capture("search_result_clicked", { ...props });
}

export type HadithViewSource = "search" | "browse" | "deeplink" | "bookmark";
export function hadithViewed(hadith_id: string, source: HadithViewSource): void {
  capture("hadith_viewed", { hadith_id, source });
}

export function bookmarkAdded(hadith_id: string): void {
  capture("bookmark_added", { hadith_id });
}

export function bookmarkRemoved(hadith_id: string): void {
  capture("bookmark_removed", { hadith_id });
}

export function hadithShared(hadith_id: string, method: "native" | "link"): void {
  capture("hadith_shared", { hadith_id, method });
}

export function hadithNotFound(hadith_id: string): void {
  capture("hadith_not_found", { hadith_id });
}

export function themeChanged(theme: "light" | "dark" | "sepia"): void {
  capture("theme_changed", { theme });
}

export function fontSizeChanged(step: "S" | "M" | "L"): void {
  capture("font_size_changed", { step });
}

export function privateModeToggled(enabled: boolean): void {
  capture("private_mode_toggled", { enabled });
}
