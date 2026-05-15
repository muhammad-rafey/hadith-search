import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import * as React from "react";
import { FlatList, View } from "react-native";
import { Icon } from "@/components/icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { type BookSummary, getAllBooks } from "@/lib/hadiths";

/**
 * Books list — mirrors apps/web/app/(app)/browse/page.tsx. FlatList instead
 * of a CSS grid; one column reads better on phones.
 */
export default function BrowseScreen() {
  const router = useRouter();
  const [books, setBooks] = React.useState<BookSummary[]>(() => getAllBooks());
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setBooks(getAllBooks());
    setRefreshing(false);
  }, []);

  return (
    <FlatList
      data={books}
      keyExtractor={(b) => String(b.book_number)}
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerClassName="p-4 gap-3"
      ListHeaderComponent={
        <Text size="sm" className="pb-1 text-muted-foreground">
          {books.length} book{books.length === 1 ? "" : "s"} in the corpus.
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          haptic={false}
          onPress={() => router.push(`/(tabs)/browse/${item.book_number}`)}
          accessibilityRole="button"
          accessibilityLabel={`Book ${item.book_number}, ${item.book_name_en}`}
        >
          <Card>
            <CardHeader className="pb-2">
              <Text size="xs" weight="medium" className="uppercase text-muted-foreground">
                Book {item.book_number}
              </Text>
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <CardTitle>{item.book_name_en}</CardTitle>
                </View>
                <View className="mt-1">
                  <Icon as={ChevronRight} size={16} token="muted-foreground" />
                </View>
              </View>
            </CardHeader>
            <CardContent>
              <Text size="sm" className="text-muted-foreground">
                {item.hadith_count} hadith{item.hadith_count === 1 ? "" : "s"}
              </Text>
            </CardContent>
          </Card>
        </Pressable>
      )}
    />
  );
}
