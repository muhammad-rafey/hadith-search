import type { Config } from "tailwindcss";

/**
 * Tailwind v4 reads most configuration from CSS via `@theme` in
 * `app/globals.css`. This file is kept as a thin marker so editors
 * and tooling can locate the project root, and so future plugins
 * have a place to live.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
};

export default config;
