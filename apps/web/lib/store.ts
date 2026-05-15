"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UiState {
  // Last submitted query — kept so back-navigation can repopulate the box.
  lastQuery: string;
  setLastQuery: (q: string) => void;

  // Filter chips on the search page.
  bookFilter: number | null;
  narratorFilter: string;
  setBookFilter: (n: number | null) => void;
  setNarratorFilter: (s: string) => void;
  clearFilters: () => void;

  // Private mode disables the server-side query_cache write
  // (see plan/03-analytics-monitoring.md).
  privateMode: boolean;
  setPrivateMode: (v: boolean) => void;
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
    }),
    {
      name: "hadith-search:ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ privateMode: state.privateMode }),
    },
  ),
);
