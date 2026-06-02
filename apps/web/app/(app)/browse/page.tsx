import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { collectionArabicName, collectionName, collectionSortIndex } from "@hadith/shared-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCollectionList } from "@/lib/hadiths";

export const metadata: Metadata = {
  title: "Browse",
  description: "Browse hadith collections — Sahih al-Bukhari, Sahih Muslim, and more.",
};

export const revalidate = 86400;

export default async function BrowsePage() {
  const collections = (await getCollectionList())
    .slice()
    .sort((a, b) => collectionSortIndex(a.collection) - collectionSortIndex(b.collection));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Browse</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {collections.length} collection{collections.length === 1 ? "" : "s"}. Pick one to read
          straight through or jump to a hadith number.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((c) => {
          const arabic = collectionArabicName(c.collection);
          return (
            <Link
              key={c.collection}
              href={`/browse/${c.collection}`}
              className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-start justify-between gap-2">
                    <span>{collectionName(c.collection)}</span>
                    <ChevronRight
                      className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]"
                      aria-hidden="true"
                    />
                  </CardTitle>
                  {arabic ? (
                    <p
                      dir="rtl"
                      lang="ar"
                      className="font-arabic text-base text-[hsl(var(--muted-foreground))]"
                    >
                      {arabic}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    {c.hadith_count.toLocaleString()} hadith{c.hadith_count === 1 ? "" : "s"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
