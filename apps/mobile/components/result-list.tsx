import * as React from "react";
import { FlatList, View } from "react-native";
import type { SearchResult } from "@hadith/shared-types";
import { EmptyState } from "@/components/empty-state";
import { HadithCard } from "@/components/hadith-card";
import { Skeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/**
 * Results surface. Owns the FlatList plus every non-list state, mirroring
 * apps/web/components/result-list.tsx copy exactly:
 *  - loading  → 3 skeleton cards
 *  - error    → "Search failed." + message (+ Retry)
 *  - no query → "Enter a query to search the corpus. Try …"
 *  - empty    → "No matches. Try different words or remove a filter."
 * The search box + filters are passed in as the list header so the whole
 * screen scrolls as one and the keyboard dismisses cleanly.
 */
export interface ResultListProps {
  results: SearchResult[];
  loading: boolean;
  error: Error | null;
  hasQuery: boolean;
  queryTokens: string[];
  onResultPress: (result: SearchResult, position: number) => void;
  onRetry?: () => void;
  ListHeaderComponent?: React.ReactElement;
}

function SkeletonCard() {
  return (
    <View className="gap-2 rounded-lg border border-border p-4">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </View>
  );
}

export function ResultList({
  results,
  loading,
  error,
  hasQuery,
  queryTokens,
  onResultPress,
  onRetry,
  ListHeaderComponent,
}: ResultListProps) {
  const data = loading ? [] : results;

  const empty = React.useMemo(() => {
    if (loading) {
      return (
        <View className="gap-3" accessibilityLabel="Loading results">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      );
    }
    if (error) {
      const offline = /network|fetch/i.test(error.message);
      return (
        <EmptyState
          tone="error"
          title={offline ? "You're offline." : "Search failed."}
          description={
            offline ? "Check your connection and try again." : error.message || "Please try again."
          }
        />
      );
    }
    if (!hasQuery) {
      return (
        <EmptyState
          title="Search Sahih al-Bukhari"
          description={
            'Enter a query to begin. Try "intentions" or "bukhari:1". ' +
            "Browse covers all collections."
          }
        />
      );
    }
    return <EmptyState title="No matches." description="Try different words or remove a filter." />;
  }, [loading, error, hasQuery]);

  const renderItem = React.useCallback(
    ({ item, index }: { item: SearchResult; index: number }) => (
      <HadithCard
        result={item}
        position={index}
        queryTokens={queryTokens}
        onPress={onResultPress}
      />
    ),
    [queryTokens, onResultPress],
  );

  return (
    <FlatList
      data={data}
      keyExtractor={(r) => r.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerClassName="px-4 pb-10 gap-3"
      ListHeaderComponent={
        <View className="gap-4 pb-1">
          {ListHeaderComponent}
          {error && onRetry ? (
            <View className="items-start">
              <Button variant="outline" size="sm" onPress={onRetry}>
                Retry
              </Button>
            </View>
          ) : null}
          {!loading && !error && data.length > 0 ? (
            <Text
              size="xs"
              className="text-muted-foreground"
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
            >
              {data.length} result{data.length === 1 ? "" : "s"}.
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={empty}
      renderItem={renderItem}
      removeClippedSubviews
      windowSize={7}
      initialNumToRender={8}
    />
  );
}
