"use client";

import Link from "next/link";
import { Sparkles, Info } from "lucide-react";
import { type AnswerResponse, collectionName } from "@hadith/shared-types";
import { Skeleton } from "@/components/ui/skeleton";

interface AnswerPanelProps {
  /** The grounded answer, or null before the first request resolves. */
  answer: AnswerResponse | null;
  loading: boolean;
  /** Hide the panel entirely (e.g. no query, or search returned nothing). */
  hidden?: boolean;
}

/**
 * AI answer surface, rendered above the result list. Shows a loading state, the
 * grounded answer with citation chips that link to the cited hadiths, or a muted
 * "couldn't answer" message when the model abstained / degraded. The answer is
 * always derived from the hadiths shown below.
 */
export function AnswerPanel({ answer, loading, hidden }: AnswerPanelProps) {
  if (hidden) return null;
  if (!loading && !answer) return null;

  const answered = answer?.status === "answered";

  return (
    <section
      aria-label="AI answer"
      aria-busy={loading}
      className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-4"
    >
      <h2 className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
        <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
        Answer
      </h2>

      {loading ? (
        <div className="mt-3 space-y-2" role="status" aria-label="Generating answer">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : answer ? (
        <>
          <p
            className={
              answered
                ? "mt-2 whitespace-pre-wrap text-base leading-relaxed text-[hsl(var(--foreground))]"
                : "mt-2 text-sm text-[hsl(var(--muted-foreground))]"
            }
          >
            {answer.answer}
          </p>

          {answered && answer.citations.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Based on</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {answer.citations.map((c) => (
                  <Link
                    key={c.hadith_id}
                    href={`/hadith/${c.hadith_id}`}
                    className="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]"
                  >
                    {collectionName(c.collection)} {c.hadith_number_label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {answered ? (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>AI-generated from the hadiths below. Verify against the source text.</span>
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
