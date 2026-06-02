import { NextResponse } from "next/server";

import { collectionArabicName, collectionName, collectionSortIndex } from "@hadith/shared-types";

import { getCollectionList } from "@/lib/hadiths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CollectionListEntry = {
  collection: string;
  name: string;
  arabic_name: string | null;
  hadith_count: number;
};

/** All collections with display names + counts, ordered for the Browse landing. */
export async function GET() {
  const rows = await getCollectionList();
  const entries: CollectionListEntry[] = rows
    .map((r) => ({
      collection: r.collection,
      name: collectionName(r.collection),
      arabic_name: collectionArabicName(r.collection),
      hadith_count: r.hadith_count,
    }))
    .sort((a, b) => collectionSortIndex(a.collection) - collectionSortIndex(b.collection));
  return NextResponse.json(entries, {
    headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=3600" },
  });
}
