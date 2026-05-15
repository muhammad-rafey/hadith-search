import { MOCK_BOOKS, MOCK_HADITHS, type Hadith } from "@hadith/shared-types";

/**
 * NOTE: All functions in this file are O(N) linear scans over MOCK_HADITHS /
 * MOCK_BOOKS (N ≈ 10 during local dev). They will be replaced by indexed
 * Supabase queries once the real corpus lands (see plan/05-roadmap.md Phase 1).
 */

export interface BookSummary {
  book_number: number;
  book_name_en: string;
  hadith_count: number;
}

// TODO: replace with Supabase query when real corpus lands.
export function getHadithById(id: string): Hadith | null {
  return MOCK_HADITHS.find((h) => h.id === id) ?? null;
}

// TODO: replace with Supabase query when real corpus lands.
export function getBookByNumber(book_number: number): BookSummary | null {
  const meta = MOCK_BOOKS.find((b) => b.book_number === book_number);
  if (!meta) return null;
  const count = MOCK_HADITHS.filter((h) => h.book_number === book_number).length;
  return { ...meta, hadith_count: count };
}

// TODO: replace with Supabase query when real corpus lands.
export function getHadithsForBook(book_number: number): Hadith[] {
  return MOCK_HADITHS.filter((h) => h.book_number === book_number).sort(
    (a, b) => a.hadith_number - b.hadith_number,
  );
}

// TODO: replace with Supabase query when real corpus lands.
export function getAllBooks(): BookSummary[] {
  return MOCK_BOOKS.map((b) => ({
    ...b,
    hadith_count: MOCK_HADITHS.filter((h) => h.book_number === b.book_number).length,
  }));
}

// TODO: replace with Supabase query when real corpus lands.
export function getAllHadiths(): Hadith[] {
  return MOCK_HADITHS;
}
