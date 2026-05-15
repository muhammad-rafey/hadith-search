/** @type {import('tailwindcss').Config} */
// Mirrors apps/web token names. Web (Tailwind v4) reads tokens from
// @theme in globals.css; NativeWind v4 (Tailwind v3) needs them here.
// The HSL triples themselves are injected at runtime per theme via
// `vars()` in components/theme-provider.tsx (light / dark / sepia).
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        "muted-foreground": "hsl(var(--muted-foreground) / <alpha-value>)",
        card: "hsl(var(--card) / <alpha-value>)",
        "card-foreground": "hsl(var(--card-foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        primary: "hsl(var(--primary) / <alpha-value>)",
        "primary-foreground": "hsl(var(--primary-foreground) / <alpha-value>)",
        accent: "hsl(var(--accent) / <alpha-value>)",
        "accent-foreground": "hsl(var(--accent-foreground) / <alpha-value>)",
        destructive: "hsl(var(--destructive) / <alpha-value>)",
        "destructive-foreground": "hsl(var(--destructive-foreground) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
      },
      borderRadius: {
        DEFAULT: "8px",
        md: "8px",
        lg: "10px",
      },
      fontFamily: {
        sans: ["Inter-Regular"],
        medium: ["Inter-Medium"],
        semibold: ["Inter-SemiBold"],
        arabic: ["Amiri-Regular"],
        "arabic-bold": ["Amiri-Bold"],
      },
    },
  },
  plugins: [],
};
