import * as React from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { fontSizeMultiplier } from "@/lib/themes";
import { useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";

/**
 * Themed Text. Replaces the web's global `--font-size-step` CSS multiply:
 * a `size` token is multiplied by the app-level S/M/L step from the UI
 * store. OS-level accessibility scaling is still honored but capped at
 * 1.6x so layouts don't break (plan edge case #10).
 */
type SizeToken = "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl";
type WeightToken = "regular" | "medium" | "semibold";

const SIZE_PX: Record<SizeToken, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
};

const WEIGHT_FONT: Record<WeightToken, string> = {
  regular: "Inter-Regular",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
};

export interface TextProps extends RNTextProps {
  size?: SizeToken;
  weight?: WeightToken;
  /** Multiply line height; defaults to 1.5 (1.65 for body-like sizes). */
  leading?: number;
  className?: string;
}

export function Text({
  size = "base",
  weight = "regular",
  leading,
  className,
  style,
  maxFontSizeMultiplier = 1.6,
  ...rest
}: TextProps) {
  const step = useUiStore((s) => s.fontSize);
  const px = Math.round(SIZE_PX[size] * fontSizeMultiplier(step));
  const lh = Math.round(px * (leading ?? (size === "base" || size === "lg" ? 1.6 : 1.4)));

  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      className={cn("text-foreground", className)}
      style={[{ fontSize: px, lineHeight: lh, fontFamily: WEIGHT_FONT[weight] }, style]}
      {...rest}
    />
  );
}
