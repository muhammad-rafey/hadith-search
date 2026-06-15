"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/lib/store";

interface UrduSectionProps {
  text: string | null;
}

/**
 * Urdu translation block — RTL, Nastaliq (`.font-urdu`). Mirror of
 * <ArabicSection>: visibility is bound to the shared `showUrdu` setting (read
 * here, written by Settings), so toggling here also flips the Settings default.
 * Renders nothing when there is no Urdu text.
 */
export function UrduSection({ text }: UrduSectionProps) {
  const show = useUiStore((s) => s.showUrdu);
  const setShowUrdu = useUiStore((s) => s.setShowUrdu);

  if (!text) return null;

  const toggle = () => {
    setShowUrdu(!show);
  };

  return (
    <section aria-label="Urdu translation" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Urdu
        </h2>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={toggle}
          aria-expanded={show}
          aria-controls="hadith-urdu-body"
        >
          {show ? "Hide" : "Show"}
        </Button>
      </div>
      {/* Use hidden + aria-hidden so aria-controls always points at a valid element */}
      <p
        id="hadith-urdu-body"
        dir="rtl"
        lang="ur"
        hidden={!show}
        aria-hidden={!show}
        className="font-urdu whitespace-pre-line rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-4"
      >
        {text}
      </p>
    </section>
  );
}
