import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import {
  COLLECTION_ORDER,
  collectionArabicName,
  collectionName,
  isKnownCollection,
} from "@hadith/shared-types";
import { JumpToHadith } from "@/components/jump-to-hadith";
import { getCollectionHadiths } from "@/lib/hadiths";
import { CollectionHadithList } from "./collection-hadith-list";

export const revalidate = 86400;

/** Pre-render the 15 known collections; others fall back to on-demand ISR. */
export function generateStaticParams() {
  return COLLECTION_ORDER.map((collection) => ({ collection }));
}

interface Params {
  params: Promise<{ collection: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { collection } = await params;
  if (!isKnownCollection(collection)) return { title: "Collection not found" };
  const name = collectionName(collection);
  return {
    title: name,
    description: `Read ${name} straight through, or jump to any hadith by number.`,
  };
}

export default async function CollectionPage({ params }: Params) {
  const { collection } = await params;
  if (!isKnownCollection(collection)) notFound();

  const initialHadiths = await getCollectionHadiths(collection, 50, 0);
  const arabic = collectionArabicName(collection);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/browse"
          className="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          All collections
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{collectionName(collection)}</h1>
          {arabic ? (
            <p
              dir="rtl"
              lang="ar"
              className="font-arabic text-xl text-[hsl(var(--muted-foreground))]"
            >
              {arabic}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Jump to a hadith number
        </p>
        <JumpToHadith collection={collection} />
      </div>

      <CollectionHadithList collection={collection} initialHadiths={initialHadiths} />
    </div>
  );
}
