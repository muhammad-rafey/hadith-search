import * as React from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { type BookSummary, getAllBooks } from "@/lib/hadiths";

/**
 * Search filters. The book chips are populated by the same /api/books call
 * the Browse screen uses, so they stay in sync with the live corpus.
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

  return (
    <View className="gap-3 rounded-md border border-border p-3">
      <Text size="xs" weight="medium" className="uppercase text-muted-foreground">
        Filters
      </Text>

      <View className="gap-2">
        <Text size="xs" className="text-muted-foreground">
          Book
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-2 pr-2"
        >
          <Button
            size="sm"
            variant={bookFilter === null ? "default" : "outline"}
            onPress={() => onBookChange(null)}
          >
            All
          </Button>
          {books.map((b) => (
            <Button
              key={b.book_number}
              size="sm"
              variant={bookFilter === b.book_number ? "default" : "outline"}
              onPress={() => onBookChange(b.book_number)}
            >
              {b.book_name_en}
            </Button>
          ))}
        </ScrollView>
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
