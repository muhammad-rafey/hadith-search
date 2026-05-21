/**
 * One-time embedding ingest.
 *
 *   pnpm --filter @hadith/web ingest:embeddings
 *
 * Reads every Bukhari row from `hadith_table`, builds an English passage
 * (book label + chapter + narrator + cleaned text), embeds it with Cohere
 * embed-v4.0 (search_document mode), and upserts into `hadith_embeddings`
 * keyed by arabicURN. Resumable: rows whose text_hash already matches are
 * skipped on rerun.
 *
 * Cost (≈7,277 rows × ~250 tokens) is well under $1; wall clock ~10-15 min.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + COHERE_API_KEY in apps/web/.env.local
 * (loaded via `dotenv`-style by tsx loading process.env from the shell).
 */

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import {
  cleanArabicText,
  cleanEnglishText,
  extractNarratorFromEnglish,
} from "@hadith/shared-types/clean";

import { COHERE_EMBED_MODEL, embedDocuments, toPgVectorLiteral } from "../lib/server/cohere";

const PAGE = 500;
const BATCH = 96;
const MAX_PASSAGE_CHARS = 2000;

type Row = {
  arabicURN: number;
  bookNumber: string | null;
  hadithNumber: string | null;
  ourHadithNumber: number;
  englishBabName: string | null;
  englishText: string | null;
};

function passageFor(row: Row): string {
  const book = (row.bookNumber ?? "").trim() || "?";
  const chapter = cleanEnglishText(row.englishBabName).slice(0, 200);
  const narrator = extractNarratorFromEnglish(row.englishText);
  const body = cleanEnglishText(row.englishText);
  const head = `Book ${book}${chapter ? " | " + chapter : ""}`;
  const prefix = narrator ? `Narrated ${narrator}: ` : "";
  const passage = `${head} | ${prefix}${body}`.replace(/\s+/g, " ").trim();
  return passage.length > MAX_PASSAGE_CHARS ? passage.slice(0, MAX_PASSAGE_CHARS) : passage;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  if (!process.env.COHERE_API_KEY) throw new Error("COHERE_API_KEY is required");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Counting bukhari rows...");
  const { count: total, error: countErr } = await supabase
    .from("hadith_table")
    .select("arabicURN", { count: "exact", head: true })
    .eq("collection", "bukhari");
  if (countErr) throw countErr;
  console.log(`Total bukhari rows: ${total}`);

  let processed = 0;
  let embedded = 0;
  let skipped = 0;

  for (let offset = 0; offset < (total ?? 0); offset += PAGE) {
    const { data, error } = await supabase
      .from("hadith_table")
      .select(
        '"arabicURN","bookNumber","hadithNumber","ourHadithNumber","englishBabName","englishText"',
      )
      .eq("collection", "bukhari")
      .order("arabicURN", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    const rows = data as unknown as Row[];

    // Filter to rows that need (re-)embedding.
    const candidates: { row: Row; passage: string; hash: string }[] = rows.map((r) => {
      const passage = passageFor(r);
      return { row: r, passage, hash: sha256Hex(passage) };
    });

    // Bulk check existing hashes.
    const urns = candidates.map((c) => c.row.arabicURN);
    const { data: existing, error: exErr } = await supabase
      .from("hadith_embeddings")
      .select("arabic_urn,text_hash")
      .in("arabic_urn", urns);
    if (exErr) throw exErr;
    const existingHashByUrn = new Map<number, string>();
    for (const e of (existing ?? []) as { arabic_urn: number; text_hash: string }[]) {
      existingHashByUrn.set(e.arabic_urn, e.text_hash);
    }
    const todo = candidates.filter(
      (c) => existingHashByUrn.get(c.row.arabicURN) !== c.hash,
    );
    skipped += candidates.length - todo.length;

    // Embed in batches of BATCH.
    for (let b = 0; b < todo.length; b += BATCH) {
      const batch = todo.slice(b, b + BATCH);
      const texts = batch.map((c) => c.passage);
      const vectors = await embedDocuments(texts);
      const inserts = batch.map((c, i) => ({
        arabic_urn: c.row.arabicURN,
        embedding: toPgVectorLiteral(vectors[i] ?? []),
        model: COHERE_EMBED_MODEL,
        text_hash: c.hash,
        updated_at: new Date().toISOString(),
      }));
      const { error: upErr } = await supabase
        .from("hadith_embeddings")
        .upsert(inserts, { onConflict: "arabic_urn" });
      if (upErr) throw upErr;
      embedded += batch.length;
    }

    processed += rows.length;
    console.log(
      `[${processed}/${total}] embedded=${embedded} skipped=${skipped} (page offset=${offset})`,
    );
  }

  console.log(`Done. embedded=${embedded} skipped=${skipped} total_processed=${processed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
