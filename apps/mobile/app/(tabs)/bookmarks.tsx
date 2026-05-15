import { useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import * as React from "react";
import { FlatList, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Hadith } from "@hadith/shared-types";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { getHadithById } from "@/lib/hadiths";
import { useBookmarks } from "@/lib/queries/use-bookmarks";

/**
 * Bookmarks — mirrors apps/web/app/(app)/bookmarks/page.tsx. Reads the same
 * Zustand store, resolves ids → hadiths, drops any that no longer exist.
 * Swipe-to-delete (gesture users) plus an always-visible Remove button
 * (keyboard / assistive-tech users) — both call the same store action.
 */
export default function BookmarksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const ids = useBookmarks((s) => s.ids);
  const remove = useBookmarks((s) => s.remove);

  const items = React.useMemo(
    () => ids.map((id) => getHadithById(id)).filter((x): x is Hadith => x !== null),
    [ids],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FlatList
        data={items}
        keyExtractor={(h) => h.id}
        contentContainerClassName="p-4 gap-3"
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
          <EmptyState
            title="No bookmarks yet."
            description="Open a hadith and tap Bookmark to save it here."
            ctaLabel="Start searching"
            onCta={() => router.push("/(tabs)/search")}
          />
        }
        renderItem={({ item: h }) => (
          <Swipeable
            renderRightActions={() => (
              <Pressable
                onPress={() => remove(h.id)}
                accessibilityRole="button"
                accessibilityLabel={`Remove bookmark for hadith ${h.hadith_number}`}
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
              accessibilityLabel={`Hadith ${h.hadith_number}`}
            >
              <Card>
                <CardHeader className="pb-2">
                  <Text size="xs" className="text-muted-foreground">
                    {h.in_book_ref} · Bukhari {h.hadith_number}
                  </Text>
                  <Text size="base" weight="medium">
                    {h.chapter_title_en ?? `Hadith ${h.hadith_number}`}
                  </Text>
                </CardHeader>
                <CardContent className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text size="sm" numberOfLines={2} className="text-muted-foreground">
                      {h.text_en}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => remove(h.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove bookmark for hadith ${h.hadith_number}`}
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
          </Swipeable>
        )}
      />
    </View>
  );
}
