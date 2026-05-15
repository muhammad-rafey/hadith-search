import type { Theme } from "./themes";

/**
 * HSL token triples per theme. These are the exact values from
 * apps/web/app/globals.css (:root, [data-theme="dark"], [data-theme="sepia"]),
 * kept in sync so web and mobile render identically.
 *
 * Consumed by components/theme-provider.tsx, which feeds them to NativeWind's
 * `vars()` so Tailwind classes like `bg-background` resolve per theme.
 */
type TokenName =
  | "background"
  | "foreground"
  | "muted"
  | "muted-foreground"
  | "card"
  | "card-foreground"
  | "border"
  | "input"
  | "primary"
  | "primary-foreground"
  | "accent"
  | "accent-foreground"
  | "destructive"
  | "destructive-foreground"
  | "ring";

export const TOKENS: Record<Theme, Record<TokenName, string>> = {
  light: {
    background: "0 0% 100%",
    foreground: "222 47% 11%",
    muted: "210 40% 96%",
    "muted-foreground": "215 16% 47%",
    card: "0 0% 100%",
    "card-foreground": "222 47% 11%",
    border: "214 32% 91%",
    input: "214 32% 91%",
    primary: "158 64% 32%",
    "primary-foreground": "0 0% 100%",
    accent: "210 40% 96%",
    "accent-foreground": "222 47% 11%",
    destructive: "0 84% 60%",
    "destructive-foreground": "0 0% 100%",
    ring: "158 64% 32%",
  },
  dark: {
    background: "222 47% 6%",
    foreground: "210 40% 98%",
    muted: "217 33% 17%",
    "muted-foreground": "215 20% 65%",
    card: "222 47% 8%",
    "card-foreground": "210 40% 98%",
    border: "217 33% 17%",
    input: "217 33% 17%",
    primary: "158 64% 45%",
    "primary-foreground": "222 47% 11%",
    accent: "217 33% 17%",
    "accent-foreground": "210 40% 98%",
    destructive: "0 62% 45%",
    "destructive-foreground": "210 40% 98%",
    ring: "158 64% 45%",
  },
  sepia: {
    background: "39 50% 95%",
    foreground: "30 30% 20%",
    muted: "39 35% 88%",
    "muted-foreground": "30 20% 40%",
    card: "39 55% 97%",
    "card-foreground": "30 30% 20%",
    border: "39 25% 78%",
    input: "39 25% 78%",
    primary: "25 60% 38%",
    "primary-foreground": "39 50% 97%",
    accent: "39 35% 88%",
    "accent-foreground": "30 30% 20%",
    destructive: "0 70% 45%",
    "destructive-foreground": "39 50% 97%",
    ring: "25 60% 38%",
  },
};

/** Convenience: a raw `hsl(...)` string for a token (used outside className). */
export function hsl(theme: Theme, token: TokenName, alpha = 1): string {
  const triple = TOKENS[theme][token];
  return alpha === 1 ? `hsl(${triple})` : `hsl(${triple} / ${alpha})`;
}
