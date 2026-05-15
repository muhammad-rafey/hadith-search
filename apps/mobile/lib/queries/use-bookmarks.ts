import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { bookmarkAdded, bookmarkRemoved } from "@/lib/analytics";

/**
 * Bookmarks store — same shape and storage key as
 * apps/web/lib/queries/use-bookmarks.ts, persisted to AsyncStorage instead of
 * localStorage. Single source of truth so a bookmark toggled anywhere is
 * reflected everywhere instantly.
 */
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
        if (!get().ids.includes(id)) return;
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
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ ids: state.ids }),
      version: 1,
    },
  ),
);
