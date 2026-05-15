import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAllBooks } from "@/lib/hadiths";

export const metadata: Metadata = {
  title: "Browse",
  description: "Browse Sahih al-Bukhari by book.",
};

export default function BrowsePage() {
  const books = getAllBooks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Browse</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {books.length} books in the corpus.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {books.map((book) => (
          <Link
            key={book.book_number}
            href={`/browse/${book.book_number}`}
            className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Book {book.book_number}
                </p>
                <CardTitle className="flex items-start justify-between gap-2">
                  <span>{book.book_name_en}</span>
                  <ChevronRight
                    className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]"
                    aria-hidden="true"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {book.hadith_count} hadith{book.hadith_count === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
