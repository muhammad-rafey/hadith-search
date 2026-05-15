import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBookByNumber, getHadithsForBook } from "@/lib/hadiths";

interface Params {
  params: Promise<{ book: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { book } = await params;
  const n = Number.parseInt(book, 10);
  const meta = Number.isFinite(n) ? getBookByNumber(n) : null;
  if (!meta) return { title: "Book not found" };
  return {
    title: `Book ${meta.book_number}: ${meta.book_name_en}`,
    description: `${meta.hadith_count} hadiths in book ${meta.book_number} of Sahih al-Bukhari.`,
  };
}

export default async function BookPage({ params }: Params) {
  const { book } = await params;
  const n = Number.parseInt(book, 10);
  if (!Number.isFinite(n)) notFound();
  const meta = getBookByNumber(n);
  if (!meta) notFound();
  const hadiths = getHadithsForBook(n);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Book {meta.book_number}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{meta.book_name_en}</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {hadiths.length} hadith{hadiths.length === 1 ? "" : "s"}
        </p>
      </div>
      <ol className="space-y-3">
        {hadiths.map((h) => (
          <li key={h.id}>
            <Link
              href={`/hadith/${h.id}`}
              className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            >
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {h.in_book_ref} · Hadith {h.hadith_number}
                  </p>
                  {h.chapter_title_en ? (
                    <CardTitle className="text-base font-medium">{h.chapter_title_en}</CardTitle>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {h.narrator ? (
                    <p className="text-sm italic text-[hsl(var(--muted-foreground))]">
                      Narrated {h.narrator}
                    </p>
                  ) : null}
                  <p className="mt-1 line-clamp-2 text-sm">{h.text_en}</p>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
