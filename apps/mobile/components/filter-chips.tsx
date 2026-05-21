import * as React from "react";
import { FlatList, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { type BookSummary, getAllBooks } from "@/lib/hadiths";

/**
 * Search filters. The book chips are populated by the same /api/books call
 * the Browse screen uses, so they stay in sync with the live corpus.
 *
 * The book list uses a horizontal FlatList (not ScrollView) so all 97 books
 * don't render up-front — only what's visible plus the next ~10 are mounted.
 */
export function FilterChips({
  bookFilter,
  narratorFilter,
  onBookChange,
  onNarratorChange,
  onClear,
}: {
  bookFilter: number | null;
  narratorFilter: string;
  onBookChange: (n: number | null) => void;
  onNarratorChange: (s: string) => void;
  onClear: () => void;
}) {
  const hasFilters = bookFilter !== null || narratorFilter.length > 0;
  const booksQuery = useQuery<BookSummary[]>({
    queryKey: ["books"],
    queryFn: getAllBooks,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const books = booksQuery.data ?? [];

  // Memoize the renderItem so FlatList doesn't re-create cells on every parent
  // re-render (e.g., narrator input keystrokes).
  const renderBook = React.useCallback(
    ({ item }: { item: BookSummary }) => (
      <Button
        size="sm"
        variant={bookFilter === item.book_number ? "default" : "outline"}
        onPress={() => onBookChange(item.book_number)}
      >
        {item.book_name_en}
      </Button>
    ),
    [bookFilter, onBookChange],
  );

  const keyExtractor = React.useCallback((b: BookSummary) => String(b.book_number), []);

  return (
    <View className="gap-3 rounded-md border border-border p-3">
      <Text size="xs" weight="medium" className="uppercase text-muted-foreground">
        Filters
      </Text>

      <View className="gap-2">
        <Text size="xs" className="text-muted-foreground">
          Book
        </Text>
        <FlatList
          data={books}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyExtractor={keyExtractor}
          renderItem={renderBook}
          ListHeaderComponent={
            <Button
              size="sm"
              variant={bookFilter === null ? "default" : "outline"}
              onPress={() => onBookChange(null)}
            >
              All
            </Button>
          }
          ItemSeparatorComponent={() => <View className="w-2" />}
          ListHeaderComponentStyle={{ marginRight: 8 }}
          removeClippedSubviews
          initialNumToRender={10}
          windowSize={5}
          contentContainerStyle={{ paddingRight: 8 }}
        />
      </View>

      <View className="gap-2">
        <Text size="xs" className="text-muted-foreground">
          Narrator
        </Text>
        <Input
          value={narratorFilter}
          onChangeText={onNarratorChange}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="e.g. Abu Hurairah"
          accessibilityLabel="Filter by narrator"
          className="h-9"
        />
      </View>

      {hasFilters ? (
        <View className="items-start">
          <Button size="sm" variant="ghost" onPress={onClear}>
            Clear filters
          </Button>
        </View>
      ) : null}
    </View>
  );
}
