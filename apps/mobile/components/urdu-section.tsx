import * as React from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useUiStore } from "@/lib/store/ui-store";
import { fontSizeMultiplier } from "@/lib/themes";

// Urdu reads a touch smaller than the Arabic matn (longer sentences); rendered
// in Amiri (Naskh) — the bundled font also covers the Urdu-specific letters, so
// mobile avoids shipping a separate heavy Nastaliq asset.
const URDU_BASE_FONT = 23;
const URDU_BASE_LINE_HEIGHT = 46;

/**
 * Urdu translation body — RTL, larger size, bound to the shared `showUrdu`
 * setting (mirror of <ArabicSection>), so toggling here also flips the Settings
 * default. Renders nothing when there is no Urdu text.
 */
export function UrduSection({ text }: { text: string | null }) {
  const showUrdu = useUiStore((s) => s.showUrdu);
  const setShowUrdu = useUiStore((s) => s.setShowUrdu);
  const step = useUiStore((s) => s.fontSize);
  const scale = fontSizeMultiplier(step);

  if (!text) return null;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text size="sm" weight="medium" className="uppercase text-muted-foreground">
          Urdu
        </Text>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => setShowUrdu(!showUrdu)}
          accessibilityState={{ expanded: showUrdu }}
        >
          {showUrdu ? "Hide" : "Show"}
        </Button>
      </View>
      {showUrdu ? (
        <View className="rounded-md border border-border bg-muted/40 p-4">
          <Text
            accessibilityLanguage="ur"
            style={{
              writingDirection: "rtl",
              textAlign: "right",
              fontFamily: "Amiri-Regular",
              fontSize: Math.round(URDU_BASE_FONT * scale),
              lineHeight: Math.round(URDU_BASE_LINE_HEIGHT * scale),
            }}
          >
            {text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
