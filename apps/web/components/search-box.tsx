"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchBoxProps {
  value: string;
  onChange: (v: string) => void;
  loading?: boolean;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Controlled search input with built-in `aria-busy` while loading.
 * The parent owns the debounce + mutation; this is purely the textbox.
 */
export function SearchBox({ value, onChange, loading, className, autoFocus }: SearchBoxProps) {
  return (
    <div className={cn("relative", className)}>
      <label htmlFor="hadith-search-input" className="sr-only">
        Search hadiths
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
        aria-hidden="true"
      />
      <Input
        id="hadith-search-input"
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        autoFocus={autoFocus}
        aria-busy={loading ? "true" : "false"}
        placeholder="Search Sahih al-Bukhari..."
        onChange={(e) => onChange(e.target.value)}
        className="h-11 pl-9 text-base"
      />
    </div>
  );
}
