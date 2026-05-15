"use client";

import Link from "next/link";
import type { SearchResult } from "@hadith/shared-types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { highlightTokens } from "@/lib/highlight";
import { cn } from "@/lib/utils";

interface HadithCardProps {
  result: SearchResult;
  position: number;
  queryTokens: string[];
  onClick?: (result: SearchResult, position: number) => void;
}

export function HadithCard({ result, position, queryTokens, onClick }: HadithCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="space-y-1 pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="font-semibold text-[hsl(var(--foreground))]">
            Sahih al-Bukhari {result.hadith_number}
          </span>
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
        <div
          className={cn(
            "flex items-center justify-between pt-2 text-xs text-[hsl(var(--muted-foreground))]",
          )}
        >
          <span>
            Book {result.book_number} · {result.book_name_en}
          </span>
          <Link
            href={`/hadith/${result.id}`}
            onClick={() => onClick?.(result, position)}
            className="font-medium text-[hsl(var(--primary))] hover:underline"
          >
            Read full hadith &rarr;
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
