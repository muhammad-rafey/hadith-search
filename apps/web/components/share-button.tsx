"use client";

import * as React from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { capture } from "@/lib/analytics";

interface ShareButtonProps {
  hadithId: string;
  url?: string;
  title?: string;
}

export function ShareButton({ hadithId, url, title }: ShareButtonProps) {
  const { notify } = useToast();
  const [copied, setCopied] = React.useState(false);

  const onShare = async () => {
    const target = url ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!target) return;

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, url: target });
        capture("hadith_shared", { hadith_id: hadithId, method: "native" });
        return;
      } catch {
        // User cancelled or share unavailable — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      capture("hadith_shared", { hadith_id: hadithId, method: "link" });
      notify({ title: "Link copied", description: "Hadith URL copied to clipboard." });
    } catch {
      notify({ title: "Could not copy link", variant: "destructive" });
    }
  };

  return (
    <Button type="button" variant="outline" onClick={onShare} aria-label="Share hadith">
      {copied ? (
        <>
          <Check className="h-4 w-4" aria-hidden="true" /> Copied
        </>
      ) : (
        <>
          <Link2 className="h-4 w-4" aria-hidden="true" /> Share
        </>
      )}
    </Button>
  );
}
