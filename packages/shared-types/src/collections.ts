/**
 * Metadata for the 15 collections in `hadith_table`. Display names are curated;
 * an unknown slug falls back to a title-cased slug so a newly-loaded collection
 * still renders sensibly. Arabic names are optional.
 *
 * Scope note: only `bukhari` is embedded, so semantic/keyword search is
 * bukhari-only. Every collection here is fully BROWSABLE and reachable by
 * hadith number — that's what the collection RPCs (0016) power.
 */
export interface CollectionMeta {
  slug: string;
  name: string;
  arabicName: string | null;
}

// Curated English + Arabic names. `forty` bundles three 40-hadith sets
// (Nawawi/Qudsi/Shah Waliullah), so it gets the generic "Forty Hadith".
// `virtues` has no widely-canonical title here, so it falls back to title-case.
const NAMES: Record<string, { name: string; arabicName: string | null }> = {
  bukhari: { name: "Sahih al-Bukhari", arabicName: "صحيح البخاري" },
  muslim: { name: "Sahih Muslim", arabicName: "صحيح مسلم" },
  nasai: { name: "Sunan an-Nasa'i", arabicName: "سنن النسائي" },
  abudawud: { name: "Sunan Abi Dawud", arabicName: "سنن أبي داود" },
  tirmidhi: { name: "Jami` at-Tirmidhi", arabicName: "جامع الترمذي" },
  ibnmajah: { name: "Sunan Ibn Majah", arabicName: "سنن ابن ماجه" },
  ahmad: { name: "Musnad Ahmad", arabicName: "مسند أحمد" },
  riyadussalihin: { name: "Riyad as-Salihin", arabicName: "رياض الصالحين" },
  adab: { name: "Al-Adab Al-Mufrad", arabicName: "الأدب المفرد" },
  mishkat: { name: "Mishkat al-Masabih", arabicName: "مشكاة المصابيح" },
  bulugh: { name: "Bulugh al-Maram", arabicName: "بلوغ المرام" },
  forty: { name: "Forty Hadith", arabicName: "الأربعون" },
  hisn: { name: "Hisn al-Muslim", arabicName: "حصن المسلم" },
  shamail: { name: "Ash-Shama'il Al-Muhammadiyah", arabicName: "الشمائل المحمدية" },
  virtues: { name: "Virtues", arabicName: null },
};

/** Display order on the Browse landing: Kutub al-Sittah first, then the rest. */
export const COLLECTION_ORDER: readonly string[] = [
  "bukhari",
  "muslim",
  "nasai",
  "abudawud",
  "tirmidhi",
  "ibnmajah",
  "ahmad",
  "riyadussalihin",
  "adab",
  "mishkat",
  "bulugh",
  "forty",
  "hisn",
  "shamail",
  "virtues",
];

function titleCase(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** English display name for a collection slug (title-cased fallback). */
export function collectionName(slug: string): string {
  return NAMES[slug]?.name ?? titleCase(slug);
}

/** Arabic display name, or null if not curated. */
export function collectionArabicName(slug: string): string | null {
  return NAMES[slug]?.arabicName ?? null;
}

/** True for the 15 curated collections (used to validate route params). */
export function isKnownCollection(slug: string): boolean {
  return Object.hasOwn(NAMES, slug);
}

export function collectionMeta(slug: string): CollectionMeta {
  return { slug, name: collectionName(slug), arabicName: collectionArabicName(slug) };
}

/** Sort index for display: curated order first, unknown slugs last. */
export function collectionSortIndex(slug: string): number {
  const i = COLLECTION_ORDER.indexOf(slug);
  return i === -1 ? COLLECTION_ORDER.length : i;
}
