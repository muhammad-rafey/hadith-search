"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

interface ArabicSectionProps {
  text: string | null;
}

const STORAGE_KEY = "hadith-search:show-arabic";

export function ArabicSection({ text }: ArabicSectionProps) {
  const [show, setShow] = React.useState(true);

  React.useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "0") setShow(false);
  }, []);

  if (!text) return null;

  const toggle = () => {
    const next = !show;
    setShow(next);
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
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
          aria-pressed={show}
          aria-controls="hadith-arabic-body"
        >
          {show ? "Hide" : "Show"}
        </Button>
      </div>
      {show ? (
        <p
          id="hadith-arabic-body"
          dir="rtl"
          lang="ar"
          className="font-arabic rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-4"
        >
          {text}
        </p>
      ) : null}
    </section>
  );
}
