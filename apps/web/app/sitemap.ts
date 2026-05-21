import type { MetadataRoute } from "next";
import { getAllBooks, getAllHadithIds } from "@/lib/hadiths";
import { getSiteUrl } from "@/lib/site";

// Fixed date so re-deployments don't prompt crawlers to re-fetch unchanged pages.
const LAST_MODIFIED = "2026-05-15T00:00:00.000Z";

export const revalidate = 604800;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  const [books, hadithIds] = await Promise.all([getAllBooks(), getAllHadithIds()]);

  const bookEntries: MetadataRoute.Sitemap = books.map((b) => ({
    url: `${SITE}/browse/${b.book_number}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // IDs are "bukhari:N" — `:` is a valid path-segment character (RFC 3986),
  // and Next.js routes accept it unencoded, so we emit clean URLs for crawlers.
  const hadithEntries: MetadataRoute.Sitemap = hadithIds.map((id) => ({
    url: `${SITE}/hadith/${id}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  return [...staticEntries, ...bookEntries, ...hadithEntries];
}
