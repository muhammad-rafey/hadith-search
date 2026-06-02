/**
 * Embedding cost estimator (read-only — does NOT write to the DB or call embed).
 *
 *   node --env-file=apps/web/.env.local --import tsx \
 *     apps/web/scripts/estimate-embedding-cost.ts
 *
 * Streams every row of `hadith_table`, rebuilds the SAME English passage the
 * real ingest embeds (see ingest-embeddings.ts::passageFor), and reports
 * character / word / token counts plus a Cohere cost estimate — per collection
 * and for the whole table.
 *
 * Token count is an ESTIMATE. Two cheap offline heuristics bracket it:
 *   - chars / CHARS_PER_TOKEN   (default 4.0 — typical English BPE)
 *   - words * WORDS_TO_TOKENS   (default 1.33)
 * For an exact figure, set CALIBRATE=1 (needs COHERE_API_KEY): a random-ish
 * sample of passages is sent to Cohere's tokenize endpoint to derive the real
 * chars-per-token ratio, which is then applied to the full corpus.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read). Optional:
 * COHERE_API_KEY (only when CALIBRATE=1), CHARS_PER_TOKEN, WORDS_TO_TOKENS,
 * COLLECTION (limit to one collection), CALIBRATE_SAMPLE (default 300).
 */

import { createClient } from "@supabase/supabase-js";

import {
  cleanEnglishText,
  extractNarratorFromEnglish,
  stripNarratorPrefix,
} from "@hadith/shared-types/clean";

const PAGE = 1000;
const MAX_PASSAGE_CHARS = 2000; // must match ingest-embeddings.ts

// Cohere pay-as-you-go API rates (USD). Verify at https://cohere.com/pricing.
const EMBED_USD_PER_1M_TOKENS = Number(process.env.EMBED_USD_PER_1M_TOKENS ?? 0.12); // embed-v4.0 text
const RERANK_USD_PER_1K_SEARCHES = Number(process.env.RERANK_USD_PER_1K_SEARCHES ?? 2.0); // rerank v3.5 / v4

const CHARS_PER_TOKEN = Number(process.env.CHARS_PER_TOKEN ?? 4.0);
const WORDS_TO_TOKENS = Number(process.env.WORDS_TO_TOKENS ?? 1.33);
const CALIBRATE = process.env.CALIBRATE === "1";
const CALIBRATE_SAMPLE = Number(process.env.CALIBRATE_SAMPLE ?? 300);

type Row = {
  bookNumber: string | null;
  englishBabName: string | null;
  englishText: string | null;
  collection: string | null;
};

