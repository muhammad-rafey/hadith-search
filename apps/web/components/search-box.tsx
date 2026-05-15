"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
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
 * Controlled search input. A clear (×) button appears when the input has
 * content. The parent owns the debounce + mutation; this is purely the textbox.
 *
 * Note: `aria-busy` is NOT set on the <input> element — it is not valid on
 * role="searchbox" / textbox. The result-list owns the live region instead.
 */
export function SearchBox({
  value,
  onChange,
  loading: _loading,
  className,
  autoFocus,
}: SearchBoxProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onChange("");
    inputRef.current?.focus();
  };

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
        ref={inputRef}
        id="hadith-search-input"
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        autoFocus={autoFocus}
        placeholder="Search Sahih al-Bukhari..."
        onChange={(e) => onChange(e.target.value)}
        className="h-11 pl-9 pr-9 text-base"
      />
      {value ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
