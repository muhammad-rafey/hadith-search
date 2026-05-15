import type { MetadataRoute } from "next";
import { getAllBooks, getAllHadiths } from "@/lib/hadiths";

const SITE = "https://hadithapp.tld";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/search`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/browse`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
  ];

  const bookEntries: MetadataRoute.Sitemap = getAllBooks().map((b) => ({
    url: `${SITE}/browse/${b.book_number}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const hadithEntries: MetadataRoute.Sitemap = getAllHadiths().map((h) => ({
    url: `${SITE}/hadith/${encodeURIComponent(h.id)}`,
    lastModified: now,
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  return [...staticEntries, ...bookEntries, ...hadithEntries];
}
