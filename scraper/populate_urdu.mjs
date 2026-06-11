#!/usr/bin/env node
/**
 * Populate the Urdu translation columns ("urduText", "urduSanad") on
 * public.hadith_table from the scraped CSV (out/sunnah_urdu.csv).
 *
 * Strategy (mirrors scraper/compare_arabic.py): match each DB row to a CSV row
 * by (collection, hadithNumber), then VERIFY the Arabic agrees (normalized, with
 * a letters-only fallback) before writing. Only verified matches are updated, so
 * we never put Urdu onto a hadith whose Arabic doesn't line up.
 *
 * Purely additive: only "urduText"/"urduSanad" are written, only on matched rows.
 * No other column is touched; no DELETE/TRUNCATE. Rows without a match stay NULL.
 *
 * Usage (standalone re-run against the existing CSV):
 *   node --env-file=.env.local scraper/populate_urdu.mjs
 *
 * It also runs automatically at the end of scrape.mjs (when DATABASE_URL is set).
 * Requires DATABASE_URL.
 *
 * NOTE: scripts/load_chunks.mjs truncates + reloads hadith_table from seed (which
 * has no Urdu), so it wipes these columns. Re-run this after any load_chunks run.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV = path.join(__dirname, "out", "sunnah_urdu.csv");
const LOG_FILE = path.join(__dirname, "out", "urdu_populate.log");

// ---- Arabic normalization (ported from compare_arabic.py) ------------------
// DIAC_RE is the same harakat+tatweel class as compare_arabic.py. Its literal
// combining marks render in a different visual order than their byte order, but
// the on-disk bytes parse to exactly the intended ranges (verified):
//   U+0610-061A, U+064B-065F, U+0670, U+06D6-06ED, U+0640 (tatweel).
// These are diacritics/tatweel only — the Arabic letters (U+0621-064A) survive.
const TAG_RE = /\[\/?(?:prematn|matn|narrator)[^\]]*\]/g;
const DIAC_RE = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const RLM_LRM_RE = /[\u200E\u200F]/g; // left/right-to-left marks
const SMART_QUOTES_RE = /[“”]/g; // curly quotes -> straight "
const WS_RE = /[\s ]+/g;
// Arabic letter block bounds (U+0621 .. U+064A): everything else is dropped.
const AR_LETTER_LO = "ء";
const AR_LETTER_HI = "ي";

const stripMarkup = (s) => (s || "").replace(TAG_RE, "");

export function norm(s, dropDiac = false) {
  let out = stripMarkup(s).replace(RLM_LRM_RE, "").replace(SMART_QUOTES_RE, '"');
  if (dropDiac) out = out.replace(DIAC_RE, "");
  return out.replace(WS_RE, " ").trim();
}

// Keep only Arabic letters, dropping diacritics/markup/punctuation/whitespace.
export function lettersOnly(s) {
  const stripped = stripMarkup(s).replace(DIAC_RE, "");
  let out = "";
  for (const ch of stripped) {
    if (ch >= AR_LETTER_LO && ch <= AR_LETTER_HI) out += ch;
  }
  return out;
}

// Verified Arabic match: normalized-equal OR letters-only-equal.
function arabicMatches(csvArabic, dbArabic) {
  if (norm(csvArabic, true) === norm(dbArabic, true)) return true;
  return lettersOnly(csvArabic) === lettersOnly(dbArabic);
}

export const key = (collection, hadithNumber) =>
  `${(collection || "").trim()} ${(hadithNumber || "").trim()}`;

// ---- main routine ----------------------------------------------------------
export async function populateUrdu({ csvPath = DEFAULT_CSV, databaseUrl } = {}) {
  if (!databaseUrl) {
    console.warn("[urdu] DATABASE_URL not set — skipping DB populate");
    return { skipped: true };
  }
  if (!fs.existsSync(csvPath)) {
    console.warn(`[urdu] CSV not found at ${csvPath} — skipping DB populate`);
    return { skipped: true };
  }

  // Index the CSV by (collection, hadithNumber).
  const records = parse(fs.readFileSync(csvPath), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  const csvIndex = new Map();
  for (const r of records) {
    csvIndex.set(key(r.collection, r.hadithNumber), {
      arabicText: r.arabicText || "",
      urduText: r.urduText || "",
      urduSanad: r.urduSanad || "",
    });
  }
  console.log(`[urdu] loaded ${csvIndex.size} CSV rows from ${path.basename(csvPath)}`);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const stats = { dbRows: 0, populated: 0, arabicMismatch: 0, noCsvMatch: 0, emptyUrdu: 0 };
  const mismatchLog = [];

  try {
    // Safety net so this works even before the migration is pushed.
    await client.query(
      "alter table public.hadith_table " +
        'add column if not exists "urduText" text, ' +
        'add column if not exists "urduSanad" text',
    );

    const { rows } = await client.query(
      'select "arabicURN", "collection", "hadithNumber", "arabicText" from public.hadith_table',
    );
    stats.dbRows = rows.length;

    const updates = []; // { urn, urduText, urduSanad }
    for (const row of rows) {
      const hit = csvIndex.get(key(row.collection, row.hadithNumber));
      if (!hit) {
        stats.noCsvMatch++;
        continue;
      }
      if (!arabicMatches(hit.arabicText, row.arabicText)) {
        stats.arabicMismatch++;
        mismatchLog.push(
          `MISMATCH (${row.collection}, ${row.hadithNumber}) arabicURN=${row.arabicURN}`,
        );
        continue;
      }
      if (!hit.urduText && !hit.urduSanad) {
        stats.emptyUrdu++;
        continue;
      }
      updates.push({
        urn: row.arabicURN,
        urduText: hit.urduText || null,
        urduSanad: hit.urduSanad || null,
      });
    }

    // Batched UPDATE via UNNEST — one round-trip per batch.
    const BATCH = 1000;
    await client.query("begin");
    for (let i = 0; i < updates.length; i += BATCH) {
      const slice = updates.slice(i, i + BATCH);
      const urns = slice.map((u) => u.urn);
      const texts = slice.map((u) => u.urduText);
      const sanads = slice.map((u) => u.urduSanad);
      const res = await client.query(
        `update public.hadith_table as h
            set "urduText" = v.urdu_text,
                "urduSanad" = v.urdu_sanad
           from (select * from unnest($1::int[], $2::text[], $3::text[])
                        as t(arabic_urn, urdu_text, urdu_sanad)) as v
          where h."arabicURN" = v.arabic_urn`,
        [urns, texts, sanads],
      );
      stats.populated += res.rowCount ?? 0;
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }

  // Write a detail log for review.
  fs.writeFileSync(
    LOG_FILE,
    [
      `Urdu populate run`,
      `DB rows scanned:        ${stats.dbRows}`,
      `Populated (Urdu set):   ${stats.populated}`,
      `Arabic mismatch (skip): ${stats.arabicMismatch}`,
      `No CSV match (skip):    ${stats.noCsvMatch}`,
      `Empty Urdu in CSV:      ${stats.emptyUrdu}`,
      ``,
      ...mismatchLog,
      ``,
    ].join("\n"),
  );

  console.log(
    `[urdu] populated ${stats.populated} rows ` +
      `(arabic-mismatch ${stats.arabicMismatch}, no-csv-match ${stats.noCsvMatch}, ` +
      `empty-urdu ${stats.emptyUrdu}) — details in ${path.basename(LOG_FILE)}`,
  );
  return stats;
}

// ---- standalone entrypoint -------------------------------------------------
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  populateUrdu({ databaseUrl: process.env.DATABASE_URL })
    .then((stats) => {
      if (stats?.skipped) process.exitCode = 1;
    })
    .catch((err) => {
      console.error("[urdu] populate failed:", err);
      process.exit(1);
    });
}
