import { X } from "lucide-react-native";
import * as React from "react";
import { FlatList, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { type BookSummary, getAllBooks } from "@/lib/hadiths";

/**
 * Search filters for the bukhari semantic search (book + narrator → /api/search).
 * Only bukhari is embedded, so these filters are scoped to Sahih al-Bukhari —
 * the header says so explicitly. Browse + number lookup (elsewhere) cover all
 * 15 collections.
 *
 * The book list uses a horizontal FlatList (not ScrollView) so all ~97 books
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
        accessibilityState={{ selected: bookFilter === item.book_number }}
      >
        {item.book_name_en}
      </Button>
    ),
    [bookFilter, onBookChange],
  );

  const keyExtractor = React.useCallback((b: BookSummary) => String(b.book_number), []);

  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-3">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1">
          <Text size="xs" weight="medium" className="uppercase text-muted-foreground">
            Refine
          </Text>
          <Text size="xs" className="text-muted-foreground">
            Filters apply to Sahih al-Bukhari.
          </Text>
        </View>
        {hasFilters ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={onClear}
            accessibilityLabel="Clear all filters"
          >
            <Icon as={X} size={14} token="foreground" />
            <Text size="sm" weight="medium">
              Clear
            </Text>
          </Button>
        ) : null}
      </View>

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
              accessibilityState={{ selected: bookFilter === null }}
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
    </View>
  );
}
