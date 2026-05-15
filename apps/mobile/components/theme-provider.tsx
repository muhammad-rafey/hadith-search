import AsyncStorage from "@react-native-async-storage/async-storage";
import { vars } from "nativewind";
import * as React from "react";
import { View } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type Theme, isTheme, nextTheme } from "@/lib/themes";
import { TOKENS } from "@/lib/tokens";

/**
 * Theme engine. next-themes is web-only, so this replicates its behavior:
 * a persisted theme value (light / dark / sepia) and a wrapper that injects
 * the matching HSL tokens into NativeWind via vars(), so every Tailwind
 * class (`bg-background`, `text-foreground`, …) resolves per theme — exactly
 * the same class names the web uses.
 */
interface ThemeStore {
  theme: Theme;
  hydrated: boolean;
  setTheme: (t: Theme) => void;
  setHydrated: (v: boolean) => void;
}

const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "light",
      hydrated: false,
      setTheme: (t) => set({ theme: t }),
      setHydrated: (v) => set({ hydrated: v }),
    }),
    {
      name: "hadith-search:theme",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        if (state && !isTheme(state.theme)) state.theme = "light";
        state?.setHydrated(true);
      },
    },
  ),
);

const THEME_VARS: Record<Theme, ReturnType<typeof vars>> = {
  light: vars(toCssVars("light")),
  dark: vars(toCssVars("dark")),
  sepia: vars(toCssVars("sepia")),
};

function toCssVars(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, triple] of Object.entries(TOKENS[theme])) {
    out[`--${name}`] = triple;
  }
  return out;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      cycleTheme: () => setTheme(nextTheme(theme)),
    }),
    [theme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={THEME_VARS[theme]} className="flex-1 bg-background">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}
