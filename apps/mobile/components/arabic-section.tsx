import * as React from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useUiStore } from "@/lib/store/ui-store";
import { fontSizeMultiplier } from "@/lib/themes";

// Arabic reads ~10–15% larger than Latin; these are the unscaled base sizes.
const ARABIC_BASE_FONT = 26;
const ARABIC_BASE_LINE_HEIGHT = 50;

/**
 * Arabic body — RTL, Amiri font, larger size. Visibility is bound to the
 * shared `showArabic` setting (like the web's ArabicSection writing the
 * shared localStorage key), so toggling here also flips the Settings default.
 * Renders nothing when there is no Arabic text (plan edge case #8).
 */
export function ArabicSection({ text }: { text: string | null }) {
  const showArabic = useUiStore((s) => s.showArabic);
  const setShowArabic = useUiStore((s) => s.setShowArabic);
  const step = useUiStore((s) => s.fontSize);
  const scale = fontSizeMultiplier(step);

  if (!text) return null;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text size="sm" weight="medium" className="uppercase text-muted-foreground">
          Arabic
        </Text>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => setShowArabic(!showArabic)}
          accessibilityState={{ expanded: showArabic }}
        >
          {showArabic ? "Hide" : "Show"}
        </Button>
      </View>
      {showArabic ? (
        <View className="rounded-md border border-border bg-muted/40 p-4">
          <Text
            accessibilityLanguage="ar"
            style={{
              writingDirection: "rtl",
              textAlign: "right",
              fontFamily: "Amiri-Regular",
              fontSize: Math.round(ARABIC_BASE_FONT * scale),
              lineHeight: Math.round(ARABIC_BASE_LINE_HEIGHT * scale),
            }}
          >
            {text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
