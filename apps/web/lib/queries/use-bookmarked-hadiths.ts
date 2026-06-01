"use client";

import { useQuery } from "@tanstack/react-query";
import type { Hadith } from "@hadith/shared-types";
import { getSupabaseBrowserClient, isPlaceholderSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type HadithRow = Database["public"]["Tables"]["hadith_table"]["Row"];

const DEFAULT_COLLECTION = "bukhari";

function splitId(id: string): { collection: string; hadithNumber: string } {
  if (!id.includes(":")) return { collection: DEFAULT_COLLECTION, hadithNumber: id };
  const idx = id.indexOf(":");
  return { collection: id.slice(0, idx), hadithNumber: id.slice(idx + 1) };
}

function parseGrades(raw: string): Hadith["grades"] {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out = parsed
      .map((g: { graded_by?: string; grade?: string }) => ({
        grader: g.graded_by ?? "",
        grade: g.grade ?? "",
      }))
      .filter((g) => g.grader || g.grade);
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function toInt(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.match(/-?\d+/);
  return m ? Number.parseInt(m[0], 10) : 0;
}

function rowToHadith(r: HadithRow): Hadith {
  return {
    id: `${r.collection}:${r.hadithNumber}`,
    collection: r.collection,
    hadith_number: toInt(r.hadithNumber),
    arabic_number: r.arabicURN ?? null,
    book_number: toInt(r.bookNumber),
    book_name_en: r.englishBabName ?? `Book ${r.bookNumber}`,
    chapter_number: Math.trunc(r.babID),
    chapter_title_en: r.englishBabName,
    in_book_ref: `Book ${r.bookNumber}, Hadith ${r.hadithNumber}`,
    usc_msa_ref: null,
    narrator: null,
    narrator_normalized: null,
    text_en: r.englishText ?? "",
    text_en_full: r.englishText ?? "",
    text_ar: r.arabicText,
    grades: parseGrades(r.englishgrade1),
    urn: r.arabicURN ?? null,
    language: "en",
  };
}

/**
 * Fetches the Hadith records for the given bookmark IDs from Supabase
 * (browser client). Returns results in the same order as `ids`.
 *
 * Falls back to an empty array if Supabase is not configured — the bookmarks
 * page will render the empty state.
 */
export function useBookmarkedHadiths(ids: string[]) {
  return useQuery<Hadith[]>({
    queryKey: ["bookmarked-hadiths", ...ids].sort(),
    queryFn: async () => {
      if (ids.length === 0 || isPlaceholderSupabase()) return [];
      const supabase = getSupabaseBrowserClient();
      const tuples = ids
        .map(splitId)
        .map(
          ({ collection, hadithNumber }) =>
            `and(collection.eq.${collection},hadithNumber.eq.${hadithNumber})`,
        );
      const { data, error } = await supabase
        .from("hadith_table")
        .select("*")
        .or(tuples.join(","));
      if (error || !data) return [];
      const byId = new Map<string, Hadith>();
      for (const r of data) {
        const h = rowToHadith(r);
        byId.set(h.id, h);
      }
      return ids.map((id) => byId.get(id)).filter((x): x is Hadith => !!x);
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}
