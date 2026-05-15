export const THEMES = ["light", "dark", "sepia"] as const;
export type Theme = (typeof THEMES)[number];

export const FONT_SIZE_STEPS = ["S", "M", "L"] as const;
export type FontSizeStep = (typeof FONT_SIZE_STEPS)[number];

/** Exported so future consumers (e.g., CSS-in-JS, tests) can reference scale values. */
export const FONT_SIZE_VALUES: Record<FontSizeStep, number> = {
  S: 0.9,
  M: 1,
  L: 1.15,
};

export function applyFontSize(step: FontSizeStep): void {
  if (typeof document === "undefined") return;
  const value = FONT_SIZE_VALUES[step];
  document.documentElement.style.setProperty("--font-size-step", String(value));
}

/**
 * Type guard for Theme. Uses THEMES.includes so future additions to THEMES
 * automatically update the guard without manual enumeration.
 */
export function isTheme(value: string | null | undefined): value is Theme {
  return THEMES.includes(value as Theme);
}

/**
 * Type guard for FontSizeStep. Uses FONT_SIZE_STEPS.includes so future
 * additions automatically update the guard.
 */
export function isFontSizeStep(value: string | null | undefined): value is FontSizeStep {
  return FONT_SIZE_STEPS.includes(value as FontSizeStep);
}
