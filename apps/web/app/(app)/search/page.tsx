"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { MOCK_BOOKS, type SearchRequest, type SearchResult } from "@hadith/shared-types";
import { SearchBox } from "@/components/search-box";
import { ResultList } from "@/components/result-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSearch } from "@/lib/queries/use-search";
import { useUiStore } from "@/lib/store";
import {
  searchResultClicked,
  searchResultsReturned,
  searchSubmitted,
  sha256Hex,
} from "@/lib/analytics";
import { tokenizeQuery } from "@/lib/highlight";

const DEBOUNCE_MS = 250;

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
  const setBookFilter = useUiStore((s) => s.setBookFilter);
  const setNarratorFilter = useUiStore((s) => s.setNarratorFilter);
  const clearFilters = useUiStore((s) => s.clearFilters);

  const [query, setQuery] = React.useState(initial);
  const [debounced, setDebounced] = React.useState(initial);
  const search = useSearch();
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [hasQuery, setHasQuery] = React.useState(initial.trim().length > 0);
  // Store the query hash that corresponds to the currently displayed results,
  // so click analytics references the actual query hash, not the latest input.
  const [resultQueryHash, setResultQueryHash] = React.useState<string>("");

  // Debounce the input by DEBOUNCE_MS.
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const mutateAsync = search.mutateAsync;

  // Canonical form matches the Edge Function's hash key:
  // language + "|" + (book ?? "") + "|" + (narrator ?? "") + "|" + trimmed_lowercase_query
  function canonicalize(vars: SearchRequest): string {
    return [
      vars.language,
      String(vars.book ?? ""),
      (vars.narrator ?? "").trim(),
      vars.query.trim().toLowerCase(),
    ].join("|");
  }

  // Fire the search whenever the debounced query or filters change.
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
      ...(narratorFilter.trim() ? { narrator: narratorFilter.trim() } : {}),
      skip_cache: useUiStore.getState().privateMode,
    };

    let cancelled = false;
    (async () => {
      const queryHash = await sha256Hex(canonicalize(vars));
      try {
        const data = await mutateAsync(vars);
        if (cancelled) return;
        setResults(data.results);
        // Store the hash that produced this result set for click analytics.
        setResultQueryHash(queryHash);
        searchSubmitted({
          query_hash: queryHash,
          query_length: trimmed.length,
          language: vars.language,
          has_book_filter: !!vars.book,
          has_narrator_filter: !!vars.narrator,
        });
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
  }, [debounced, bookFilter, narratorFilter, setLastQuery]);

  const tokens = React.useMemo(() => tokenizeQuery(debounced), [debounced]);

  const onResultClick = React.useCallback(
    (result: SearchResult, position: number) => {
      searchResultClicked({
        // Use the hash of the query that produced the current results, not
        // the latest (possibly mid-typing) input.
        query_hash: resultQueryHash,
        hadith_id: result.id,
        position,
        relevance: result.relevance ?? null,
      });
    },
    [resultQueryHash],
  );

  // aria-live status message — always in the DOM so screen readers track it.
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

      {/* Always rendered so aria-live is in the DOM from the start */}
      <output aria-live="polite" aria-atomic="true" className="sr-only">
        {statusMessage}
      </output>

      <fieldset className="space-y-3 rounded-md border border-[hsl(var(--border))] p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Filters
        </legend>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">Book:</span>
          <Button
            type="button"
            size="sm"
            variant={bookFilter === null ? "default" : "outline"}
            onClick={() => setBookFilter(null)}
          >
            All
          </Button>
          {MOCK_BOOKS.map((b) => (
            <Button
              key={b.book_number}
              type="button"
              size="sm"
              variant={bookFilter === b.book_number ? "default" : "outline"}
              onClick={() => setBookFilter(b.book_number)}
            >
              {b.book_name_en}
            </Button>
          ))}
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
        onResultClick={onResultClick}
      />
    </div>
  );
}
