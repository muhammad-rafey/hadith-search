import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import type { CollectionSummary } from "@/lib/hadiths";
import { useCollectionList } from "@/lib/queries/use-collections";

/**
 * Browse landing — the 15 collections ("a collection = a book"). Tapping one
 * opens its flat, reading-ordered hadith list. Mirrors apps/web browse.
 */
export default function BrowseScreen() {
  const router = useRouter();
  const query = useCollectionList();
  const collections = query.data ?? [];

  if (query.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View className="flex-1 bg-background p-4">
        <EmptyState
          tone="error"
          title="Couldn't load collections"
          description={query.error instanceof Error ? query.error.message : "Please try again."}
          ctaLabel="Retry"
          onCta={() => query.refetch()}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={collections}
      keyExtractor={(c) => c.collection}
      refreshing={query.isFetching && !query.isLoading}
      onRefresh={() => query.refetch()}
      contentContainerClassName="p-4 gap-3"
      ListHeaderComponent={
        collections.length > 0 ? (
          <Text size="sm" className="pb-1 text-muted-foreground">
            {collections.length} collection{collections.length === 1 ? "" : "s"}.
          </Text>
        ) : null
      }
      ListEmptyComponent={
        // Success but empty — usually a brief server hiccup (the API collapses a
        // transient failure to an empty list). Keep the tab recoverable.
        <EmptyState
          title="No collections to show"
          description="The server may be briefly unreachable. Pull down to refresh or try again."
          ctaLabel="Retry"
          onCta={() => query.refetch()}
        />
      }
      renderItem={({ item }) => (
        <CollectionRow
          item={item}
          onPress={() => router.push(`/(tabs)/browse/${item.collection}`)}
        />
      )}
    />
  );
}

function CollectionRow({ item, onPress }: { item: CollectionSummary; onPress: () => void }) {
  return (
    <Pressable
      haptic={false}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.hadith_count} hadiths`}
    >
      <Card>
        <CardHeader className="pb-2">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <CardTitle>{item.name}</CardTitle>
              {item.arabic_name ? (
                <Text
                  size="lg"
                  className="mt-0.5 text-muted-foreground"
                  style={{ writingDirection: "rtl" }}
                >
                  {item.arabic_name}
                </Text>
              ) : null}
            </View>
            <View className="mt-1">
              <Icon as={ChevronRight} size={16} token="muted-foreground" />
            </View>
          </View>
        </CardHeader>
        <CardContent>
          <Text size="sm" className="text-muted-foreground">
            {item.hadith_count.toLocaleString()} hadith{item.hadith_count === 1 ? "" : "s"}
          </Text>
        </CardContent>
      </Card>
    </Pressable>
  );
}
