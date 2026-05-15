"use client";

import * as React from "react";
import { hadithViewed, type HadithViewSource } from "@/lib/analytics";

interface ViewTrackerProps {
  hadithId: string;
}

/**
 * Fires `hadith_viewed` once per mount. Source is inferred from
 * document.referrer (rough heuristic): /search → "search", /browse → "browse",
 * /bookmarks → "bookmark", anything else → "deeplink".
 */
export function ViewTracker({ hadithId }: ViewTrackerProps) {
  React.useEffect(() => {
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
  }, [hadithId]);
  return null;
}
