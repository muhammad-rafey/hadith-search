"use client";

import posthog from "posthog-js";
import { useUiStore } from "@/lib/store";

/**
 * SHA-256 hash a string via the Web Crypto API.
 * Returns a 64-character lowercase hex string.
 *
 * Used to anonymize search queries before they leave the device — see
 * plan/03-analytics-monitoring.md "Privacy posture": raw query text MUST NEVER
 * be logged to PostHog, Sentry, or any third party.
 *
 * Canonical key format hashed here (must match Edge Function):
 *   `language + "|" + (book ?? "") + "|" + (narrator ?? "") + "|" + canonical_query`
 * where canonical_query is lowercased and whitespace-collapsed.
 *
 * Throws Error("sha256: crypto.subtle unavailable") when the Web Crypto API is
 * not accessible (e.g., non-secure context, or SSR). Callers should catch and
 * let the analytics call no-op rather than crashing the UI.
 */
export async function sha256Hex(input: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("sha256: crypto.subtle unavailable");
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

/**
 * Returns true when the user has enabled Private mode.
 *
 * Privacy posture: private mode disables search-query telemetry, not all
 * telemetry. Gated events: searchSubmitted, searchResultsReturned,
 * searchResultClicked, searchFeedbackGiven. Other events (hadithViewed,
 * bookmarkAdded, etc.) still fire in private mode — they carry no query text.
 */
function isPrivate(): boolean {
  return useUiStore.getState().privateMode;
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
  if (isPrivate()) return;
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
  if (isPrivate()) return;
  capture("search_results_returned", { ...props });
}

export interface SearchResultClickedProps {
  query_hash: string;
  hadith_id: string;
  position: number;
  relevance: number | null;
}
export function searchResultClicked(props: SearchResultClickedProps): void {
  if (isPrivate()) return;
  capture("search_result_clicked", { ...props });
}

export interface SearchFeedbackGivenProps {
  query_hash: string;
  hadith_id: string;
  position: number;
  thumb: "up" | "down";
}
/**
 * Fire when the user submits thumbs-up / thumbs-down feedback on a result.
 * Gated by private mode — no event fires when privateMode is enabled.
 */
export function searchFeedbackGiven(props: SearchFeedbackGivenProps): void {
  if (isPrivate()) return;
  capture("search_feedback_given", { ...props });
}

export type HadithViewSource = "search" | "browse" | "deeplink" | "bookmark";
export function hadithViewed(hadith_id: string, source: HadithViewSource): void {
  capture("hadith_viewed", { hadith_id, source });
}

export interface HadithSharedProps {
  hadithId: string;
  method: "link" | "native";
}
/**
 * Fire when the user shares a hadith. Replaces ad-hoc
 * `capture("hadith_shared", ...)` calls in the shared-button component.
 */
export function hadithShared({ hadithId, method }: HadithSharedProps): void {
  capture("hadith_shared", { hadith_id: hadithId, method });
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
