/**
 * Render-time cleaners for the raw markup that ships in `hadith_table`.
 *
 * Source quirks observed in the data:
 *   - arabicText wraps the isnad in [prematn]…[/prematn] and the matn in
 *     [matn]…[/matn]; narrator names are wrapped in
 *     [narrator id="N" role="…" tooltip="…"]NAME[/narrator] tags.
 *   - englishText carries unpaired <p> tags, leading "Narrated X:" prefixes
 *     (sometimes with backtick or apostrophe before the name), a lot of
 *     decorative whitespace, and HTML entities like &amp;#39; / &amp;quot; /
 *     &amp;nbsp; that need to be decoded for legible display.
 */

// ── Arabic ──────────────────────────────────────────────────────────────────

// Allow narrator tags with or without attributes (`[narrator]` and
// `[narrator id="N" …]` both appear in the corpus).
const ARABIC_NARRATOR_OPEN_RE = /\[narrator(?:\s+[^\]]*)?\]/g;
const ARABIC_NARRATOR_CLOSE_RE = /\[\/narrator\]/g;
const ARABIC_SECTION_TAG_RE = /\[\/?(?:prematn|matn)\]/g;

// Bidi control characters can break copy/paste alignment; strip them.
// (We keep diacritics, tatweel optional via NFKC, ZWJ/ZWNJ for joined forms.)
const ARABIC_BIDI_CONTROL_RE = /[‎‏‪-‮⁦-⁩]/g;

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
    .replace(ARABIC_BIDI_CONTROL_RE, "")
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

// Whitelist <p> and <br> as paragraph/line breaks; strip every other tag.
const HTML_P_RE = /<\/?p[^>]*>/gi;
const HTML_BR_RE = /<\/?br[^>]*>/gi;
const HTML_ANY_TAG_RE = /<\/?[a-z][^>]*>/gi;

// Common named entities + numeric (decimal and hex) entity decoder.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  // Curly quotes show up frequently in transliterations.
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  mdash: "—",
  ndash: "–",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const cp = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(cp) ? safeFromCodePoint(cp) : "";
    }
    if (body.startsWith("#")) {
      const cp = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(cp) ? safeFromCodePoint(cp) : "";
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? `&${body};`;
  });
}

function safeFromCodePoint(cp: number): string {
  // Drop control chars except newline/tab; clamp surrogates.
  if (cp < 0 || cp > 0x10ffff) return "";
  if (cp >= 0xd800 && cp <= 0xdfff) return "";
  if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a) return "";
  return String.fromCodePoint(cp);
}

/**
 * Strip HTML tags from englishText, decode named/numeric entities, and
 * normalize whitespace. Tolerates unpaired <p> tags (which the source data
 * frequently emits).
 */
export function cleanEnglishText(raw: string | null | undefined): string {
  if (!raw) return "";
  return decodeEntities(
    raw
      .replace(HTML_P_RE, "\n")
      .replace(HTML_BR_RE, "\n")
      .replace(HTML_ANY_TAG_RE, ""),
  )
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
 * englishText. Returns the first narrator only — compound forms like
 * "Narrated A and B:" come through as a single string ("A and B").
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
 * Latin-only by design — Arabic narrator filtering should use the raw text.
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
