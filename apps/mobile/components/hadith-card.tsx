import { ArrowRight } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { collectionName, type SearchResult } from "@hadith/shared-types";
import { HighlightText } from "@/components/highlight-text";
import { Icon } from "@/components/icon";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";

/**
 * Search result card — same content/layout as
 * apps/web/components/hadith-card.tsx (header refs, chapter, narrator,
 * highlighted body, footer). Whole card is the tap target on mobile.
 */
function HadithCardImpl({
  result,
  position,
  queryTokens,
  onPress,
}: {
  result: SearchResult;
  position: number;
  queryTokens: string[];
  onPress: (result: SearchResult, position: number) => void;
}) {
  // A reference jump (e.g. "muslim 8a") can surface a non-bukhari result, so
  // label from the row's own collection rather than hardcoding bukhari.
  const collectionLabel = collectionName(result.collection);
  return (
    <Pressable
      haptic={false}
      onPress={() => onPress(result, position)}
      accessibilityRole="button"
      accessibilityLabel={`${collectionLabel} ${result.hadith_number_label}. Read full hadith.`}
    >
      <Card>
        <CardHeader className="gap-1 pb-2">
          <View className="flex-row flex-wrap items-baseline justify-between gap-2">
            <Text size="xs" weight="semibold">
              {collectionLabel} {result.hadith_number_label}
            </Text>
            <Text size="xs" className="text-muted-foreground">
              {result.in_book_ref}
              {result.usc_msa_ref ? ` · ${result.usc_msa_ref}` : ""}
            </Text>
          </View>
          {result.chapter_title_en ? (
            <Text size="sm" weight="medium">
              {result.chapter_title_en}
            </Text>
          ) : null}
        </CardHeader>
        <CardContent className="gap-2">
          {result.narrator ? (
            <Text size="sm" className="italic text-muted-foreground">
              Narrated {result.narrator}
            </Text>
          ) : null}
          <HighlightText
            text={result.text_en_full}
            tokens={queryTokens}
            size="base"
            numberOfLines={4}
          />
          <View className="flex-row items-center justify-between pt-2">
            <Text size="xs" numberOfLines={1} className="flex-1 text-muted-foreground">
              {collectionLabel}
            </Text>
            <View className="flex-row items-center gap-1">
              <Text size="xs" weight="medium" className="text-primary">
                Read full hadith
              </Text>
              <Icon as={ArrowRight} size={13} token="primary" />
            </View>
          </View>
        </CardContent>
      </Card>
    </Pressable>
  );
}

export const HadithCard = React.memo(HadithCardImpl);
