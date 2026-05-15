"use client";

import * as React from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBookmarks } from "@/lib/queries/use-bookmarks";
import { getHadithById } from "@/lib/hadiths";

export default function BookmarksPage() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const ids = useBookmarks((s) => s.ids);
  const remove = useBookmarks((s) => s.remove);

  if (!mounted) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Bookmarks</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading...</p>
      </div>
    );
  }

  const items = ids.map((id) => getHadithById(id)).filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bookmarks</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Saved on this device. {items.length} item{items.length === 1 ? "" : "s"}.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-[hsl(var(--border))] p-8 text-center text-sm">
          <p className="font-medium">No bookmarks yet.</p>
          <p className="mt-1 text-[hsl(var(--muted-foreground))]">
            Open a hadith and tap the Bookmark button to save it here.
          </p>
          <Button asChild className="mt-4">
            <Link href="/search">Start searching</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((h) => (
            <li key={h.id}>
              <Card>
                <CardHeader className="pb-2">
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {h.in_book_ref} · Bukhari {h.hadith_number}
                  </p>
                  <CardTitle className="text-base font-medium">
                    <Link href={`/hadith/${h.id}`} className="hover:underline">
                      {h.chapter_title_en ?? `Hadith ${h.hadith_number}`}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-sm text-[hsl(var(--muted-foreground))]">
                    {h.text_en}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(h.id)}
                    aria-label={`Remove bookmark for hadith ${h.hadith_number}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
