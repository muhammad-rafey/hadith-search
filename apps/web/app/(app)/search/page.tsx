"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { SearchRequest, SearchResult } from "@hadith/shared-types";
import { SearchBox } from "@/components/search-box";
import { ResultList } from "@/components/result-list";
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
          Sahih al-Bukhari · semantic + keyword retrieval.
        </p>
      </div>

      <SearchBox value={query} onChange={setQuery} loading={search.isPending} autoFocus />

      <output aria-live="polite" aria-atomic="true" className="sr-only">
        {statusMessage}
      </output>

      <fieldset className="space-y-3 rounded-md border border-[hsl(var(--border))] p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Filters
        </legend>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="book-filter" className="text-xs text-[hsl(var(--muted-foreground))]">
            Book:
          </label>
          <select
            id="book-filter"
            value={bookFilter ?? ""}
            onChange={(e) => setBookFilter(e.target.value === "" ? null : Number(e.target.value))}
            className="h-9 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-sm"
          >
            <option value="">All books</option>
            {(booksQuery.data ?? []).map((b) => (
              <option key={b.book_number} value={b.book_number}>
                {b.book_name_en} ({b.hadith_count})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="narrator-filter" className="text-xs text-[hsl(var(--muted-foreground))]">
            Narrator:
          </label>
          <Input
            id="narrator-filter"
            placeholder="e.g. Abu Hurairah"
            value={narratorFilter}
            onChange={(e) => setNarratorFilter(e.target.value)}
            className="h-9 max-w-xs"
          />
          {(bookFilter !== null || narratorFilter) && (
            <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </fieldset>

      <ResultList
        results={results}
        loading={search.isPending}
        error={search.error}
        hasQuery={hasQuery}
        queryTokens={tokens}
        queryHash={resultQueryHash}
        onResultClick={onResultClick}
      />
    </div>
  );
}
