import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { FontSizeStep } from "@/lib/themes";

/**
 * UI store — superset of apps/web/lib/store.ts. The web keeps fontSize and
 * showArabic in raw localStorage keys; mobile centralizes them here so
 * screens can subscribe without useEffect hydration dances.
 *
 * Persisted: bookFilter, narratorFilter, privateMode, fontSize, showArabic
 * (durable user choices). lastQuery stays in-memory only — persisting it
 * would auto-fire a search on cold start, which we don't want.
 */
interface UiState {
  lastQuery: string;
  setLastQuery: (q: string) => void;

  bookFilter: number | null;
  narratorFilter: string;
  setBookFilter: (n: number | null) => void;
  setNarratorFilter: (s: string) => void;
  clearFilters: () => void;

  privateMode: boolean;
  setPrivateMode: (v: boolean) => void;

  fontSize: FontSizeStep;
  setFontSize: (s: FontSizeStep) => void;

  showArabic: boolean;
  setShowArabic: (v: boolean) => void;

  hydrated: boolean;
  setHydrated: (v: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      lastQuery: "",
      setLastQuery: (q) => set({ lastQuery: q }),

      bookFilter: null,
      narratorFilter: "",
      setBookFilter: (n) => set({ bookFilter: n }),
      setNarratorFilter: (s) => set({ narratorFilter: s }),
      clearFilters: () => set({ bookFilter: null, narratorFilter: "" }),

      privateMode: false,
      setPrivateMode: (v) => set({ privateMode: v }),

      fontSize: "M",
      setFontSize: (s) => set({ fontSize: s }),

      showArabic: true,
      setShowArabic: (v) => set({ showArabic: v }),

      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
    }),
    {
      name: "hadith-search:ui",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        bookFilter: state.bookFilter,
        narratorFilter: state.narratorFilter,
        privateMode: state.privateMode,
        fontSize: state.fontSize,
        showArabic: state.showArabic,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
