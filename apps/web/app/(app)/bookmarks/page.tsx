"use client";

import * as React from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { collectionName, HadithSchema, type Hadith } from "@hadith/shared-types";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useBookmarks } from "@/lib/queries/use-bookmarks";

const ResponseSchema = z.object({ hadiths: z.array(HadithSchema) });

async function fetchBookmarkedHadiths(ids: string[]): Promise<Hadith[]> {
  if (ids.length === 0) return [];
  const res = await apiFetch("/api/hadiths/by-bookmark-ids", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  // Throw on network/server failure so TanStack surfaces an error state —
  // otherwise a user with 12 bookmarks would see "No bookmarks yet" after a
  // network blip and could panic-delete entries thinking they were lost.
  if (!res.ok) throw new Error(`bookmark lookup failed (${res.status})`);
  const parsed = ResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("malformed bookmark response");
  return parsed.data.hadiths;
}

export default function BookmarksPage() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const ids = useBookmarks((s) => s.ids);
  const remove = useBookmarks((s) => s.remove);

  const idsKey = ids.join(",");
  const itemsQuery = useQuery<Hadith[]>({
    queryKey: ["bookmarks", idsKey],
    queryFn: () => fetchBookmarkedHadiths(ids),
    enabled: mounted && ids.length > 0,
    staleTime: 60 * 60 * 1000,
  });

  if (!mounted) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Bookmarks</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading...</p>
      </div>
    );
  }

  const items = itemsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bookmarks</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Saved on this device. {items.length} item{items.length === 1 ? "" : "s"}.
        </p>
      </div>

      {ids.length > 0 && itemsQuery.isLoading ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading hadiths…</p>
      ) : ids.length > 0 && itemsQuery.isError ? (
        <div
          role="alert"
          className="rounded-md border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 p-4 text-sm"
        >
          <p className="font-medium">Couldn't load your bookmarks.</p>
          <p className="mt-1 text-[hsl(var(--muted-foreground))]">
            {itemsQuery.error instanceof Error
              ? itemsQuery.error.message
              : "Network error. Your saved IDs are preserved — try refreshing."}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => itemsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
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
                    {collectionName(h.collection)} {h.hadith_number_label}
                  </p>
                  <CardTitle className="text-base font-medium">
                    <Link href={`/hadith/${h.id}`} className="hover:underline">
                      {h.chapter_title_en ?? `Hadith ${h.hadith_number_label}`}
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
                    aria-label={`Remove bookmark for ${collectionName(h.collection)} ${h.hadith_number_label}`}
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
