import { useRouter } from "expo-router";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import type { SearchRequest, SearchResult } from "@hadith/shared-types";
import { Icon } from "@/components/icon";
import { StatusBarStrip } from "@/components/status-bar-strip";
import { JumpToHadith } from "@/components/jump-to-hadith";
import { ResultList } from "@/components/result-list";
import { SearchBox } from "@/components/search-box";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import {
  type SearchResultsReturnedProps,
  searchResultClicked,
  searchResultsReturned,
  searchSubmitted,
  sha256Hex,
} from "@/lib/analytics";
import { tokenizeQuery } from "@/lib/highlight";
import { canonicalKey, useSearch } from "@/lib/queries/use-search";
import { useUiStore } from "@/lib/store/ui-store";

const QUERY_DEBOUNCE_MS = 250;

/**
 * Search screen — faithful port of apps/web/app/(app)/search/page.tsx:
 * 250 ms query debounce, shared SearchRequest contract, TanStack mutation,
 * stale-result cancellation, and the same analytics taxonomy. State machine
 * (initial / typing / loading / results / empty / error) is handled by
 * ResultList; this screen owns input + filter state and request orchestration.
 */
export default function SearchScreen() {
  const router = useRouter();

  const lastQuery = useUiStore((s) => s.lastQuery);
  const setLastQuery = useUiStore((s) => s.setLastQuery);

  const [query, setQuery] = React.useState(lastQuery);
  const [debounced, setDebounced] = React.useState(lastQuery);
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [hasQuery, setHasQuery] = React.useState(lastQuery.trim().length > 0);
  const [jumpOpen, setJumpOpen] = React.useState(false);

  const search = useSearch();
  const mutateAsync = search.mutateAsync;

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query), QUERY_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const runSearch = React.useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setResults([]);
        setHasQuery(false);
        return () => {};
      }
      setHasQuery(true);
      setLastQuery(trimmed);

      const vars: SearchRequest = {
        query: trimmed,
        language: "en",
        topK: 10,
      };

      let cancelled = false;
      (async () => {
        // Hash the canonical key (not the raw query) so analytics + server
        // query_cache see the same hash from web and mobile.
        const queryHash = await sha256Hex(
          canonicalKey({
            language: vars.language ?? "en",
            query: vars.query,
          }),
        );
        searchSubmitted({
          query_hash: queryHash,
          query_length: trimmed.length,
          language: vars.language ?? "en",
        });
        try {
          const data = await mutateAsync(vars);
          if (cancelled) return;
          setResults(data.results);
          searchResultsReturned({
            query_hash: queryHash,
            result_count: data.results.length,
            mode: data.mode as SearchResultsReturnedProps["mode"],
            latency_ms: data.latency_ms,
            degraded: data.degraded ?? false,
          });
        } catch {
          // Error surfaces via search.error in ResultList.
        }
      })();

      return () => {
        cancelled = true;
      };
    },
    [mutateAsync, setLastQuery],
  );

  // Fire whenever the debounced query changes (same deps as web).
  React.useEffect(() => {
    return runSearch(debounced);
  }, [debounced, runSearch]);

  const tokens = React.useMemo(() => tokenizeQuery(debounced), [debounced]);

  const onResultPress = React.useCallback(
    async (result: SearchResult, position: number) => {
      const queryHash = await sha256Hex(
        canonicalKey({
          language: "en",
          query: debounced.trim(),
        }),
      );
      searchResultClicked({
        query_hash: queryHash,
        hadith_id: result.id,
        position,
        relevance: result.relevance ?? null,
      });
      router.push(`/hadith/${encodeURIComponent(result.id)}?from=search`);
    },
    [debounced, router],
  );

  const onClear = React.useCallback(() => {
    setQuery("");
    setDebounced("");
    setResults([]);
    setHasQuery(false);
    setLastQuery("");
    search.reset();
  }, [search, setLastQuery]);

  const onRetry = React.useCallback(() => {
    search.reset();
    runSearch(debounced);
  }, [search, runSearch, debounced]);

  return (
    <View className="flex-1 bg-background">
      <StatusBarStrip />
      <ResultList
        results={results}
        loading={search.isPending}
        error={search.error}
        hasQuery={hasQuery}
        queryTokens={tokens}
        onResultPress={onResultPress}
        onRetry={onRetry}
        ListHeaderComponent={
          <View className="gap-4 pt-4">
            <View>
              <Text size="2xl" weight="semibold">
                Search
              </Text>
              <Text size="sm" className="mt-1 text-muted-foreground">
                Sahih al-Bukhari · semantic + keyword retrieval.
              </Text>
            </View>
            <SearchBox
              value={query}
              onChangeText={setQuery}
              onClear={onClear}
              onSubmit={() => setDebounced(query)}
              loading={search.isPending}
              autoFocus
            />
            <View className="rounded-lg border border-border bg-card">
              <Pressable
                haptic={false}
                onPress={() => setJumpOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: jumpOpen }}
                accessibilityLabel="Jump to a hadith by collection and number"
                className="flex-row items-center justify-between gap-2 p-3"
              >
                <View className="flex-1">
                  <Text size="sm" weight="medium">
                    Jump to a hadith
                  </Text>
                  <Text size="xs" className="text-muted-foreground">
                    Any collection, by number (e.g. muslim 8a).
                  </Text>
                </View>
                <Icon as={jumpOpen ? ChevronUp : ChevronDown} size={18} token="muted-foreground" />
              </Pressable>
              {jumpOpen ? (
                <View className="border-t border-border p-3">
                  <JumpToHadith from="search" />
                </View>
              ) : null}
            </View>
          </View>
        }
      />
    </View>
  );
}
