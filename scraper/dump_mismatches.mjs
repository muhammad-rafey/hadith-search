#!/usr/bin/env node
/**
 * Diagnostic: write ONE report of every Arabic mismatch — the hadiths where the
 * DB and the scraped CSV share a (collection, hadithNumber) but their Arabic does
 * NOT verify, so populate_urdu.mjs skipped them.
 *
 * The report is split into two sections, and each entry shows the FULL Arabic
 * from BOTH sources (scraper CSV vs database) so you can compare directly:
 *
 *   SECTION A — EMPTY ARABIC: the scrape produced no Arabic for this hadith.
 *   SECTION B — MISMATCH:     both have Arabic but the letters differ. Each is
 *               tagged SAME-hadith (trivial diff) or DIFFERENT-hadith (the number
 *               points to a different hadith — a numbering offset between sources).
 *
 * Usage:   node --env-file=.env.local scraper/dump_mismatches.mjs
 * Output:  scraper/out/arabic_mismatches.txt
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import pg from "pg";
import { key, lettersOnly, norm } from "./populate_urdu.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.join(__dirname, "out", "sunnah_urdu.csv");
const OUT = path.join(__dirname, "out", "arabic_mismatches.txt");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set. Run: node --env-file=.env.local scraper/dump_mismatches.mjs");
  process.exit(1);
}

const arabicMatches = (a, b) =>
  norm(a, true) === norm(b, true) || lettersOnly(a) === lettersOnly(b);

// length of the common leading run of two strings
const commonPrefix = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

const oneLine = (s) => (s || "").replace(/\s+/g, " ").trim() || "(empty)";

// Build CSV index (full Arabic + Urdu) keyed by (collection, hadithNumber).
const records = parse(fs.readFileSync(CSV), {
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
  });
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const empties = [];
const mismatches = [];
let scanned = 0;

try {
  const { rows } = await client.query(
    'select "arabicURN", "collection", "hadithNumber", "arabicText" from public.hadith_table',
  );
  scanned = rows.length;

  for (const row of rows) {
    const hit = csvIndex.get(key(row.collection, row.hadithNumber));
    if (!hit) continue; // not scraped at all -> not a mismatch
    if (arabicMatches(hit.arabicText, row.arabicText)) continue; // verified -> fine

    const csvLetters = lettersOnly(hit.arabicText);
    const dbLetters = lettersOnly(row.arabicText);
    const entry = {
      collection: row.collection,
      hadithNumber: row.hadithNumber,
      arabicURN: row.arabicURN,
      csvArabic: hit.arabicText,
      dbArabic: row.arabicText,
      urduText: hit.urduText,
      csvLen: csvLetters.length,
      dbLen: dbLetters.length,
    };
    if (!csvLetters) {
      empties.push(entry);
    } else {
      const common = commonPrefix(csvLetters, dbLetters);
      entry.overlap = common / Math.min(csvLetters.length, dbLetters.length);
      mismatches.push(entry);
    }
  }
} finally {
  await client.end();
}

// SAME-hadith first (high overlap), then the genuinely different ones.
mismatches.sort((a, b) => b.overlap - a.overlap);
const sameCount = mismatches.filter((m) => m.overlap > 0.9).length;
const diffCount = mismatches.filter((m) => m.overlap <= 0.9).length;

const lines = [];
const w = (s = "") => lines.push(s);

w("ARABIC MISMATCH REPORT");
w(`DB rows scanned:        ${scanned}`);
w(`Total skipped (mismatch): ${empties.length + mismatches.length}`);
w(`  - Section A, EMPTY ARABIC (scrape had no Arabic):        ${empties.length}`);
w(`  - Section B, BOTH HAVE ARABIC BUT DIFFER:               ${mismatches.length}`);
w(`        of which SAME hadith (overlap > 90%, safe):       ${sameCount}`);
w(`        of which DIFFERENT hadith (number points elsewhere): ${diffCount}`);
w("");
w("For every entry below: SCRAPER = Arabic from the scrape (CSV), DB = Arabic in");
w("the database. Text is shown in full, with original markup, so you can compare.");
w("");

w("================================================================");
w("SECTION A — EMPTY ARABIC (scraper produced no Arabic to compare)");
w("The Urdu WAS scraped (shown), but the Arabic half came back blank, so there");
w("was nothing to verify against the DB. Fixable by re-scraping these hadiths.");
w("================================================================");
w("");
for (const e of empties) {
  w(`### (${e.collection}, ${e.hadithNumber})  arabicURN=${e.arabicURN}`);
  w(`SCRAPER Arabic : (empty)`);
  w(`DB Arabic      : ${oneLine(e.dbArabic)}`);
  w(`SCRAPER Urdu   : ${oneLine(e.urduText)}`);
  w("");
}

w("================================================================");
w("SECTION B — BOTH HAVE ARABIC BUT THEY DIFFER");
w("Tagged SAME (basically identical, trivial extra text) or DIFFERENT (the same");
w("number maps to a different hadith in each source — a numbering offset).");
w("================================================================");
w("");
for (const m of mismatches) {
  const tag = m.overlap > 0.9 ? "SAME hadith (trivial diff)" : "DIFFERENT hadith (numbering mismatch)";
  w(`### (${m.collection}, ${m.hadithNumber})  arabicURN=${m.arabicURN}`);
  w(`VERDICT        : ${tag}   [overlap ${(m.overlap * 100).toFixed(0)}%, CSV=${m.csvLen} letters, DB=${m.dbLen} letters]`);
  w(`SCRAPER Arabic : ${oneLine(m.csvArabic)}`);
  w(`DB Arabic      : ${oneLine(m.dbArabic)}`);
  w("");
}

fs.writeFileSync(OUT, lines.join("\n"));
console.log(
  `Wrote report to ${path.basename(OUT)} — ` +
    `${empties.length} empty, ${mismatches.length} differ (${sameCount} same / ${diffCount} different)`,
);
