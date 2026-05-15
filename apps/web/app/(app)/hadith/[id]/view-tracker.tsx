"use client";

import * as React from "react";
import { hadithViewed, type HadithViewSource } from "@/lib/analytics";

interface ViewTrackerProps {
  hadithId: string;
}

const SESSION_STORAGE_KEY = "hadith-search:viewed-ids";

function getViewedIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function markViewed(id: string): void {
  try {
    const ids = getViewedIds();
    ids.add(id);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // sessionStorage may be unavailable in some environments; non-fatal.
  }
}

/**
 * Fires `hadith_viewed` once per hadith id per session. Source is inferred from
 * document.referrer (rough heuristic): /search → "search", /browse → "browse",
 * /bookmarks → "bookmark", anything else → "deeplink".
 */
export function ViewTracker({ hadithId }: ViewTrackerProps) {
  React.useEffect(() => {
    // Per-session de-duplication: skip if already fired for this id.
    if (getViewedIds().has(hadithId)) return;

    let source: HadithViewSource = "deeplink";
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === window.location.origin) {
        if (ref.pathname.startsWith("/search")) source = "search";
        else if (ref.pathname.startsWith("/browse")) source = "browse";
        else if (ref.pathname.startsWith("/bookmarks")) source = "bookmark";
      }
    } catch {
      // ignore
    }
    hadithViewed(hadithId, source);
    markViewed(hadithId);
  }, [hadithId]);
  return null;
}
