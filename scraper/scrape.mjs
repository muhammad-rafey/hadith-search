// Scrape Urdu hadith data (Arabic + Urdu + reference) from sunnah.com into a CSV.
//
// Approach: plain fetch (built into Node) + cheerio for the server-rendered HTML
// (Arabic text + references), combined with sunnah.com's lazy-loaded JSON endpoint
// /ajax/urdu/{collection}/{book} for the Urdu translation. No headless browser needed.
//
// Usage:
//   node scrape.js                          # all collections that have Urdu (auto-detected)
//   node scrape.js --collection bukhari     # one collection
//   node scrape.js --collection bukhari --book 1   # a single book (for testing)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { stringify } from "csv-stringify";
import { populateUrdu } from "./populate_urdu.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = "https://sunnah.com";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Full slug list discovered from sunnah.com's homepage. The scraper probes each and
// keeps only those whose book pages advertise an Urdu translation.
const ALL_COLLECTIONS = [
  "bukhari",
  "muslim",
  "nasai",
  "abudawud",
  "tirmidhi",
  "ibnmajah",
  "malik",
  "ahmad",
  "darimi",
  "riyadussalihin",
  "adab",
  "bulugh",
  "shamail",
  "mishkat",
  "hisn",
  "nawawi40",
  "forty",
  "qudsi40",
  "abdurrazzaq",
  "bayhaqi",
  "daraqutni",
  "hakim",
  "ibnabishayba",
  "ibnhibban",
  "ibnkhuzayma",
  "nasaikubra",
  "virtues",
];

const CSV_COLUMNS = [
  "collection",
  "bookNumber",
  "bookName_urdu",
  "babNumber",
  "babName_urdu",
  "hadithNumber",
  "reference",
  "inBookReference",
  "grade",
  "arabicText",
  "urduSanad",
  "urduText",
];

// ---- CLI args -------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--collection") out.collection = argv[++i];
    else if (a === "--book") out.book = argv[++i];
  }
  return out;
}

// ---- fetch helpers (retry + backoff) --------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { retries = 4 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/json,*/*" },
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) return null; // 404 etc. -> caller treats as "not found"
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(800 * 2 ** attempt + Math.floor(attempt * 137));
    }
  }
  throw lastErr;
}

// Urdu endpoint returns JSON when Urdu exists, otherwise a full HTML page.
async function fetchUrduJson(collection, book) {
  const text = await fetchText(`${BASE}/ajax/urdu/${collection}/${book}`);
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : null;
  } catch {
    return null; // HTML page => no Urdu for this book
  }
}

// ---- parsing --------------------------------------------------------------
// Invisible bidirectional control marks sunnah.com embeds in the text
// (RLM/LRM, embeddings, overrides, isolates, ZWSP, BOM). ZWNJ/ZWJ are kept.
const BIDI_MARKS = /[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

const clean = (s) =>
  (s || "")
    .replace(/<[^>]*>/g, " ") // strip stray HTML tags (Urdu JSON fields contain <b>, <br> etc.)
    .replace(BIDI_MARKS, "")
    .replace(/\u00a0/g, " ") // non-breaking space -> normal space
    .replace(/\s+/g, " ")
    .trim();

function getAvblLanguages(html) {
  const m = html.match(/avbl_languages\s*=\s*(\[[^\]]*\])/);
  if (!m) return [];
  try {
    return JSON.parse(m[1]);
  } catch {
    return [];
  }
}

// Returns Map<urn, {arabic, reference, inBookReference}>
function parseBookHtml(html) {
  const $ = cheerio.load(html);
  const map = new Map();

  $(".actualHadithContainer").each((_, el) => {
    const $el = $(el);

    // URN from htc{URN} (wrapper) or t{URN} (english container)
    let urn =
      $el.find(".hadithTextContainers").attr("id") ||
      $el.find(".englishcontainer").attr("id") ||
      "";
    urn = urn.replace(/\D/g, "");
    if (!urn) return;

    const arabic = clean($el.find(".arabic_hadith_full").text());

    let reference = "";
    let inBookReference = "";
    $el.find("table.hadith_reference tr").each((__, tr) => {
      const tds = $(tr).find("td");
      const label = clean($(tds[0]).text()).replace(/[:\s]/g, "").toLowerCase();
      const value = clean($(tds[1]).text())
        .replace(/^[:\s]+/, "")
        .trim();
      if (label === "reference") reference = value;
      else if (label === "in-bookreference") inBookReference = value;
    });

    map.set(urn, { arabic, reference, inBookReference });
  });

  return map;
}

