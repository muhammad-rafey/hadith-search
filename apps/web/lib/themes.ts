export const THEMES = ["light", "dark", "sepia"] as const;
export type Theme = (typeof THEMES)[number];

export const FONT_SIZE_STEPS = ["S", "M", "L"] as const;
export type FontSizeStep = (typeof FONT_SIZE_STEPS)[number];

const FONT_SIZE_VALUES: Record<FontSizeStep, number> = {
  S: 0.9,
  M: 1,
  L: 1.15,
};

export function applyFontSize(step: FontSizeStep): void {
  if (typeof document === "undefined") return;
  const value = FONT_SIZE_VALUES[step];
  document.documentElement.style.setProperty("--font-size-step", String(value));
}

export function isTheme(value: string | null | undefined): value is Theme {
  return value === "light" || value === "dark" || value === "sepia";
}

export function isFontSizeStep(value: string | null | undefined): value is FontSizeStep {
  return value === "S" || value === "M" || value === "L";
}
