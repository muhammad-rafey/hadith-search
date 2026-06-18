import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import {
  collectionArabicName,
  collectionName,
  type Hadith,
  isKnownCollection,
} from "@hadith/shared-types";
import { EmptyState } from "@/components/empty-state";
import { JumpToHadith } from "@/components/jump-to-hadith";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { urduSnippetStyle } from "@/components/urdu-section";
import { useCollectionHadiths } from "@/lib/queries/use-collections";

/**
 * Collection reading view — a flat, reading-ordered, paginated list of one
 * collection's hadiths ("a collection = a book"). Replaces the old per-book
 * browse for every collection (including bukhari). Mirrors
 * apps/web/app/(app)/browse/[collection]. Pagination is driven by
 * useCollectionHadiths (useInfiniteQuery) via onEndReached.
 */
export default function CollectionScreen() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const { collection } = useLocalSearchParams<{ collection: string | string[] }>();
  // expo-router can return string | string[] for a dynamic segment; take the
  // first so a stray "/a/b" doesn't get mis-joined.
  const slug = Array.isArray(collection) ? (collection[0] ?? "") : (collection ?? "");
  const known = isKnownCollection(slug);

  const query = useCollectionHadiths(known ? slug : "");
  const hadiths = React.useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  const title = known ? collectionName(slug) : "Collection";
  const arabic = known ? collectionArabicName(slug) : null;

  if (!known) {
    return (
      <View className="flex-1 bg-background p-4">
        <Stack.Screen options={{ title: "Not found" }} />
        <EmptyState
          title="Collection not found"
          description="That collection isn't in the corpus."
          ctaLabel="Back to Browse"
          onCta={() => router.replace("/(tabs)/browse")}
        />
      </View>
    );
  }

  if (query.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Stack.Screen options={{ title }} />
        <ActivityIndicator />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View className="flex-1 bg-background p-4">
        <Stack.Screen options={{ title }} />
        <EmptyState
          tone="error"
          title="Couldn't load this collection"
          description={query.error instanceof Error ? query.error.message : "Please try again."}
          ctaLabel="Retry"
          onCta={() => query.refetch()}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title }} />
      <FlatList
        data={hadiths}
        keyExtractor={(h) => h.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: tabBarHeight + 16 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
        }}
        ListHeaderComponent={
          <View className="gap-4 pb-1">
            <View className="flex-row items-baseline justify-between gap-3">
              <Text size="2xl" weight="semibold" className="flex-1">
                {title}
              </Text>
              {arabic ? (
                <Text
                  size="xl"
                  className="text-muted-foreground"
                  style={{ writingDirection: "rtl" }}
                >
                  {arabic}
                </Text>
              ) : null}
            </View>
            <View className="gap-2 rounded-md border border-border bg-card p-3">
              <Text size="xs" weight="medium" className="uppercase text-muted-foreground">
                Jump to a hadith number
              </Text>
              <JumpToHadith collection={slug} from="browse" />
            </View>
          </View>
        }
        renderItem={({ item: h }) => <HadithRow h={h} onPress={() => goToHadith(router, h)} />}
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View className="items-center py-4">
              <ActivityIndicator />
            </View>
          ) : hadiths.length > 0 && !query.hasNextPage ? (
            <Text size="xs" className="py-3 text-center text-muted-foreground">
              End of collection · {hadiths.length.toLocaleString()} loaded.
            </Text>
          ) : null
        }
      />
    </View>
  );
}

function goToHadith(router: ReturnType<typeof useRouter>, h: Hadith) {
  router.push(`/hadith/${encodeURIComponent(h.id)}?from=browse`);
}

function HadithRow({ h, onPress }: { h: Hadith; onPress: () => void }) {
  return (
    <Pressable
      haptic={false}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Hadith ${h.hadith_number_label}`}
    >
      <Card>
        <CardHeader className="pb-2">
          <Text size="xs" className="text-muted-foreground">
            Hadith {h.hadith_number_label}
          </Text>
          {h.chapter_title_en ? (
            <Text size="base" weight="medium">
              {h.chapter_title_en}
            </Text>
          ) : null}
        </CardHeader>
        <CardContent>
          {h.narrator ? (
            <Text size="sm" className="italic text-muted-foreground">
              Narrated {h.narrator}
            </Text>
          ) : null}
          <Text size="sm" numberOfLines={2} className="mt-1">
            {h.text_en}
          </Text>
          {h.text_ur ? (
            <Text
              size="sm"
              numberOfLines={2}
              accessibilityLanguage="ur"
              className="mt-1 text-muted-foreground"
              style={urduSnippetStyle}
            >
              {h.text_ur}
            </Text>
          ) : null}
        </CardContent>
      </Card>
    </Pressable>
  );
}
