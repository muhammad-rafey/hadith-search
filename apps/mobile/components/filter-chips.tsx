import * as React from "react";
import { ScrollView, View } from "react-native";
import { MOCK_BOOKS } from "@hadith/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

/**
 * Search filters — same controls as the web's <fieldset> on the search page:
 * a horizontal book-chip row, a narrator text field, and a Clear button that
 * appears only when a filter is active.
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
          {MOCK_BOOKS.map((b) => (
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
