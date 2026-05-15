import type { MetadataRoute } from "next";
import { getAllBooks, getAllHadiths } from "@/lib/hadiths";
import { getSiteUrl } from "@/lib/site";

// Fixed date so re-deployments don't prompt crawlers to re-fetch unchanged pages.
// TODO: switch to row.updated_at once Supabase data lands.
const LAST_MODIFIED = "2026-05-15T00:00:00.000Z";

export default function sitemap(): MetadataRoute.Sitemap {
  const SITE = getSiteUrl();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: LAST_MODIFIED, changeFrequency: "weekly", priority: 1 },
    {
      url: `${SITE}/search`,
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE}/browse`,
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  const bookEntries: MetadataRoute.Sitemap = getAllBooks().map((b) => ({
    url: `${SITE}/browse/${b.book_number}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const hadithEntries: MetadataRoute.Sitemap = getAllHadiths().map((h) => ({
    url: `${SITE}/hadith/${encodeURIComponent(h.id)}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  return [...staticEntries, ...bookEntries, ...hadithEntries];
}
