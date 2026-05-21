import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { type BookSummary, getAllBooks } from "@/lib/hadiths";

export default function BrowseScreen() {
  const router = useRouter();
  const query = useQuery<BookSummary[]>({
    queryKey: ["books"],
    queryFn: getAllBooks,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const books = query.data ?? [];

  if (query.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      data={books}
      keyExtractor={(b) => String(b.book_number)}
      refreshing={query.isFetching && !query.isLoading}
      onRefresh={() => query.refetch()}
      contentContainerClassName="p-4 gap-3"
      ListHeaderComponent={
        <Text size="sm" className="pb-1 text-muted-foreground">
          {books.length} book{books.length === 1 ? "" : "s"} in Sahih al-Bukhari.
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          haptic={false}
          onPress={() => router.push(`/(tabs)/browse/${item.book_number}`)}
          accessibilityRole="button"
          accessibilityLabel={`${item.book_name_en}`}
        >
          <Card>
            <CardHeader className="pb-2">
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
