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
        set({ ids: get().ids.filter((x) => x !== id) });
        bookmarkRemoved(id);
      },
      toggle: (id) => {
        if (get().ids.includes(id)) {
          get().remove(id);
        } else {
          get().add(id);
        }
      },
      has: (id) => get().ids.includes(id),
    }),
    {
      name: "hadith-search:bookmarks",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ ids: state.ids }),
    },
  ),
);
