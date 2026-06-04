"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UiState {
  // Last submitted query — kept so back-navigation can repopulate the box.
  lastQuery: string;
  setLastQuery: (q: string) => void;

  // Private mode disables the server-side query_cache write
  // (see plan/03-analytics-monitoring.md).
  privateMode: boolean;
  setPrivateMode: (v: boolean) => void;

  // Controls Arabic text display on the hadith detail page and Settings.
  // Written by Settings; read by <ArabicSection> — single source of truth.
  showArabic: boolean;
  setShowArabic: (v: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      lastQuery: "",
      setLastQuery: (q) => set({ lastQuery: q }),
      privateMode: false,
      setPrivateMode: (v) => set({ privateMode: v }),
      showArabic: true,
      setShowArabic: (v) => set({ showArabic: v }),
    }),
    {
      name: "hadith-search:ui",
      // createJSONStorage(() => localStorage) is lazy — the thunk is only called
      // on first hydration, so this is safe at module top level in SSR contexts.
      storage: createJSONStorage(() => localStorage),
      // Only persist user preferences; ephemeral filter state is session-only.
      partialize: (state) => ({
        privateMode: state.privateMode,
        showArabic: state.showArabic,
      }),
      version: 1,
      // Pre-v1 builds persisted this store with no version field — Zustand reads
      // that back as version 0, and without a migrate it logs "State loaded from
      // storage couldn't be migrated…". The old shape predates showArabic, so
      // carry the stored prefs forward; new keys fall back to their defaults.
      // persist re-saves at the current version after this runs, so it self-heals.
      migrate: (persisted) => {
        const prev = persisted as Partial<UiState> | null | undefined;
        return {
          privateMode: prev?.privateMode ?? false,
          showArabic: prev?.showArabic ?? true,
        } as UiState;
      },
    },
  ),
);
