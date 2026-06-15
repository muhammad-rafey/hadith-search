import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { FontSizeStep } from "@/lib/themes";

/**
 * UI store — superset of apps/web/lib/store.ts. The web keeps fontSize and
 * showArabic in raw localStorage keys; mobile centralizes them here so
 * screens can subscribe without useEffect hydration dances.
 *
 * Persisted: privateMode, fontSize, showArabic, showUrdu (durable user choices).
 * lastQuery stays in-memory only — persisting it would auto-fire a search on
 * cold start, which we don't want.
 */
interface UiState {
  lastQuery: string;
  setLastQuery: (q: string) => void;

  privateMode: boolean;
  setPrivateMode: (v: boolean) => void;

  fontSize: FontSizeStep;
  setFontSize: (s: FontSizeStep) => void;

  showArabic: boolean;
  setShowArabic: (v: boolean) => void;

  showUrdu: boolean;
  setShowUrdu: (v: boolean) => void;

  hydrated: boolean;
  setHydrated: (v: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      lastQuery: "",
      setLastQuery: (q) => set({ lastQuery: q }),

      privateMode: false,
      setPrivateMode: (v) => set({ privateMode: v }),

      fontSize: "M",
      setFontSize: (s) => set({ fontSize: s }),

      showArabic: true,
      setShowArabic: (v) => set({ showArabic: v }),

      showUrdu: true,
      setShowUrdu: (v) => set({ showUrdu: v }),

      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
    }),
    {
      name: "hadith-search:ui",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        privateMode: state.privateMode,
        fontSize: state.fontSize,
        showArabic: state.showArabic,
        showUrdu: state.showUrdu,
      }),
      // (state, error): on a read failure `state` is undefined — still flip
      // `hydrated` via the store ref so consumers don't wait forever.
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[ui-store] rehydrate failed", error);
        useUiStore.getState().setHydrated(true);
      },
    },
  ),
);
