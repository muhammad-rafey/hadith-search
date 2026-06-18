"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Info, Compass } from "lucide-react";
import type { AnswerResponse, SearchRequest, SearchResult } from "@hadith/shared-types";
import { SearchBox } from "@/components/search-box";
import { ResultList } from "@/components/result-list";
import { AnswerPanel } from "@/components/answer-panel";
import { JumpToHadith } from "@/components/jump-to-hadith";
import { canonicalKey, useSearch } from "@/lib/queries/use-search";
import { useAnswer } from "@/lib/queries/use-answer";
import { useUiStore } from "@/lib/store";
import {
  searchResultClicked,
  searchResultsReturned,
  searchSubmitted,
  sha256Hex,
} from "@/lib/analytics";
import { tokenizeQuery } from "@/lib/highlight";

const QUERY_DEBOUNCE_MS = 250;

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
  // Subscribe to privateMode so a Settings-side toggle re-issues searches
  // with skip_cache: true instead of returning a stale cache.
  const privateMode = useUiStore((s) => s.privateMode);

  const [query, setQuery] = React.useState(initial);
  const [debounced, setDebounced] = React.useState(initial);
  const search = useSearch();
  const answer = useAnswer();
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [answerData, setAnswerData] = React.useState<AnswerResponse | null>(null);
  const [answerLoading, setAnswerLoading] = React.useState(false);
  const [hasQuery, setHasQuery] = React.useState(initial.trim().length > 0);
  // Store the query hash that corresponds to the currently displayed results,
  // so click analytics references the actual query hash, not the latest input.
  const [resultQueryHash, setResultQueryHash] = React.useState<string>("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query), QUERY_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const mutateAsync = search.mutateAsync;
  const answerMutateAsync = answer.mutateAsync;

  // biome-ignore lint/correctness/useExhaustiveDependencies: mutateAsync/answerMutateAsync are stable
  React.useEffect(() => {
    const trimmed = debounced.trim();
    if (!trimmed) {
      setResults([]);
      setAnswerData(null);
      setAnswerLoading(false);
      setHasQuery(false);
      return;
    }
    setHasQuery(true);
    setLastQuery(trimmed);
    // Clear any stale answer while the new query resolves.
    setAnswerData(null);
    setAnswerLoading(false);

    const vars: SearchRequest = {
      query: trimmed,
      language: "en",
      topK: 10,
      skip_cache: privateMode,
    };

    let cancelled = false;
    (async () => {
      const queryHash = await sha256Hex(
        canonicalKey({
          language: vars.language,
          query: vars.query,
        }),
      );
      // Fire submitted before the network call so the analytics denominator
      // includes failures, not just successes.
      searchSubmitted({
        query_hash: queryHash,
        query_length: trimmed.length,
        language: vars.language,
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
        // Only synthesize an answer when retrieval produced usable, reliable
        // results. The endpoint re-runs search (cache hit), so this is cheap.
        if (data.results.length > 0 && !data.degraded) {
          setAnswerLoading(true);
          try {
            const ans = await answerMutateAsync({
              query: trimmed,
              language: vars.language,
              topK: 8,
            });
            if (!cancelled) setAnswerData(ans);
          } catch {
            // Answer is best-effort; leave the panel empty on failure.
          } finally {
            if (!cancelled) setAnswerLoading(false);
          }
        }
      } catch {
        // Error state is rendered by ResultList via search.error below.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debounced, privateMode, setLastQuery]);

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
          AI semantic search across{" "}
          <span className="font-medium text-[hsl(var(--foreground))]">Sahih al-Bukhari</span> —
          meaning and keyword combined.
        </p>
      </div>

      <SearchBox value={query} onChange={setQuery} loading={search.isPending} autoFocus />

      <output aria-live="polite" aria-atomic="true" className="sr-only">
        {statusMessage}
      </output>

      <AnswerPanel answer={answerData} loading={answerLoading} hidden={!hasQuery} />

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
