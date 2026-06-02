/**
 * One-time embedding ingest.
 *
 *   pnpm --filter @hadith/web ingest:embeddings
 *
 * Reads every Bukhari row from `hadith_table`, builds an English passage
 * (book label + chapter + narrator + cleaned text), embeds it, and upserts
 * into `hadith_embeddings` keyed by arabicURN.
 *
 * Embedding provider (EMBED_PROVIDER, default "cohere"):
 *   - "cohere"   → Cohere embed-v4.0, search_document mode (cloud).
 *   - "bge-local" → local BGE-M3 server (scripts/bge_m3_server.py). Start it
 *     first; both are 1024-dim so no DB migration. Query-time MUST use the
 *     same provider or recall collapses.
 *
 * Storage backend (auto-selected):
 *   - DATABASE_URL set → direct Postgres via `pg` (works without the
 *     service-role key; a direct connection bypasses RLS). Preferred.
 *   - else → supabase-js REST, needs SUPABASE_SERVICE_ROLE_KEY.
 *
 * Resumable: rows whose `(model, text_hash)` pair already matches are
 * skipped. Changing the cleaner output OR the embed model forces a re-embed.
 *
 * tsx does NOT auto-load .env files, and cohere.ts imports `server-only`
 * (a no-op only under the react-server condition). Run with:
 *   node --conditions=react-server --env-file=.env.local --import tsx \
 *     apps/web/scripts/ingest-embeddings.ts
 */

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import {
  cleanEnglishText,
  extractNarratorFromEnglish,
  stripNarratorPrefix,
} from "@hadith/shared-types/clean";

import {
  ACTIVE_EMBED_MODEL,
  EMBED_PROVIDER_ID,
  embedDocuments,
  toPgVectorLiteral,
} from "../lib/server/cohere";

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
  // Body with the "Narrated X:" prefix removed — we re-add the narrator once via
  // `prefix` below. Using cleanEnglishText here (which keeps the prefix) would
  // embed the narrator twice and skew the document vector.
  const body = stripNarratorPrefix(row.englishText);
  const head = `Book ${book}${chapter ? ` | ${chapter}` : ""}`;
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

