"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, BookOpen, Search, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const NAV = [
  { href: "/search", label: "Search", icon: Search },
  { href: "/browse", label: "Browse", icon: BookOpen },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--background))]/75">
      <div className="container mx-auto flex h-14 max-w-6xl items-center px-4">
        <Link
          href="/"
          className="mr-6 flex items-center gap-2 font-semibold tracking-tight"
          aria-label="Hadith Search home"
        >
          <Sparkles className="h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" />
          <span>Hadith Search</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  "hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]",
                  active && "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline" aria-hidden="true">
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
