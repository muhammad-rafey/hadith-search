"use client";

import type { SearchResult } from "@hadith/shared-types";
import { HadithCard } from "@/components/hadith-card";
import { Skeleton } from "@/components/ui/skeleton";

interface ResultListProps {
  results: SearchResult[];
  loading: boolean;
  error: Error | null;
  hasQuery: boolean;
  queryTokens: string[];
  onResultClick?: (result: SearchResult, position: number) => void;
}

export function ResultList({
  results,
  loading,
  error,
  hasQuery,
  queryTokens,
  onResultClick,
}: ResultListProps) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 rounded-lg border border-[hsl(var(--border))] p-4">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 p-4 text-sm"
      >
        <p className="font-medium">Search failed.</p>
        <p className="mt-1 text-[hsl(var(--muted-foreground))]">{error.message}</p>
      </div>
    );
  }

  if (!hasQuery) {
    return (
      <p className="rounded-md border border-dashed border-[hsl(var(--border))] p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Enter a query to search the corpus. Try{" "}
        <span className="font-medium">&ldquo;intentions&rdquo;</span> or{" "}
        <span className="font-medium">&ldquo;bukhari:1&rdquo;</span>.
      </p>
    );
  }

  if (results.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-[hsl(var(--border))] p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
        No matches. Try different words or remove a filter.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <output className="sr-only" aria-live="polite">
        {results.length} result{results.length === 1 ? "" : "s"}.
      </output>
      {results.map((r, i) => (
        <HadithCard
          key={r.id}
          result={r}
          position={i}
          queryTokens={queryTokens}
          onClick={onResultClick}
        />
      ))}
    </div>
  );
}
