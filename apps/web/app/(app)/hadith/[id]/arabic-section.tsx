"use client";

import { Button } from "@/components/ui/button";
import { useUiStore } from "@/lib/store";

interface ArabicSectionProps {
  text: string | null;
}

export function ArabicSection({ text }: ArabicSectionProps) {
  const show = useUiStore((s) => s.showArabic);
  const setShowArabic = useUiStore((s) => s.setShowArabic);

  if (!text) return null;

  const toggle = () => {
    setShowArabic(!show);
  };

  return (
    <section aria-label="Arabic text" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Arabic
        </h2>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={toggle}
          aria-expanded={show}
          aria-controls="hadith-arabic-body"
        >
          {show ? "Hide" : "Show"}
        </Button>
      </div>
      {/* Use hidden + aria-hidden so aria-controls always points at a valid element */}
      <p
        id="hadith-arabic-body"
        dir="rtl"
        lang="ar"
        hidden={!show}
        aria-hidden={!show}
        className="font-arabic rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-4"
      >
        {text}
      </p>
    </section>
  );
}
