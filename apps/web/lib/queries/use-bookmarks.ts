"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { bookmarkAdded, bookmarkRemoved } from "@/lib/analytics";

interface BookmarksState {
  ids: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  has: (id: string) => boolean;
}

export const useBookmarks = create<BookmarksState>()(
  persist(
    (set, get) => ({
      ids: [],
      add: (id) => {
        if (get().ids.includes(id)) return;
        set({ ids: [...get().ids, id] });
        bookmarkAdded(id);
      },
      remove: (id) => {
        // Early-return guard: don't fire analytics if id isn't bookmarked.
        if (!get().ids.includes(id)) return;
        set({ ids: get().ids.filter((x) => x !== id) });
        bookmarkRemoved(id);
      },
      // Self-contained toggle: single membership check, inline set, direct analytics.
      // Does NOT delegate to add/remove so analytics can't double-fire.
      toggle: (id) => {
        set((state) => {
          const isBookmarked = state.ids.includes(id);
          if (isBookmarked) {
            bookmarkRemoved(id);
            return { ids: state.ids.filter((x) => x !== id) };
          }
          bookmarkAdded(id);
          return { ids: [...state.ids, id] };
        });
      },
      has: (id) => get().ids.includes(id),
    }),
    {
      name: "hadith-search:bookmarks",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ ids: state.ids }),
      version: 1,
    },
  ),
);
