import { useTabBarHeight } from "@/lib/use-tab-bar-height";
import { useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { ActivityIndicator, FlatList, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useQuery } from "@tanstack/react-query";
import { collectionName, type Hadith } from "@hadith/shared-types";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { StatusBarStrip } from "@/components/status-bar-strip";
import { urduSnippetStyle } from "@/components/urdu-section";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { getHadithsByIds } from "@/lib/hadiths";
import { useBookmarks } from "@/lib/queries/use-bookmarks";

export default function BookmarksScreen() {
  const tabBarHeight = useTabBarHeight();
  const router = useRouter();
  const ids = useBookmarks((s) => s.ids);
  const remove = useBookmarks((s) => s.remove);

  const idsKey = ids.join(",");
  const itemsQuery = useQuery<Hadith[]>({
    queryKey: ["bookmarks", idsKey],
    queryFn: () => getHadithsByIds(ids),
    enabled: ids.length > 0,
    staleTime: 60 * 60 * 1000,
  });
  const items = itemsQuery.data ?? [];

  return (
    <View className="flex-1 bg-background">
      <StatusBarStrip />
      <FlatList
        data={items}
        keyExtractor={(h) => h.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: tabBarHeight + 16 }}
        ListHeaderComponent={
          <View className="pb-1">
            <Text size="2xl" weight="semibold">
              Bookmarks
            </Text>
            <Text size="sm" className="mt-1 text-muted-foreground">
              Saved on this device. {items.length} item{items.length === 1 ? "" : "s"}.
            </Text>
          </View>
        }
        ListEmptyComponent={
          ids.length > 0 && itemsQuery.isLoading ? (
            <View className="items-center py-8">
              <ActivityIndicator />
            </View>
          ) : ids.length > 0 && itemsQuery.isError ? (
            <EmptyState
              title="Couldn't load bookmarks"
              description={
                itemsQuery.error instanceof Error
                  ? itemsQuery.error.message
                  : "Network error. Your saved IDs are safe — try again."
              }
              ctaLabel="Retry"
              onCta={() => itemsQuery.refetch()}
            />
          ) : (
            <EmptyState
              title="No bookmarks yet."
              description="Open a hadith and tap Bookmark to save it here."
              ctaLabel="Start searching"
              onCta={() => router.push("/(tabs)/search")}
            />
          )
        }
        renderItem={({ item: h }) => {
          const label = `${collectionName(h.collection)} ${h.hadith_number_label}`;
          return (
            <ReanimatedSwipeable
              renderRightActions={() => (
                <Pressable
                  onPress={() => remove(h.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove bookmark for ${label}`}
                  className="my-0.5 ml-2 w-20 items-center justify-center rounded-md bg-destructive"
                >
                  <Icon as={Trash2} size={18} token="destructive-foreground" />
                  <Text size="xs" className="mt-1 text-destructive-foreground">
                    Remove
                  </Text>
                </Pressable>
              )}
            >
              <Pressable
                haptic={false}
                onPress={() => router.push(`/hadith/${encodeURIComponent(h.id)}?from=bookmark`)}
                accessibilityRole="button"
                accessibilityLabel={label}
              >
                <Card>
                  <CardHeader className="pb-2">
                    <Text size="xs" className="text-muted-foreground">
                      {label}
                    </Text>
                    <Text size="base" weight="medium">
                      {h.chapter_title_en ?? `Hadith ${h.hadith_number_label}`}
                    </Text>
                  </CardHeader>
                  <CardContent className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <Text size="sm" numberOfLines={2} className="text-muted-foreground">
                        {h.text_en}
                      </Text>
                      {h.text_ur ? (
                        <Text
                          size="sm"
                          numberOfLines={2}
                          accessibilityLanguage="ur"
                          className="text-muted-foreground"
                          style={urduSnippetStyle}
                        >
                          {h.text_ur}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => remove(h.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove bookmark for ${label}`}
                      hitSlop={8}
                      className="flex-row items-center gap-1"
                    >
                      <Icon as={Trash2} size={16} token="muted-foreground" />
                      <Text size="xs" className="text-muted-foreground">
                        Remove
                      </Text>
                    </Pressable>
                  </CardContent>
                </Card>
              </Pressable>
            </ReanimatedSwipeable>
          );
        }}
      />
    </View>
  );
}
