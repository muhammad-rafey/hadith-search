"use client";

import * as React from "react";
import Link from "next/link";
import { HadithSchema, type Hadith } from "@hadith/shared-types";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PageSchema = z.object({
  collection: z.string(),
  limit: z.number().int(),
  offset: z.number().int(),
  hadiths: z.array(HadithSchema),
});

const PAGE_SIZE = 50;

interface CollectionHadithListProps {
  collection: string;
  /** First page, server-rendered for fast paint + SEO. */
  initialHadiths: Hadith[];
}

/**
 * Renders a collection's hadiths in reading order with a "Load more" button.
 * The first page is server-rendered (passed in); subsequent pages are fetched
 * from GET /api/collections/{collection}/hadiths?offset=… and appended.
 */
export function CollectionHadithList({ collection, initialHadiths }: CollectionHadithListProps) {
  const [hadiths, setHadiths] = React.useState<Hadith[]>(initialHadiths);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  // If the first page came back short, there is nothing more to fetch.
  const [done, setDone] = React.useState(initialHadiths.length < PAGE_SIZE);

  const loadMore = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/collections/${encodeURIComponent(collection)}/hadiths?limit=${PAGE_SIZE}&offset=${hadiths.length}`,
      );
      if (!res.ok) throw new Error(`load failed (${res.status})`);
      const parsed = PageSchema.safeParse(await res.json());
      if (!parsed.success) throw new Error("malformed page");
      const next = parsed.data.hadiths;
      setHadiths((prev) => [...prev, ...next]);
      if (next.length < PAGE_SIZE) setDone(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {hadiths.map((h) => (
          <li key={h.id}>
            <Link
              href={`/hadith/${h.id}`}
              className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            >
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Hadith {h.hadith_number_label}
                  </p>
                  {h.chapter_title_en ? (
                    <CardTitle className="text-base font-medium">{h.chapter_title_en}</CardTitle>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {h.narrator ? (
                    <p className="text-sm italic text-[hsl(var(--muted-foreground))]">
                      Narrated {h.narrator}
                    </p>
                  ) : null}
                  <p className="mt-1 line-clamp-2 text-sm">{h.text_en}</p>
                  {h.text_ur ? (
                    <p
                      dir="rtl"
                      lang="ur"
                      style={{
                        fontFamily: "var(--font-urdu), 'Noto Nastaliq Urdu', 'Amiri', serif",
                      }}
                      className="mt-1 line-clamp-2 text-sm leading-loose text-[hsl(var(--muted-foreground))]"
                    >
                      {h.text_ur}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ol>

      {error ? (
        <p role="alert" className="text-center text-sm text-[hsl(var(--destructive))]">
          Couldn't load more hadiths.
        </p>
      ) : null}

      {!done ? (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : hadiths.length > 0 ? (
        <p className="pt-2 text-center text-xs text-[hsl(var(--muted-foreground))]">
          End of collection · {hadiths.length.toLocaleString()} hadiths loaded.
        </p>
      ) : null}
    </div>
  );
}
