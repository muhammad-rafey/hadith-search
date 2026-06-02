"use client";

import * as React from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { searchFeedbackGiven } from "@/lib/analytics";

type FeedbackState = "none" | "up" | "down" | "submitting";

interface FeedbackThumbsProps {
  /** SHA-256 hex hash of the search query. Render nothing when empty. */
  queryHash: string;
  hadithId: string;
  position: number;
}

/**
 * Thumbs-up / thumbs-down feedback for a search result.
 *
 * - Fires the `search_feedback_given` PostHog event.
 * - POSTs to the Next.js BFF route /api/feedback.
 * - Renders nothing when `queryHash` is empty (privacy guard).
 * - Once a thumb is pressed, marks as submitted and shows "Thanks!".
 */
export function FeedbackThumbs({ queryHash, hadithId, position }: FeedbackThumbsProps) {
  const [state, setState] = React.useState<FeedbackState>("none");

  // Don't render if there's no query context — see plan/03 privacy posture.
  if (!queryHash) return null;

  const isSubmitted = state === "up" || state === "down";

  const handleFeedback = async (thumb: "up" | "down") => {
    if (isSubmitted || state === "submitting") return;
    setState("submitting");

    // Fire analytics event (raw query text is never included — only the hash).
    searchFeedbackGiven({ query_hash: queryHash, hadith_id: hadithId, position, thumb });

    try {
      const res = await apiFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          query_hash: queryHash,
          hadith_id: hadithId,
          position,
          thumb,
        }),
      });
      if (!res.ok) throw new Error(`feedback failed: ${res.status}`);
      setState(thumb);
    } catch {
      // Don't show "Thanks!" if the write failed — revert to allow retry.
      // Feedback is best-effort so we don't pop a toast; the UI just stays
      // in its pre-submit state.
      setState("none");
    }
  };

  if (isSubmitted) {
    return (
      <span className="text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">
        Thanks!
      </span>
    );
  }

  return (
    <fieldset className="m-0 inline-flex items-center gap-1 border-0 p-0">
      <legend className="sr-only">Was this result helpful?</legend>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        aria-label="Helpful"
        disabled={state === "submitting"}
        onClick={(e) => {
          // Stop propagation so the card-level click handler doesn't also fire.
          e.preventDefault();
          e.stopPropagation();
          void handleFeedback("up");
        }}
      >
        <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        aria-label="Not helpful"
        disabled={state === "submitting"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void handleFeedback("down");
        }}
      >
        <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </fieldset>
  );
}
