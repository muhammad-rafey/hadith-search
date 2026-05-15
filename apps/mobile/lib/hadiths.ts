import { MOCK_BOOKS, MOCK_HADITHS, type Hadith } from "@hadith/shared-types";

/**
 * Local lookups — a direct mirror of apps/web/lib/hadiths.ts. Both platforms
 * read MOCK_HADITHS / MOCK_BOOKS until the real corpus lands; when the dump
 * arrives, both swap to a Supabase query together.
 */
export interface BookSummary {
  book_number: number;
  book_name_en: string;
  hadith_count: number;
}

export function getHadithById(id: string): Hadith | null {
  return MOCK_HADITHS.find((h) => h.id === id) ?? null;
}

export function getBookByNumber(book_number: number): BookSummary | null {
  const meta = MOCK_BOOKS.find((b) => b.book_number === book_number);
  if (!meta) return null;
  const count = MOCK_HADITHS.filter((h) => h.book_number === book_number).length;
  return { ...meta, hadith_count: count };
}

export function getHadithsForBook(book_number: number): Hadith[] {
  return MOCK_HADITHS.filter((h) => h.book_number === book_number).sort(
    (a, b) => a.hadith_number - b.hadith_number,
  );
}

export function getAllBooks(): BookSummary[] {
  return MOCK_BOOKS.map((b) => ({
    ...b,
    hadith_count: MOCK_HADITHS.filter((h) => h.book_number === b.book_number).length,
  }));
}

export function getAllHadiths(): Hadith[] {
  return MOCK_HADITHS;
}
