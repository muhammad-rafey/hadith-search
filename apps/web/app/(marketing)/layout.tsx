import Link from "next/link";
import { Sparkles } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[hsl(var(--border))]">
        <div className="container mx-auto flex h-14 max-w-6xl items-center px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Sparkles className="h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" />
            <span>Hadith Search</span>
          </Link>
          <nav aria-label="Marketing" className="ml-auto flex items-center gap-4 text-sm">
            <Link href="/search" className="hover:underline">
              Search
            </Link>
            <Link href="/browse" className="hover:underline">
              Browse
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
