"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { HadithSchema } from "@hadith/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollectionPicker } from "@/components/collection-picker";
import { cn } from "@/lib/utils";

interface JumpToHadithProps {
  /**
   * When set, the collection is fixed (no picker) — used inside a collection's
   * reading view. When omitted, a CollectionPicker is shown and the user
   * chooses the collection too — used on the search page.
   */
  collection?: string;
  /** Initial collection for the picker variant. Defaults to "bukhari". */
  defaultCollection?: string;
  className?: string;
}

type JumpState = "idle" | "loading" | "not_found" | "error";

/**
 * "Jump to a hadith by number" affordance. Resolves the number against
 * GET /api/collections/{collection}/lookup and routes to the hadith on success.
 * The lookup is the only collection-agnostic deep-link path (search itself is
 * bukhari-only), so this works for all 15 collections.
 */
export function JumpToHadith({
  collection,
  defaultCollection = "bukhari",
  className,
}: JumpToHadithProps) {
  const router = useRouter();
  const [pickedCollection, setPickedCollection] = React.useState(collection ?? defaultCollection);
  const [number, setNumber] = React.useState("");
  const [state, setState] = React.useState<JumpState>("idle");

  const activeCollection = collection ?? pickedCollection;
  const numberInputId = React.useId();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = number.trim();
    if (!num) return;
    setState("loading");
    try {
      const res = await fetch(
        `/api/collections/${encodeURIComponent(activeCollection)}/lookup?number=${encodeURIComponent(num)}`,
      );
      // 400 (e.g. an over-long number) and 404 both mean "no such hadith" to
      // the user — show the friendlier not-found message (matches mobile).
      if (res.status === 404 || res.status === 400) {
        setState("not_found");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const parsed = HadithSchema.safeParse(await res.json());
      if (!parsed.success) {
        setState("error");
        return;
      }
      router.push(`/hadith/${parsed.data.id}`);
    } catch {
      setState("error");
    }
  };

  // Any edit clears a stale "not found" / "error" message.
  const resetState = () => {
    if (state !== "idle" && state !== "loading") setState("idle");
  };

  return (
    <form onSubmit={onSubmit} className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-end gap-2">
        {!collection ? (
          <div className="space-y-1">
            <label
              htmlFor={`${numberInputId}-collection`}
              className="block text-xs text-[hsl(var(--muted-foreground))]"
            >
              Collection
            </label>
            <CollectionPicker
              id={`${numberInputId}-collection`}
              value={pickedCollection}
              onChange={(c) => {
                setPickedCollection(c);
                resetState();
              }}
              aria-label="Collection to jump within"
            />
          </div>
        ) : null}
        <div className="space-y-1">
          <label
            htmlFor={numberInputId}
            className="block text-xs text-[hsl(var(--muted-foreground))]"
          >
            Hadith number
          </label>
          <Input
            id={numberInputId}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. 8a"
            value={number}
            onChange={(e) => {
              setNumber(e.target.value);
              resetState();
            }}
            className="h-9 w-28"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          className="h-9"
          disabled={state === "loading" || number.trim().length === 0}
        >
          {state === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          )}
          Go
        </Button>
      </div>
      <p aria-live="polite" className="min-h-4 text-xs">
        {state === "not_found" ? (
          <span className="text-[hsl(var(--destructive))]">
            No hadith {number.trim()} in that collection.
          </span>
        ) : state === "error" ? (
          <span className="text-[hsl(var(--destructive))]">Lookup failed — try again.</span>
        ) : null}
      </p>
    </form>
  );
}
