import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { collectionName, isKnownCollection } from "@hadith/shared-types";
import { ArabicSection } from "@/components/arabic-section";
import { BookmarkButton } from "@/components/bookmark-button";
import { EmptyState } from "@/components/empty-state";
import { ShareButton } from "@/components/share-button";
import { StatusBarStrip } from "@/components/status-bar-strip";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { type HadithViewSource, hadithNotFound, hadithViewed } from "@/lib/analytics";
import { getHadithById } from "@/lib/hadiths";

function resolveSource(from: string | undefined): HadithViewSource {
  if (from === "search" || from === "browse" || from === "bookmark") return from;
  return "deeplink";
}

export default function HadithDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string | string[]; from?: string }>();
  // expo-router can return an array; take the first segment. The param is
  // already decoded by expo-router so no decodeURIComponent here.
  const id = Array.isArray(params.id) ? (params.id[0] ?? "") : (params.id ?? "");

  const query = useQuery({
    queryKey: ["hadith", id],
    queryFn: () => getHadithById(id),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const h = query.data ?? null;

  const trackedId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (query.isLoading) return;
    if (trackedId.current === id) return;
    trackedId.current = id;
    if (h) {
      hadithViewed(h.id, resolveSource(params.from));
    } else {
      hadithNotFound(id);
    }
  }, [h, id, params.from, query.isLoading]);

  if (query.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Stack.Screen options={{ title: "Loading…" }} />
        <ActivityIndicator />
      </View>
    );
  }

  if (!h) {
    return (
      <View className="flex-1 bg-background p-4">
        <Stack.Screen options={{ title: "Not found" }} />
        <EmptyState
          title="Hadith not found"
          description="That hadith isn't in the corpus yet."
          ctaLabel="Go to Search"
          onCta={() => router.replace("/(tabs)/search")}
        />
      </View>
    );
  }

  const grade = h.grades?.[0];
  const collectionLabel = collectionName(h.collection);
  const heading = `${collectionLabel} ${h.hadith_number_label}`;

  return (
    <View className="flex-1 bg-background">
      <StatusBarStrip />
      <Stack.Screen options={{ title: `${collectionLabel} ${h.hadith_number_label}` }} />
      <ScrollView contentContainerClassName="p-4 gap-6 pb-12">
        <View className="gap-2 border-b border-border pb-4">
          {isKnownCollection(h.collection) ? (
            <Pressable
              haptic={false}
              onPress={() => router.push(`/(tabs)/browse/${h.collection}`)}
              accessibilityRole="link"
            >
              <Text size="xs" weight="medium" className="uppercase text-muted-foreground">
                {collectionLabel}
              </Text>
            </Pressable>
          ) : (
            <Text size="xs" weight="medium" className="uppercase text-muted-foreground">
              {collectionLabel}
            </Text>
          )}
          <Text size="3xl" weight="semibold">
            {heading}
          </Text>
          {h.chapter_title_en ? (
            <Text size="lg" className="text-muted-foreground">
              {h.chapter_title_en}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-x-6 gap-y-2 pt-2">
            <Meta label="In-book" value={h.in_book_ref} />
            {h.usc_msa_ref ? <Meta label="USC-MSA" value={h.usc_msa_ref} /> : null}
            {grade ? <Meta label="Grade" value={`${grade.grade} (${grade.grader})`} /> : null}
          </View>
        </View>

        {h.narrator ? (
          <Text className="italic text-muted-foreground">Narrated {h.narrator}</Text>
        ) : null}

        <ArabicSection text={h.text_ar} />

        <View className="gap-2">
          <Text size="sm" weight="medium" className="uppercase text-muted-foreground">
            English
          </Text>
          <Text size="lg" leading={1.6}>
            {h.text_en_full}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-2 border-t border-border pt-4">
          <BookmarkButton hadithId={h.id} />
          <ShareButton hadithId={h.id} title={heading} />
        </View>
      </ScrollView>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text size="xs" weight="medium" className="uppercase text-muted-foreground">
        {label}
      </Text>
      <Text size="xs" className="text-muted-foreground">
        {value}
      </Text>
    </View>
  );
}