async function embedWithRetry(
  texts: string[],
  firstUrn: number,
  lastUrn: number,
): Promise<number[][]> {
  let attempt = 0;
  while (true) {
    try {
      return await embedDocuments(texts);
    } catch (err) {
      attempt++;
      const msg = err instanceof Error ? err.message : String(err);
      // Retry on rate-limit / transient errors; bail on auth / config errors.
      const retryable = /429|rate.?limit|timeout|5\d\d|ETIMEDOUT|ECONNRESET|fetch failed/i.test(
        msg,
      );
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

type ExistingRow = { text_hash: string; model: string };
type InsertRow = {
  arabic_urn: number;
  embedding: string;
  model: string;
  text_hash: string;
  updated_at: string;
};

/**
 * Minimal storage surface the ingest needs. Two backends:
 *  - `pg` (preferred when DATABASE_URL is set): direct Postgres, works without
 *    the service-role key. DATABASE_URL points at the same Supabase DB, and a
 *    direct connection bypasses RLS, so writes succeed.
 *  - `supabase-js` (fallback): the original REST path, needs the service-role
 *    key to bypass RLS on the cache/embeddings tables.
 */
interface Store {
  label: string;
  count(): Promise<number>;
  page(offset: number, limit: number): Promise<Row[]>;
  existing(urns: number[]): Promise<Map<number, ExistingRow>>;
  upsert(rows: InsertRow[]): Promise<void>;
  close(): Promise<void>;
}

const ROW_COLS =
  '"arabicURN","bookNumber","hadithNumber","ourHadithNumber","englishBabName","englishText"';

function makePgStore(connectionString: string): Store {
  const pool = new pg.Pool({ connectionString, max: 4 });
  return {
    label: "pg (DATABASE_URL)",
    async count() {
      const { rows } = await pool.query<{ n: number }>(
        "select count(*)::int as n from public.hadith_table where collection = 'bukhari'",
      );
      return rows[0]?.n ?? 0;
    },
    async page(offset, limit) {
      const { rows } = await pool.query(
        `select ${ROW_COLS} from public.hadith_table where collection = 'bukhari' order by "arabicURN" asc limit $1 offset $2`,
        [limit, offset],
      );
      return rows as Row[];
    },
    async existing(urns) {
      const { rows } = await pool.query<{ arabic_urn: number; text_hash: string; model: string }>(
        "select arabic_urn, text_hash, model from public.hadith_embeddings " +
          "where arabic_urn = any($1::bigint[])",
        [urns],
      );
      const map = new Map<number, ExistingRow>();
      for (const r of rows)
        map.set(Number(r.arabic_urn), { text_hash: r.text_hash, model: r.model });
      return map;
    },
    async upsert(rows) {
      // Build a single multi-row INSERT … ON CONFLICT. embedding is halfvec —
      // pass the "[...]" literal and cast.
      const values: unknown[] = [];
      const tuples = rows.map((r, i) => {
        const b = i * 5;
        values.push(r.arabic_urn, r.embedding, r.model, r.text_hash, r.updated_at);
        return `($${b + 1}, $${b + 2}::halfvec, $${b + 3}, $${b + 4}, $${b + 5})`;
      });
      await pool.query(
        `insert into public.hadith_embeddings (arabic_urn, embedding, model, text_hash, updated_at) values ${tuples.join(", ")} on conflict (arabic_urn) do update set embedding = excluded.embedding, model = excluded.model, text_hash = excluded.text_hash, updated_at = excluded.updated_at`,
        values,
      );
    },
    async close() {
      await pool.end();
    },
  };
}

function makeSupabaseStore(url: string, key: string): Store {
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    label: "supabase-js (service role)",
    async count() {
      const { count, error } = await supabase
        .from("hadith_table")
        .select("arabicURN", { count: "exact", head: true })
        .eq("collection", "bukhari");
      if (error) throw error;
      return count ?? 0;
    },
    async page(offset, limit) {
      const { data, error } = await supabase
        .from("hadith_table")
        .select(ROW_COLS)
        .eq("collection", "bukhari")
        .order("arabicURN", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    async existing(urns) {
      const { data, error } = await supabase
        .from("hadith_embeddings")
        .select("arabic_urn,text_hash,model")
        .in("arabic_urn", urns);
      if (error) throw error;
      const map = new Map<number, ExistingRow>();
      for (const e of (data ?? []) as { arabic_urn: number; text_hash: string; model: string }[]) {
        map.set(e.arabic_urn, { text_hash: e.text_hash, model: e.model });
      }
      return map;
    },
    async upsert(rows) {
      const { error } = await supabase
        .from("hadith_embeddings")
        .upsert(rows, { onConflict: "arabic_urn" });
      if (error) throw new Error(error.message);
    },
    async close() {
      // supabase-js has no persistent connection to close.
    },
  };
}

function makeStore(): Store {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) return makePgStore(dbUrl);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url)
    throw new Error("Set DATABASE_URL, or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required (or set DATABASE_URL)");
  return makeSupabaseStore(url, key);
}

async function main() {
  if (EMBED_PROVIDER_ID !== "bge-local" && !process.env.COHERE_API_KEY) {
    throw new Error("COHERE_API_KEY is required (or set EMBED_PROVIDER=bge-local)");
  }

  const store = makeStore();
  console.log(`Embedding provider: ${EMBED_PROVIDER_ID} (model=${ACTIVE_EMBED_MODEL})`);
  console.log(`Storage backend: ${store.label}`);

  try {
    console.log("Counting bukhari rows...");
    const total = await store.count();
    console.log(`Total bukhari rows: ${total}`);

    let processed = 0;
    let embedded = 0;
    let skipped = 0;
    const failedUrnRanges: string[] = [];

    for (let offset = 0; offset < total; offset += PAGE) {
      const rows = await store.page(offset, PAGE);
      if (rows.length === 0) break;

      // Filter to rows that need (re-)embedding. Hash includes the model so a
      // model swap re-embeds everything; we also key on the cleaned passage so
      // a cleaner-rule change triggers selective re-embedding.
      const candidates = rows.map((r) => {
        const passage = passageFor(r);
        return { row: r, passage, hash: sha256Hex(`${ACTIVE_EMBED_MODEL}|${passage}`) };
      });

      // Bulk check existing hashes for this page only.
      const existingByUrn = await store.existing(candidates.map((c) => c.row.arabicURN));
      const todo = candidates.filter((c) => {
        const e = existingByUrn.get(c.row.arabicURN);
        return !e || e.text_hash !== c.hash || e.model !== ACTIVE_EMBED_MODEL;
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
          vectors = await embedWithRetry(
            batch.map((c) => c.passage),
            firstUrn,
            lastUrn,
          );
        } catch {
          failedUrnRanges.push(`${firstUrn}..${lastUrn}`);
          continue;
        }
        const inserts: InsertRow[] = batch.map((c, i) => ({
          arabic_urn: c.row.arabicURN,
          embedding: toPgVectorLiteral(vectors[i] as number[]),
          model: ACTIVE_EMBED_MODEL,
          text_hash: c.hash,
          updated_at: new Date().toISOString(),
        }));
        try {
          await store.upsert(inserts);
        } catch (err) {
          const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
          console.error(`[ingest] upsert FAILED for urns ${firstUrn}..${lastUrn}: ${msg}`);
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
  } finally {
    await store.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
