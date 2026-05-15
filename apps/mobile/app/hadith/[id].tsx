import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { ArabicSection } from "@/components/arabic-section";
import { BookmarkButton } from "@/components/bookmark-button";
import { EmptyState } from "@/components/empty-state";
import { ShareButton } from "@/components/share-button";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { type HadithViewSource, hadithNotFound, hadithViewed } from "@/lib/analytics";
import { getHadithById } from "@/lib/hadiths";

function resolveSource(from: string | undefined): HadithViewSource {
  if (from === "search" || from === "browse" || from === "bookmark") return from;
  return "deeplink";
}

/**
 * Hadith detail — mirrors apps/web/app/(app)/hadith/[id]/page.tsx: refs,
 * grade, narrator, collapsible Arabic, English, bookmark + share. Fires
 * `hadith_viewed` once per mount with the entry source (search / browse /
 * bookmark / deeplink). Unknown id → recoverable not-found (edge case #12).
 */
export default function HadithDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; from?: string }>();
  const id = decodeURIComponent(String(params.id));
  const h = React.useMemo(() => getHadithById(id), [id]);

  React.useEffect(() => {
    if (h) {
      hadithViewed(h.id, resolveSource(params.from));
    } else {
      hadithNotFound(id);
    }
  }, [h, id, params.from]);

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

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: `Bukhari ${h.hadith_number}` }} />
      <ScrollView contentContainerClassName="p-4 gap-6 pb-12">
        <View className="gap-2 border-b border-border pb-4">
          <Pressable
            haptic={false}
            onPress={() => router.push(`/(tabs)/browse/${h.book_number}`)}
            accessibilityRole="link"
          >
            <Text size="xs" weight="medium" className="uppercase text-muted-foreground">
              Book {h.book_number} · {h.book_name_en}
            </Text>
          </Pressable>
          <Text size="3xl" weight="semibold">
            Sahih al-Bukhari {h.hadith_number}
          </Text>
          {h.chapter_title_en ? (
            <Text size="lg" className="text-muted-foreground">
              {h.chapter_title_en}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-x-6 gap-y-2 pt-2">
            <Meta label="Sunnah.com" value={`bukhari:${h.hadith_number}`} />
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
          <ShareButton hadithId={h.id} title={`Sahih al-Bukhari ${h.hadith_number}`} />
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
