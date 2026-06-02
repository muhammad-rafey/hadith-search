"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { collectionName, COLLECTION_ORDER, collectionSortIndex } from "@hadith/shared-types";
import { cn } from "@/lib/utils";

/** Shape returned by GET /api/collections. */
export interface CollectionOption {
  collection: string;
  name: string;
  arabic_name: string | null;
  hadith_count: number;
}

/**
 * The curated 15-collection list, used as an instant fallback (and SSR-stable
 * value) before /api/collections resolves with real counts. Counts are omitted
 * here; the picker just needs slugs + display names to render.
 */
const FALLBACK_OPTIONS: CollectionOption[] = [...COLLECTION_ORDER].map((collection) => ({
  collection,
  name: collectionName(collection),
  arabic_name: null,
  hadith_count: 0,
}));

async function fetchCollections(): Promise<CollectionOption[]> {
  const res = await fetch("/api/collections");
  if (!res.ok) throw new Error("failed to load collections");
  return res.json();
}

/** Shared TanStack query for the collection list (deduped across pickers). */
export function useCollections() {
  return useQuery<CollectionOption[]>({
    queryKey: ["collections"],
    queryFn: fetchCollections,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

interface CollectionPickerProps {
  id: string;
  value: string;
  onChange: (collection: string) => void;
  className?: string;
  /** Render counts next to each option name (Browse-style). Off by default. */
  showCounts?: boolean;
  "aria-label"?: string;
}

/**
 * A native <select> over the 15 collections, fed by GET /api/collections.
 * Falls back to the curated COLLECTION_ORDER until the request resolves, so it
 * is never empty. Styling matches the search page's existing selects.
 */
export function CollectionPicker({
  id,
  value,
  onChange,
  className,
  showCounts = false,
  "aria-label": ariaLabel,
}: CollectionPickerProps) {
  const { data } = useCollections();
  const options = React.useMemo(() => {
    const source = data && data.length > 0 ? data : FALLBACK_OPTIONS;
    return [...source].sort(
      (a, b) => collectionSortIndex(a.collection) - collectionSortIndex(b.collection),
    );
  }, [data]);

  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        className,
      )}
    >
      {options.map((c) => (
        <option key={c.collection} value={c.collection}>
          {c.name}
          {showCounts && c.hadith_count > 0 ? ` (${c.hadith_count})` : ""}
        </option>
      ))}
    </select>
  );
}
