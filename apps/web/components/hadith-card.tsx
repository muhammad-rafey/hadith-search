"use client";

import Link from "next/link";
import { collectionName, type SearchResult } from "@hadith/shared-types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FeedbackThumbs } from "@/components/feedback-thumbs";
import { highlightTokens } from "@/lib/highlight";
import { cn } from "@/lib/utils";

interface HadithCardProps {
  result: SearchResult;
  position: number;
  queryTokens: string[];
  /** Hashed query string; when provided, renders FeedbackThumbs at the card bottom. */
  queryHash?: string;
  onClick?: (result: SearchResult, position: number) => void;
}

export function HadithCard({ result, position, queryTokens, queryHash, onClick }: HadithCardProps) {
  const handleClick = () => onClick?.(result, position);
  const collection = collectionName(result.collection);
  const reference = `${collection} ${result.hadith_number_label}`;

  return (
    // The entire card is a navigable link via Next.js Link with asChild (Slot)
    // pattern wrapped around the Card. We use a relative container with an
    // absolutely-positioned Link overlay so inner interactive elements (bookmark,
    // share, feedback) remain independently clickable.
    <Card className={cn("relative transition-shadow hover:shadow-md")} onClick={handleClick}>
      {/* Full-card link — sits behind other interactive elements via z-index */}
      <Link
        href={`/hadith/${result.id}`}
        aria-label={`Read full hadith: ${reference}`}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
        tabIndex={-1}
        aria-hidden="true"
      />
      <CardHeader className="space-y-1 pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="font-semibold text-[hsl(var(--foreground))]">{reference}</span>
          <span>
            {result.in_book_ref}
            {result.usc_msa_ref ? ` · ${result.usc_msa_ref}` : ""}
          </span>
        </div>
        {result.chapter_title_en ? (
          <p className="text-sm font-medium">{result.chapter_title_en}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {result.narrator ? (
          <p className="text-sm italic text-[hsl(var(--muted-foreground))]">
            <cite>Narrated {result.narrator}</cite>
          </p>
        ) : null}
        <p className="text-base leading-relaxed">
          {highlightTokens(result.text_en_full, queryTokens)}
        </p>
        {result.text_ur ? (
          // Compact Nastaliq snippet (the tall `.font-urdu` block style is for
          // the detail page); inline family + leading keeps the card tidy.
          <p
            dir="rtl"
            lang="ur"
            style={{ fontFamily: "var(--font-urdu), 'Noto Nastaliq Urdu', 'Amiri', serif" }}
            className="line-clamp-2 text-sm leading-loose text-[hsl(var(--muted-foreground))]"
          >
            {result.text_ur}
          </p>
        ) : null}
        <div
          className={cn(
            "relative z-10 flex items-center justify-between pt-2 text-xs text-[hsl(var(--muted-foreground))]",
          )}
        >
          <span>{result.book_name_en}</span>
          <div className="flex items-center gap-3">
            {queryHash ? (
              <FeedbackThumbs
                queryHash={queryHash}
                hadithId={String(result.id)}
                position={position}
              />
            ) : null}
            <Link
              href={`/hadith/${result.id}`}
              onClick={handleClick}
              className="relative z-10 font-medium text-[hsl(var(--primary))] hover:underline"
            >
              Read full hadith &rarr;
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