// ---- book enumeration -----------------------------------------------------
async function listBooks(collection) {
  const html = await fetchText(`${BASE}/${collection}`);
  if (!html) return [];
  const re = new RegExp(`href="/${collection}/([^"/]+)"`, "g");
  const seen = new Set();
  const books = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const seg = m[1];
    if (!/^(\d+|introduction)$/i.test(seg)) continue;
    if (seen.has(seg)) continue;
    seen.add(seg);
    books.push(seg);
  }
  // numeric order, with "introduction" first if present
  books.sort((a, b) => {
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number(a) - Number(b);
    if (/^\d+$/.test(a)) return 1;
    if (/^\d+$/.test(b)) return -1;
    return 0;
  });
  return books;
}

// ---- main -----------------------------------------------------------------
async function scrapeBook(collection, book) {
  const [html, urdu] = await Promise.all([
    fetchText(`${BASE}/${collection}/${book}`),
    fetchUrduJson(collection, book),
  ]);
  if (!urdu || urdu.length === 0) return []; // no Urdu for this book

  const arabicMap = html ? parseBookHtml(html) : new Map();
  const rows = [];

  for (const h of urdu) {
    const urn = String(h.matchingArabicURN ?? "");
    const ar = arabicMap.get(urn) || {};
    rows.push({
      collection,
      bookNumber: h.bookNumber ?? book,
      bookName_urdu: clean(h.bookName),
      babNumber: h.babNumber ?? "",
      babName_urdu: clean(h.babName),
      // Use the number from the Arabic reference (what sunnah.com displays),
      // not the Urdu JSON's hadithNumber field (often 0, swapped, or missing
      // the merged "272, 273" form). Fall back to the Urdu field if unmatched.
      // The optional trailing letter captures suffixed numbers ("8a", "35b");
      // without it the end-anchor failed on those and silently fell back to the
      // unreliable JSON field. populate_urdu's key() normalizes spaces/case, so
      // "8a" here still matches a DB "8 a".
      hadithNumber:
        (ar.reference || "").match(/(\d[\d,\s]*[a-z]?)\s*$/i)?.[1].trim() || (h.hadithNumber ?? ""),
      reference: ar.reference || "",
      inBookReference: ar.inBookReference || "",
      grade: clean(h.grade),
      arabicText: ar.arabic || "",
      urduSanad: clean(h.hadithSanad),
      urduText: clean(h.hadithText),
    });
  }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "sunnah_urdu.csv");

  // CSV stream with UTF-8 BOM so Excel renders Arabic/Urdu correctly.
  const fileStream = fs.createWriteStream(outFile);
  fileStream.write("﻿");
  const stringifier = stringify({ header: true, columns: CSV_COLUMNS });
  stringifier.pipe(fileStream);
  const writeDone = new Promise((res) => fileStream.on("finish", res));

  const limit = pLimit(3);
  let totalRows = 0;

  const collections = args.collection ? [args.collection] : ALL_COLLECTIONS;

  for (const collection of collections) {
    // Determine the book list.
    let books;
    if (args.book) {
      books = [String(args.book)];
    } else {
      books = await listBooks(collection);
      if (books.length === 0) {
        console.log(`[skip] ${collection}: no books found`);
        continue;
      }
      // Probe the first book; if it has no Urdu, skip the whole collection.
      const probeHtml = await fetchText(`${BASE}/${collection}/${books[0]}`);
      const langs = probeHtml ? getAvblLanguages(probeHtml) : [];
      if (!langs.includes("urdu")) {
        console.log(`[skip] ${collection}: no Urdu (avbl_languages=${JSON.stringify(langs)})`);
        continue;
      }
    }

    console.log(`[scrape] ${collection}: ${books.length} book(s)`);
    let collRows = 0;

    const tasks = books.map((book) =>
      limit(async () => {
        try {
          const rows = await scrapeBook(collection, book);
          for (const r of rows) stringifier.write(r);
          collRows += rows.length;
          totalRows += rows.length;
          if (rows.length) {
            console.log(`  ${collection}/${book}: ${rows.length} hadith`);
          }
        } catch (err) {
          console.warn(`  [error] ${collection}/${book}: ${err.message} — skipped`);
        }
      }),
    );
    await Promise.all(tasks);
    console.log(`[done]  ${collection}: ${collRows} hadith`);
  }

  stringifier.end();
  await writeDone;
  console.log(`\nWrote ${totalRows} rows to ${outFile}`);

  // Carry the scraped Urdu into the DB (match against existing Arabic).
  // Guarded so a missing/broken DB connection never fails the scrape itself.
  if (process.env.DATABASE_URL) {
    try {
      await populateUrdu({ csvPath: outFile, databaseUrl: process.env.DATABASE_URL });
    } catch (err) {
      console.warn(`[urdu] populate skipped: ${err.message}`);
    }
  } else {
    console.warn("[urdu] DATABASE_URL not set — skipping DB populate");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
