"use client";

import * as React from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookmarks } from "@/lib/queries/use-bookmarks";

interface BookmarkButtonProps {
  hadithId: string;
}

export function BookmarkButton({ hadithId }: BookmarkButtonProps) {
  // useBookmarks is persist-backed; on the server we don't know the value yet,
  // so render an unmounted placeholder until hydration finishes.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const ids = useBookmarks((s) => s.ids);
  const toggle = useBookmarks((s) => s.toggle);
  const saved = mounted && ids.includes(hadithId);

  return (
    <Button
      type="button"
      variant={saved ? "default" : "outline"}
      onClick={() => toggle(hadithId)}
      aria-pressed={saved}
      aria-label={saved ? "Remove bookmark" : "Add bookmark"}
    >
      {saved ? (
        <>
          <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
          Bookmarked
        </>
      ) : (
        <>
          <Bookmark className="h-4 w-4" aria-hidden="true" />
          Bookmark
        </>
      )}
    </Button>
  );
}
