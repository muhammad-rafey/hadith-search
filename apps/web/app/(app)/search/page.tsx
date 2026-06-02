"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Filter, Info, Compass } from "lucide-react";
import type { SearchRequest, SearchResult } from "@hadith/shared-types";
import { SearchBox } from "@/components/search-box";
import { ResultList } from "@/components/result-list";
import { JumpToHadith } from "@/components/jump-to-hadith";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canonicalKey, useSearch } from "@/lib/queries/use-search";
import { useUiStore } from "@/lib/store";
import {
  searchResultClicked,
  searchResultsReturned,
  searchSubmitted,
  sha256Hex,
} from "@/lib/analytics";
import { tokenizeQuery } from "@/lib/highlight";

const QUERY_DEBOUNCE_MS = 250;
const NARRATOR_DEBOUNCE_MS = 200;

type BookOption = { book_number: number; book_name_en: string; hadith_count: number };

export default function SearchPage() {
  return (
    <React.Suspense fallback={null}>
      <SearchPageInner />
    </React.Suspense>
  );
}

function SearchPageInner() {
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const setLastQuery = useUiStore((s) => s.setLastQuery);
  const bookFilter = useUiStore((s) => s.bookFilter);
  const narratorFilter = useUiStore((s) => s.narratorFilter);
  // Subscribe to privateMode so a Settings-side toggle re-issues searches
  // with skip_cache: true instead of returning a stale cache.
  const privateMode = useUiStore((s) => s.privateMode);
  const setBookFilter = useUiStore((s) => s.setBookFilter);
  const setNarratorFilter = useUiStore((s) => s.setNarratorFilter);
  const clearFilters = useUiStore((s) => s.clearFilters);

  const [query, setQuery] = React.useState(initial);
  const [debounced, setDebounced] = React.useState(initial);
  const [debouncedNarrator, setDebouncedNarrator] = React.useState(narratorFilter);
  const search = useSearch();
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [hasQuery, setHasQuery] = React.useState(initial.trim().length > 0);
  // Store the query hash that corresponds to the currently displayed results,
  // so click analytics references the actual query hash, not the latest input.
  const [resultQueryHash, setResultQueryHash] = React.useState<string>("");

  const booksQuery = useQuery<BookOption[]>({
    queryKey: ["books"],
    queryFn: async () => {
      const res = await fetch("/api/books");
      if (!res.ok) throw new Error("failed to load books");
      return res.json();
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query), QUERY_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedNarrator(narratorFilter), NARRATOR_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [narratorFilter]);

  const mutateAsync = search.mutateAsync;

  // biome-ignore lint/correctness/useExhaustiveDependencies: mutateAsync is stable
  React.useEffect(() => {
    const trimmed = debounced.trim();
    if (!trimmed) {
      setResults([]);
      setHasQuery(false);
      return;
    }
    setHasQuery(true);
    setLastQuery(trimmed);

    const vars: SearchRequest = {
      query: trimmed,
      language: "en",
      topK: 10,
      ...(bookFilter ? { book: bookFilter } : {}),
      ...(debouncedNarrator.trim() ? { narrator: debouncedNarrator.trim() } : {}),
      skip_cache: privateMode,
    };

    let cancelled = false;
    (async () => {
      const queryHash = await sha256Hex(
        canonicalKey({
          language: vars.language,
          book: vars.book ?? null,
          narrator: vars.narrator ?? null,
          query: vars.query,
        }),
      );
      // Fire submitted before the network call so the analytics denominator
      // includes failures, not just successes.
      searchSubmitted({
        query_hash: queryHash,
        query_length: trimmed.length,
        language: vars.language,
        has_book_filter: !!vars.book,
        has_narrator_filter: !!vars.narrator,
      });
      try {
        const data = await mutateAsync(vars);
        if (cancelled) return;
        setResults(data.results);
        setResultQueryHash(queryHash);
        searchResultsReturned({
          query_hash: queryHash,
          result_count: data.results.length,
          mode: data.mode,
          latency_ms: data.latency_ms,
          degraded: data.degraded ?? false,
        });
      } catch {
        // Error state is rendered by ResultList via search.error below.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debounced, bookFilter, debouncedNarrator, privateMode, setLastQuery]);

  const tokens = React.useMemo(() => tokenizeQuery(debounced), [debounced]);

  const onResultClick = React.useCallback(
    (result: SearchResult, position: number) => {
      searchResultClicked({
        query_hash: resultQueryHash,
        hadith_id: result.id,
        position,
        relevance: result.relevance ?? null,
      });
    },
    [resultQueryHash],
  );

  const hasFilters = bookFilter !== null || narratorFilter.trim().length > 0;

  let statusMessage = "";
  if (hasQuery) {
    if (search.isPending) {
      statusMessage = "Searching…";
    } else if (results.length === 0) {
      statusMessage = "No results found.";
    } else {
      statusMessage = `${results.length} result${results.length === 1 ? "" : "s"} found.`;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          AI semantic search across{" "}
          <span className="font-medium text-[hsl(var(--foreground))]">Sahih al-Bukhari</span> —
          meaning and keyword combined.
        </p>
      </div>

      <SearchBox value={query} onChange={setQuery} loading={search.isPending} autoFocus />

      <output aria-live="polite" aria-atomic="true" className="sr-only">
        {statusMessage}
      </output>

      <SearchFilters
        bookFilter={bookFilter}
        narratorFilter={narratorFilter}
        books={booksQuery.data ?? []}
        hasFilters={hasFilters}
        onBookChange={setBookFilter}
        onNarratorChange={setNarratorFilter}
        onClear={clearFilters}
      />

      <ResultList
        results={results}
        loading={search.isPending}
        error={search.error}
        hasQuery={hasQuery}
        queryTokens={tokens}
        queryHash={resultQueryHash}
        onResultClick={onResultClick}
      />

      <JumpPanel />
    </div>
  );
}

interface SearchFiltersProps {
  bookFilter: number | null;
  narratorFilter: string;
  books: BookOption[];
  hasFilters: boolean;
  onBookChange: (n: number | null) => void;
  onNarratorChange: (s: string) => void;
  onClear: () => void;
}

/**
 * Filters that narrow the Sahih al-Bukhari semantic search (book + narrator,
 * both POSTed to /api/search). Presented as a clean labelled panel; the
 * collection-wide affordances live in <JumpPanel> below the results.
 */
function SearchFilters({
  bookFilter,
  narratorFilter,
  books,
  hasFilters,
  onBookChange,
  onNarratorChange,
  onClear,
}: SearchFiltersProps) {
  return (
    <section
      aria-labelledby="search-filters-heading"
      className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] px-4 py-2.5">
        <h2
          id="search-filters-heading"
          className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]"
        >
          <Filter className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          Refine your search
        </h2>
        {hasFilters ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="book-filter"
            className="block text-xs font-medium text-[hsl(var(--muted-foreground))]"
          >
            Book
          </label>
          <select
            id="book-filter"
            value={bookFilter ?? ""}
            onChange={(e) => onBookChange(e.target.value === "" ? null : Number(e.target.value))}
            className="h-10 w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]"
          >
            <option value="">All books</option>
            {books.map((b) => (
              <option key={b.book_number} value={b.book_number}>
                {b.book_name_en} ({b.hadith_count})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="narrator-filter"
            className="block text-xs font-medium text-[hsl(var(--muted-foreground))]"
          >
            Narrator
          </label>
          <Input
            id="narrator-filter"
            placeholder="e.g. Abu Hurairah"
            value={narratorFilter}
            onChange={(e) => onNarratorChange(e.target.value)}
            className="h-10"
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Collection-wide deep link. Semantic search is Bukhari-only, but every one of
 * the fifteen collections is reachable by hadith number — this panel uses the
 * lookup endpoint (via <JumpToHadith>) to jump straight to a known reference.
 */
function JumpPanel() {
  return (
    <section
      aria-labelledby="jump-panel-heading"
      className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-4"
    >
      <h2
        id="jump-panel-heading"
        className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]"
      >
        <Compass className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        Jump to a hadith
      </h2>
      <p className="mt-1 flex items-start gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Know the reference? Pick a collection and enter its number to open it directly — works
          across all fifteen collections.
        </span>
      </p>
      <div className="mt-3">
        <JumpToHadith />
      </div>
    </section>
  );
}
