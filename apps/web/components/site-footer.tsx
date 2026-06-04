import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-[hsl(var(--border))] py-6 text-sm text-[hsl(var(--muted-foreground))]">
      <div className="container mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 sm:flex-row sm:justify-between">
        <p>Hadith Search &middot; Semantic search over hadith collections</p>
        <nav aria-label="Footer" className="flex items-center gap-4">
          <Link href="/" className="hover:underline">
            Home
          </Link>
          <Link href="/browse" className="hover:underline">
            Browse
          </Link>
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>
        </nav>
      </div>
    </footer>
  );
}
