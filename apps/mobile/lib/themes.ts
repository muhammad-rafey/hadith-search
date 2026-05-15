// Mirrors apps/web/lib/themes.ts. The web's applyFontSize() mutates a CSS
// variable on <html>; on RN the multiplier is consumed directly by the
// themed <Text> wrapper, so we export the values instead.

export const THEMES = ["light", "dark", "sepia"] as const;
export type Theme = (typeof THEMES)[number];

export const FONT_SIZE_STEPS = ["S", "M", "L"] as const;
export type FontSizeStep = (typeof FONT_SIZE_STEPS)[number];

export const FONT_SIZE_VALUES: Record<FontSizeStep, number> = {
  S: 0.9,
  M: 1,
  L: 1.15,
};

export function fontSizeMultiplier(step: FontSizeStep): number {
  return FONT_SIZE_VALUES[step];
}

export function isTheme(value: string | null | undefined): value is Theme {
  return value === "light" || value === "dark" || value === "sepia";
}

export function isFontSizeStep(value: string | null | undefined): value is FontSizeStep {
  return value === "S" || value === "M" || value === "L";
}

export function nextTheme(current: Theme): Theme {
  return current === "light" ? "dark" : current === "dark" ? "sepia" : "light";
}
