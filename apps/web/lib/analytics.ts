"use client";

import posthog from "posthog-js";

/**
 * SHA-256 hash a string via the Web Crypto API.
 * Returns a 64-character lowercase hex string.
 *
 * Used to anonymize search queries before they leave the device — see
 * plan/03-analytics-monitoring.md "Privacy posture": raw query text MUST NEVER
 * be logged to PostHog, Sentry, or any third party.
 */
export async function sha256Hex(input: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    return "";
  }
  const buffer = new TextEncoder().encode(input);
  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

type EventValue = string | number | boolean | null | undefined;
type EventProps = Record<string, EventValue>;

export function capture(event: string, props?: EventProps): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.capture(event, props);
}

// ----- Per-event helpers (taxonomy from plan/03-analytics-monitoring.md) -----

export interface SearchSubmittedProps {
  query_hash: string;
  query_length: number;
  language: string;
  has_book_filter: boolean;
  has_narrator_filter: boolean;
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

export function themeChanged(theme: "light" | "dark" | "sepia"): void {
  capture("theme_changed", { theme });
}

export function fontSizeChanged(step: "S" | "M" | "L"): void {
  capture("font_size_changed", { step });
}

export function privateModeToggled(enabled: boolean): void {
  capture("private_mode_toggled", { enabled });
}
