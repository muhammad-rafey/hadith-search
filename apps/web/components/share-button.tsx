"use client";

import * as React from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { hadithShared } from "@/lib/analytics";

interface ShareButtonProps {
  hadithId: string;
  url?: string;
  title?: string;
}

export function ShareButton({ hadithId, url, title }: ShareButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const onShare = async () => {
    const target = url ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!target) return;

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, url: target });
        hadithShared({ hadithId, method: "native" });
        return;
      } catch {
        // User cancelled or share unavailable — fall through to clipboard.
      }
    }

    // Guard: clipboard API may be absent (non-HTTPS, older browsers, etc.)
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(target);
        setCopied(true);
        // Use plain setTimeout (not window.setTimeout) for portability in
        // environments where window may not exist (tests, SSR edge cases).
        setTimeout(() => setCopied(false), 1500);
        hadithShared({ hadithId, method: "link" });
        toast({ title: "Link copied", description: "Hadith URL copied to clipboard." });
      } catch {
        toast({
          title: "Could not copy link",
          description: "Copy failed — long-press the URL bar to copy manually.",
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "Clipboard unavailable",
        description: "Long-press the URL bar to copy the link manually.",
        variant: "destructive",
      });
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
