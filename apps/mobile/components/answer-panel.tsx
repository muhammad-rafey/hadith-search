import { Info, Sparkles } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { type AnswerCitation, type AnswerResponse, collectionName } from "@hadith/shared-types";
import { Icon } from "@/components/icon";
import { Skeleton } from "@/components/skeleton";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";

interface AnswerPanelProps {
  answer: AnswerResponse | null;
  loading: boolean;
  /** Navigate to a cited hadith. Owned by the screen (mirrors result presses). */
  onCitationPress: (hadithId: string) => void;
}

/**
 * AI answer surface for the search screen header — port of
 * apps/web/components/answer-panel.tsx. Loading skeleton, grounded answer with
 * tappable citation chips, or a muted abstain/degraded message.
 */
function AnswerPanelImpl({ answer, loading, onCitationPress }: AnswerPanelProps) {
  if (!loading && !answer) return null;
  const answered = answer?.status === "answered";

  return (
    <View
      accessibilityLabel="AI answer"
      className="gap-2 rounded-lg border border-border bg-card p-4"
    >
      <View className="flex-row items-center gap-2">
        <Icon as={Sparkles} size={16} token="primary" />
        <Text size="sm" weight="medium">
          Answer
        </Text>
      </View>

      {loading ? (
        <View className="gap-2" accessibilityLabel="Generating answer">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </View>
      ) : answer ? (
        <>
          <Text
            size={answered ? "base" : "sm"}
            className={answered ? "leading-relaxed" : "text-muted-foreground"}
          >
            {answer.answer}
          </Text>

          {answered && answer.citations.length > 0 ? (
            <View className="mt-1 gap-1.5">
              <Text size="xs" weight="medium" className="text-muted-foreground">
                Based on
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {answer.citations.map((c: AnswerCitation) => (
                  <Pressable
                    key={c.hadith_id}
                    haptic={false}
                    onPress={() => onCitationPress(c.hadith_id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${collectionName(c.collection)} ${c.hadith_number_label}`}
                    className="rounded-full border border-border bg-background px-2.5 py-0.5"
                  >
                    <Text size="xs" weight="medium">
                      {collectionName(c.collection)} {c.hadith_number_label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {answered ? (
            <View className="mt-1 flex-row items-start gap-1.5">
              <Icon as={Info} size={14} token="muted-foreground" />
              <Text size="xs" className="flex-1 text-muted-foreground">
                AI-generated from the hadiths below. Verify against the source text.
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export const AnswerPanel = React.memo(AnswerPanelImpl);