// Mirror of ingest-embeddings.ts::passageFor — keep in sync.
function passageFor(row: Row): string {
  const book = (row.bookNumber ?? "").trim() || "?";
  const chapter = cleanEnglishText(row.englishBabName).slice(0, 200);
  const narrator = extractNarratorFromEnglish(row.englishText);
  const body = stripNarratorPrefix(row.englishText);
  const head = `Book ${book}${chapter ? ` | ${chapter}` : ""}`;
  const prefix = narrator ? `Narrated ${narrator}: ` : "";
  const passage = `${head} | ${prefix}${body}`.replace(/\s+/g, " ").trim();
  if (passage.length <= MAX_PASSAGE_CHARS) return passage;
  const cut = passage.slice(0, MAX_PASSAGE_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > MAX_PASSAGE_CHARS * 0.9 ? cut.slice(0, lastSpace) : cut;
}

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

type Stat = { rows: number; chars: number; words: number };
function emptyStat(): Stat {
  return { rows: 0, chars: 0, words: 0 };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
function usd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

async function calibrateRatio(samples: string[]): Promise<number | null> {
  const key = process.env.COHERE_API_KEY;
  if (!key) {
    console.warn("[calibrate] CALIBRATE=1 but COHERE_API_KEY is unset — skipping.");
    return null;
  }
  const { CohereClient } = await import("cohere-ai");
  const client = new CohereClient({ token: key });
  let totalTokens = 0;
  let totalChars = 0;
  let done = 0;
  for (const text of samples) {
    try {
      const res = await client.tokenize({ text, model: "embed-v4.0" });
      totalTokens += res.tokens?.length ?? 0;
      totalChars += text.length;
      done++;
    } catch (err) {
      console.warn(`[calibrate] tokenize failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (!done || !totalTokens) return null;
  const ratio = totalChars / totalTokens;
  console.log(
    `[calibrate] sampled ${done} passages → ${fmt(totalTokens)} tokens / ${fmt(totalChars)} chars = ${ratio.toFixed(3)} chars/token`,
  );
  return ratio;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Read-only: hadith_table is read-all under RLS, so the anon key suffices.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  if (!key)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
  const onlyCollection = process.env.COLLECTION?.trim() || null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const byCollection = new Map<string, Stat>();
  const total = emptyStat();
  const calibrationSamples: string[] = [];
  const sampleStride = Math.max(1, Math.floor(44896 / CALIBRATE_SAMPLE));

  let offset = 0;
  let seen = 0;
  for (;;) {
    let q = supabase
      .from("hadith_table")
      .select('"bookNumber","englishBabName","englishText",collection')
      .order("arabicURN", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (onlyCollection) q = q.eq("collection", onlyCollection);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const r of data as unknown as Row[]) {
      const passage = passageFor(r);
      const chars = passage.length;
      const words = wordCount(passage);
      const col = r.collection ?? "(null)";
      const s = byCollection.get(col) ?? emptyStat();
      s.rows++;
      s.chars += chars;
      s.words += words;
      byCollection.set(col, s);
      total.rows++;
      total.chars += chars;
      total.words += words;
      if (CALIBRATE && seen % sampleStride === 0 && calibrationSamples.length < CALIBRATE_SAMPLE) {
        calibrationSamples.push(passage);
      }
      seen++;
    }
    process.stderr.write(`\rscanned ${fmt(total.rows)} rows...`);
    offset += PAGE;
  }
  process.stderr.write("\n");

  let charsPerToken = CHARS_PER_TOKEN;
  if (CALIBRATE) {
    const ratio = await calibrateRatio(calibrationSamples);
    if (ratio) charsPerToken = ratio;
  }

  const tokensOf = (s: Stat) => ({
    byChars: Math.round(s.chars / charsPerToken),
    byWords: Math.round(s.words * WORDS_TO_TOKENS),
  });

  const rows = [...byCollection.entries()].sort((a, b) => b[1].rows - a[1].rows);
  console.log(
    `\n${"collection".padEnd(16)}${"rows".padStart(9)}${"chars".padStart(13)}${"~tok(chars)".padStart(13)}${"~tok(words)".padStart(13)}${"embed $".padStart(11)}`,
  );
  console.log("-".repeat(75));
  const line = (name: string, s: Stat) => {
    const t = tokensOf(s);
    const cost = (t.byChars / 1_000_000) * EMBED_USD_PER_1M_TOKENS;
    console.log(
      name.padEnd(16) +
        fmt(s.rows).padStart(9) +
        fmt(s.chars).padStart(13) +
        fmt(t.byChars).padStart(13) +
        fmt(t.byWords).padStart(13) +
        usd(cost).padStart(11),
    );
  };
  for (const [name, s] of rows) line(name, s);
  console.log("-".repeat(75));
  line("TOTAL", total);

  const t = tokensOf(total);
  const embedLow = (t.byChars / 1_000_000) * EMBED_USD_PER_1M_TOKENS;
  const embedHigh = (t.byWords / 1_000_000) * EMBED_USD_PER_1M_TOKENS;
  const [lo, hi] = embedLow <= embedHigh ? [embedLow, embedHigh] : [embedHigh, embedLow];

  console.log(
    `\nTokenizer ratio: ${charsPerToken.toFixed(3)} chars/token${CALIBRATE ? " (calibrated)" : " (heuristic)"}`,
  );
  console.log(`Embed model: embed-v4.0 @ ${usd(EMBED_USD_PER_1M_TOKENS)}/1M tokens`);
  console.log(`  → one-time ingest of whole table: ${usd(lo)} – ${usd(hi)}`);
  console.log(
    `\nRerank model: rerank-v4.0-pro @ ${usd(RERANK_USD_PER_1K_SEARCHES)}/1K searches (1 search = 1 query + ≤100 docs).`,
  );
  console.log(
    `  Rerank is a QUERY-TIME cost, not an ingest cost: ~${usd(RERANK_USD_PER_1K_SEARCHES / 1000)} per user search.`,
  );
  console.log(`  e.g. 100k searches ≈ ${usd((100_000 / 1000) * RERANK_USD_PER_1K_SEARCHES)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
