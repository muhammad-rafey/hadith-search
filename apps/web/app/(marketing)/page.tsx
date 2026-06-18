import Link from "next/link";
import { ArrowRight, BookOpen, Globe2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-[hsl(var(--border))] py-20">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-[hsl(var(--primary))]">
            Hadith collections
          </p>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Find the hadith you mean, not just the words.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[hsl(var(--muted-foreground))]">
            AI semantic search over Sahih al-Bukhari, plus browsing and number lookup across fifteen
            collections — with Arabic, English translation, and full references for every result.
          </p>
          <form
            action="/search"
            method="get"
            className="mx-auto mt-8 flex max-w-2xl flex-col gap-2 sm:flex-row"
          >
            <label htmlFor="landing-q" className="sr-only">
              Search hadiths
            </label>
            <input
              id="landing-q"
              name="q"
              type="search"
              placeholder="Try: intentions, neighbours, the five pillars"
              className="h-12 flex-1 rounded-md border border-[hsl(var(--input))] bg-transparent px-4 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            />
            <Button type="submit" size="lg" className="h-12">
              <Search className="h-4 w-4" aria-hidden="true" />
              Search
            </Button>
          </form>
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="container mx-auto max-w-5xl px-4">
          <h2 className="mb-8 text-center text-2xl font-semibold tracking-tight">
            Built for serious readers
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <Search className="h-6 w-6 text-[hsl(var(--primary))]" aria-hidden="true" />
                <CardTitle>Semantic search</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Hybrid BM25 plus vector retrieval with cross-encoder reranking over Sahih
                  al-Bukhari. Find the meaning, not just the keyword.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <BookOpen className="h-6 w-6 text-[hsl(var(--primary))]" aria-hidden="true" />
                <CardTitle>Browse every collection</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Fifteen collections — Bukhari, Muslim, the Sunan and more — to read straight
                  through or jump to any hadith by number.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Globe2 className="h-6 w-6 text-[hsl(var(--primary))]" aria-hidden="true" />
                <CardTitle>Multilingual</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Read every hadith in Arabic, English, and Urdu side by side. Fully multilingual
                  semantic search is on the roadmap.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 py-16">
        <div className="container mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Start with the first hadith.</h2>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">
            &ldquo;The reward of deeds depends upon the intentions...&rdquo;
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/hadith/bukhari:1">
              Read Bukhari 1
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
