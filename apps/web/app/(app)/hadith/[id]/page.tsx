import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { collectionName } from "@hadith/shared-types";
import { BookmarkButton } from "@/components/bookmark-button";
import { ShareButton } from "@/components/share-button";
import { ArabicSection } from "./arabic-section";
import { UrduSection } from "./urdu-section";
import { ViewTracker } from "./view-tracker";
import { getHadithById } from "@/lib/hadiths";
import { getSiteUrl } from "@/lib/site";

export const revalidate = 86400;

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  // `parseHadithId` (inside getHadithById) tolerates a percent-encoded id, which
  // the App Router can hand us here — see the note in shared-types/map.ts.
  const h = await getHadithById(id);
  if (!h) return { title: "Hadith not found" };
  const description = h.text_en.slice(0, 150);
  const collection = collectionName(h.collection);
  const title = `${collection} ${h.hadith_number_label}${
    h.chapter_title_en ? `: ${h.chapter_title_en}` : ""
  }`;
  const canonicalUrl = `${getSiteUrl()}/hadith/${h.id}`;
  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function HadithDetailPage({ params }: Params) {
  const { id } = await params;
  const h = await getHadithById(id);
  if (!h) notFound();

  const grade = h.grades?.[0];
  const collection = collectionName(h.collection);
  const canonicalUrl = `${getSiteUrl()}/hadith/${h.id}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${collection} ${h.hadith_number_label}${h.chapter_title_en ? `: ${h.chapter_title_en}` : ""}`,
    description: h.text_en.slice(0, 150),
    inLanguage: "en",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    author: h.narrator ? { "@type": "Person", name: h.narrator } : undefined,
    publisher: {
      "@type": "Organization",
      name: "Hadith Search",
    },
  };

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted JSON-LD; `</` escaped to prevent script-tag breakout via narrator/title text
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleJsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <ViewTracker hadithId={h.id} />

      <header className="space-y-2 border-b border-[hsl(var(--border))] pb-4">
        <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          <Link href={`/browse/${h.collection}`} className="hover:underline">
            {collection}
          </Link>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {collection} {h.hadith_number_label}
        </h1>
        {h.chapter_title_en ? (
          <p className="text-lg text-[hsl(var(--muted-foreground))]">{h.chapter_title_en}</p>
        ) : null}
        {h.chapter_title_ar ? (
          <p
            dir="rtl"
            lang="ar"
            className="font-arabic text-lg leading-relaxed text-[hsl(var(--muted-foreground))]"
          >
            {h.chapter_title_ar}
          </p>
        ) : null}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 pt-2 text-xs text-[hsl(var(--muted-foreground))] sm:grid-cols-3">
          <div>
            <dt className="font-medium uppercase tracking-wider">In-book</dt>
            <dd>{h.in_book_ref}</dd>
          </div>
          {h.usc_msa_ref ? (
            <div>
              <dt className="font-medium uppercase tracking-wider">USC-MSA</dt>
              <dd>{h.usc_msa_ref}</dd>
            </div>
          ) : null}
          {grade ? (
            <div>
              <dt className="font-medium uppercase tracking-wider">Grade</dt>
              <dd>
                {grade.grade}
                {grade.grade_ar ? (
                  <>
                    {" · "}
                    {/* `bdi` isolates the RTL Arabic grade so the surrounding
                        LTR text (separator + grader) keeps a sensible order. */}
                    <bdi lang="ar" className="font-arabic">
                      {grade.grade_ar}
                    </bdi>
                  </>
                ) : null}{" "}
                ({grade.grader})
              </dd>
            </div>
          ) : null}
        </dl>
      </header>

      {h.narrator ? (
        <p className="italic text-[hsl(var(--muted-foreground))]">
          <cite>Narrated {h.narrator}</cite>
        </p>
      ) : null}

      <ArabicSection text={h.text_ar} />

      <section aria-label="English translation" className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          English
        </h2>
        <p className="whitespace-pre-line text-lg leading-relaxed">{h.text_en_full}</p>
      </section>

      <UrduSection text={h.text_ur ?? null} />

      <footer className="flex flex-wrap items-center gap-2 border-t border-[hsl(var(--border))] pt-4">
        <BookmarkButton hadithId={h.id} />
        <ShareButton hadithId={h.id} />
      </footer>
    </article>
  );
}
