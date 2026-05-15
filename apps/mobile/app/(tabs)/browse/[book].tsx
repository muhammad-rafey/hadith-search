import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { FlatList, View } from "react-native";
import type { Hadith } from "@hadith/shared-types";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { type BookSummary, getBookByNumber, getHadithsForBook } from "@/lib/hadiths";

/**
 * Hadiths in a book — mirrors apps/web/app/(app)/browse/[book]/page.tsx,
 * including the not-found path for an out-of-range book number.
 */
export default function BookScreen() {
  const router = useRouter();
  const { book } = useLocalSearchParams<{ book: string }>();
  const n = Number.parseInt(String(book), 10);

  const meta: BookSummary | null = Number.isFinite(n) ? getBookByNumber(n) : null;
  const hadiths: Hadith[] = meta ? getHadithsForBook(n) : [];

  if (!meta) {
    return (
      <View className="flex-1 bg-background p-4">
        <Stack.Screen options={{ title: "Not found" }} />
        <EmptyState
          title="Book not found"
          description="That book number isn't in the corpus."
          ctaLabel="Back to Browse"
          onCta={() => router.replace("/(tabs)/browse")}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: `Book ${meta.book_number}` }} />
      <FlatList
        data={hadiths}
        keyExtractor={(h) => h.id}
        contentContainerClassName="p-4 gap-3"
        ListHeaderComponent={
          <View className="pb-1">
            <Text size="xs" weight="medium" className="uppercase text-muted-foreground">
              Book {meta.book_number}
            </Text>
            <Text size="2xl" weight="semibold">
              {meta.book_name_en}
            </Text>
            <Text size="sm" className="mt-1 text-muted-foreground">
              {hadiths.length} hadith{hadiths.length === 1 ? "" : "s"}
            </Text>
          </View>
        }
        renderItem={({ item: h }) => (
          <Pressable
            haptic={false}
            onPress={() => router.push(`/hadith/${encodeURIComponent(h.id)}?from=browse`)}
            accessibilityRole="button"
            accessibilityLabel={`Hadith ${h.hadith_number}`}
          >
            <Card>
              <CardHeader className="pb-2">
                <Text size="xs" className="text-muted-foreground">
                  {h.in_book_ref} · Hadith {h.hadith_number}
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
              </CardContent>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}
