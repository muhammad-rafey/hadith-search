/**
 * Render-time cleaners for the raw markup that ships in `hadith_table`.
 *
 * Source quirks observed in the data:
 *   - arabicText wraps the isnad in [prematn]…[/prematn] and the matn in
 *     [matn]…[/matn]; narrator names are wrapped in
 *     [narrator id="N" role="…" tooltip="…"]NAME[/narrator] tags.
 *   - englishText carries unpaired <p> tags, leading "Narrated X:" prefixes
 *     (sometimes with backtick or apostrophe before the name), and a lot of
 *     decorative whitespace.
 */

// ── Arabic ──────────────────────────────────────────────────────────────────

const ARABIC_NARRATOR_OPEN_RE = /\[narrator\s+[^\]]*\]/g;
const ARABIC_NARRATOR_CLOSE_RE = /\[\/narrator\]/g;
const ARABIC_SECTION_TAG_RE = /\[\/?(?:prematn|matn)\]/g;

/**
 * Strip narrator markup and section markers from arabicText, keeping the
 * actual Arabic content (including diacritics).
 */
export function cleanArabicText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(ARABIC_NARRATOR_OPEN_RE, "")
    .replace(ARABIC_NARRATOR_CLOSE_RE, "")
    .replace(ARABIC_SECTION_TAG_RE, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split arabicText into its isnad (chain of transmission) and matn (the
 * Prophet's words) sections when the markers are present. Falls back to a
 * single matn-only string when the markers are absent.
 */
export function splitArabicSnad(
  raw: string | null | undefined,
): { isnad: string | null; matn: string } {
  if (!raw) return { isnad: null, matn: "" };
  const matnMatch = raw.match(/\[matn\]([\s\S]*?)\[\/matn\]/);
  const prematnMatch = raw.match(/\[prematn\]([\s\S]*?)\[\/prematn\]/);
  if (!matnMatch) {
    return { isnad: null, matn: cleanArabicText(raw) };
  }
  return {
    isnad: prematnMatch ? cleanArabicText(prematnMatch[1] ?? "") || null : null,
    matn: cleanArabicText(matnMatch[1] ?? ""),
  };
}

// ── English ─────────────────────────────────────────────────────────────────

const HTML_P_RE = /<\/?p[^>]*>/gi;
const HTML_BR_RE = /<\/?br[^>]*>/gi;

/**
 * Strip HTML tags from englishText and normalize whitespace.
 * Tolerates unpaired <p> tags (which the source data frequently emits).
 */
export function cleanEnglishText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(HTML_P_RE, "\n")
    .replace(HTML_BR_RE, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ \n/g, "\n")
    .replace(/\n /g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// `?[`'‘’ʻʼ]?` accepts ASCII backtick/quote and the common
// Unicode left/right single quotes plus the `ʻ`/`ʼ` modifier-letter apostrophes
// used in Arabic-name transliterations (`Aisha, ʻUmar, etc.).
const NARRATOR_PREFIX_RE =
  /^\s*(?:<p[^>]*>\s*)?Narrated\s+[`'‘’ʻʼ]?(.+?):/i;

/**
 * Extract the narrator name from the "Narrated X:" prefix at the start of
 * englishText. Returns null when no prefix is found.
 */
export function extractNarratorFromEnglish(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^\s+/, "");
  const m = cleaned.match(NARRATOR_PREFIX_RE);
  const name = m?.[1]?.trim();
  return name && name.length > 0 ? name : null;
}

/**
 * Remove the "Narrated X:" prefix from englishText for body-only rendering.
 * Always runs through cleanEnglishText first.
 */
export function stripNarratorPrefix(raw: string | null | undefined): string {
  const cleaned = cleanEnglishText(raw);
  return cleaned
    .replace(/^Narrated\s+[`'‘’ʻʼ]?[^:]+:\s*/i, "")
    .trim();
}

// ── Narrator normalization (for filter matching) ────────────────────────────

const DIACRITIC_RE = /\p{M}/gu;
const NON_ALPHANUM_RE = /[^a-z0-9\s]/g;

/**
 * NFKD-normalize, strip diacritics, lowercase, collapse to [a-z0-9 ], trim.
 * Used when matching a user-typed narrator filter against extracted names.
 */
export function normalizeNarrator(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFKD")
    .replace(DIACRITIC_RE, "")
    .toLowerCase()
    .replace(NON_ALPHANUM_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}
