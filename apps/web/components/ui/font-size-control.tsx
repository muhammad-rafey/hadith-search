"use client";

import * as React from "react";
import { Button } from "./button";
import { applyFontSize, FONT_SIZE_STEPS, isFontSizeStep, type FontSizeStep } from "@/lib/themes";
import { fontSizeChanged } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "hadith-search:font-size";

export function FontSizeControl() {
  const [step, setStep] = React.useState<FontSizeStep>("M");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isFontSizeStep(stored)) {
      setStep(stored);
      applyFontSize(stored);
    } else {
      applyFontSize("M");
    }
  }, []);

  const choose = (next: FontSizeStep) => {
    setStep(next);
    applyFontSize(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, next);
    }
    fontSizeChanged(next);
  };

  return (
    <fieldset aria-label="Font size" className="inline-flex gap-1 border-0 p-0">
      {FONT_SIZE_STEPS.map((s) => (
        <Button
          key={s}
          type="button"
          size="sm"
          variant={step === s ? "default" : "outline"}
          onClick={() => choose(s)}
          aria-pressed={step === s}
          className={cn("min-w-9", step === s && "shadow-sm")}
        >
          {s}
        </Button>
      ))}
    </fieldset>
  );
}
