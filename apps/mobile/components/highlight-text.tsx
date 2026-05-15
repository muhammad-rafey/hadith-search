import * as React from "react";
import { splitByTokens } from "@/lib/highlight";
import { Text, type TextProps } from "@/components/ui/text";

/**
 * Renders text with query tokens emphasized. The web wraps matches in <mark>
 * (a tinted background); RN can't paint inline backgrounds reliably across
 * platforms, so matched spans are primary-colored + semibold instead — same
 * intent, native-appropriate execution (see plan feature matrix).
 */
export function HighlightText({
  text,
  tokens,
  ...textProps
}: { text: string; tokens: string[] } & Omit<TextProps, "children">) {
  const segments = React.useMemo(() => {
    // Attach a stable key = cumulative char offset (unique within the text),
    // so we never key on a bare array index.
    let offset = 0;
    return splitByTokens(text, tokens).map((seg) => {
      const key = `${offset}:${seg.match ? "m" : "t"}`;
      offset += seg.text.length;
      return { ...seg, key };
    });
  }, [text, tokens]);

  return (
    <Text {...textProps}>
      {segments.map((seg) =>
        seg.match ? (
          // No prop spread here: a nested RN <Text> inherits the parent's
          // size/font, and spreading caller props could override the emphasis.
          <Text key={seg.key} weight="semibold" className="text-primary">
            {seg.text}
          </Text>
        ) : (
          <React.Fragment key={seg.key}>{seg.text}</React.Fragment>
        ),
      )}
    </Text>
  );
}
