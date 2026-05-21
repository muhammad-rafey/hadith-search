/**
 * One-time embedding ingest.
 *
 *   pnpm --filter @hadith/web ingest:embeddings
 *
 * Reads every Bukhari row from `hadith_table`, builds an English passage
 * (book label + chapter + narrator + cleaned text), embeds it with Cohere
 * embed-v4.0 (search_document mode), and upserts into `hadith_embeddings`
 * keyed by arabicURN.
 *
 * Resumable: rows whose `(model, text_hash)` pair already matches are
 * skipped. Changing either the cleaner output OR the embed model forces a
 * full re-embed.
 *
 * Cost (≈7,277 rows × ~250 tokens ≈ 1.8 M tokens) is under $0.25 at current
 * Cohere embed-v4 input pricing. Wall clock ~10–15 minutes.
 *
 * Env: requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, and
 * COHERE_API_KEY. tsx does NOT auto-load .env files — export them in the
 * shell, or run with:
 *   `node --env-file=apps/web/.env.local --import tsx apps/web/scripts/ingest-embeddings.ts`
 */

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import {
  cleanEnglishText,
  extractNarratorFromEnglish,
} from "@hadith/shared-types/clean";

import { COHERE_EMBED_MODEL, embedDocuments, toPgVectorLiteral } from "../lib/server/cohere";

const PAGE = 500;
const BATCH = 96;
const MAX_PASSAGE_CHARS = 2000;
const COHERE_RETRY_ATTEMPTS = 4;
const COHERE_RETRY_BASE_MS = 1_000;

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
  // Cap at word boundary when possible to avoid mid-word truncation.
  if (passage.length <= MAX_PASSAGE_CHARS) return passage;
  const cut = passage.slice(0, MAX_PASSAGE_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > MAX_PASSAGE_CHARS * 0.9 ? cut.slice(0, lastSpace) : cut;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

async function embedWithRetry(texts: string[], firstUrn: number, lastUrn: number): Promise<number[][]> {
  let attempt = 0;
  while (true) {
    try {
      return await embedDocuments(texts);
    } catch (err) {
      attempt++;
      const msg = err instanceof Error ? err.message : String(err);
      // Retry on rate-limit / transient errors; bail on auth / config errors.
      const retryable =
        /429|rate.?limit|timeout|5\d\d|ETIMEDOUT|ECONNRESET|fetch failed/i.test(msg);
      if (!retryable || attempt >= COHERE_RETRY_ATTEMPTS) {
        console.error(
          `[ingest] embed FAILED for urns ${firstUrn}..${lastUrn} after ${attempt} attempts: ${msg}`,
        );
        throw err;
      }
      const delay = COHERE_RETRY_BASE_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 500);
      console.warn(
        `[ingest] embed retry ${attempt}/${COHERE_RETRY_ATTEMPTS} for urns ${firstUrn}..${lastUrn} in ${delay}ms (${msg.slice(0, 80)})`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
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
  const failedUrnRanges: string[] = [];

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

    // Filter to rows that need (re-)embedding. Hash includes the model so a
    // model swap re-embeds everything; we also key on the cleaned passage so
    // a cleaner-rule change triggers selective re-embedding.
    const candidates = rows.map((r) => {
      const passage = passageFor(r);
      return { row: r, passage, hash: sha256Hex(`${COHERE_EMBED_MODEL}|${passage}`) };
    });

    // Bulk check existing hashes for this page only.
    const urns = candidates.map((c) => c.row.arabicURN);
    const { data: existing, error: exErr } = await supabase
      .from("hadith_embeddings")
      .select("arabic_urn,text_hash,model")
      .in("arabic_urn", urns);
    if (exErr) throw exErr;
    const existingByUrn = new Map<number, { text_hash: string; model: string }>();
    for (const e of (existing ?? []) as { arabic_urn: number; text_hash: string; model: string }[]) {
      existingByUrn.set(e.arabic_urn, { text_hash: e.text_hash, model: e.model });
    }
    const todo = candidates.filter((c) => {
      const e = existingByUrn.get(c.row.arabicURN);
      return !e || e.text_hash !== c.hash || e.model !== COHERE_EMBED_MODEL;
    });
    skipped += candidates.length - todo.length;

    // Embed in batches; each batch is retried independently. Failed batches
    // are logged and skipped so the rest of the corpus still ingests.
    for (let b = 0; b < todo.length; b += BATCH) {
      const batch = todo.slice(b, b + BATCH);
      const firstUrn = batch[0]?.row.arabicURN ?? 0;
      const lastUrn = batch[batch.length - 1]?.row.arabicURN ?? 0;
      let vectors: number[][];
      try {
        vectors = await embedWithRetry(batch.map((c) => c.passage), firstUrn, lastUrn);
      } catch {
        failedUrnRanges.push(`${firstUrn}..${lastUrn}`);
        continue;
      }
      const inserts = batch.map((c, i) => ({
        arabic_urn: c.row.arabicURN,
        embedding: toPgVectorLiteral(vectors[i] as number[]),
        model: COHERE_EMBED_MODEL,
        text_hash: c.hash,
        updated_at: new Date().toISOString(),
      }));
      const { error: upErr } = await supabase
        .from("hadith_embeddings")
        .upsert(inserts, { onConflict: "arabic_urn" });
      if (upErr) {
        console.error(
          `[ingest] upsert FAILED for urns ${firstUrn}..${lastUrn}: ${upErr.message.slice(0, 200)}`,
        );
        failedUrnRanges.push(`${firstUrn}..${lastUrn}`);
        continue;
      }
      embedded += batch.length;
    }

    processed += rows.length;
    console.log(
      `[${processed}/${total}] embedded=${embedded} skipped=${skipped} failed=${failedUrnRanges.length} (page offset=${offset})`,
    );
  }

  console.log(`Done. embedded=${embedded} skipped=${skipped} total_processed=${processed}`);
  if (failedUrnRanges.length > 0) {
    console.error(
      `[ingest] ${failedUrnRanges.length} batch(es) failed. Re-run the script — resumability will skip everything already embedded. Failed URN ranges:\n  ${failedUrnRanges.join("\n  ")}`,
    );
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
