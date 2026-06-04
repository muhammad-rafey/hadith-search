#!/usr/bin/env node
/**
 * One-shot loader: streams supabase/seed/hadith_table/NNNN.sql into Postgres.
 *
 * Usage:
 *   node --env-file=.env scripts/load_chunks.mjs
 *
 * Requires DATABASE_URL (Supabase Session Pooler URL on port 6543).
 * Idempotent — truncates public.hadith_table before reload so reruns work.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = resolve(__dirname, "..", "supabase", "seed", "hadith_table");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set.\n" + "Run with: node --env-file=.env scripts/load_chunks.mjs",
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  const force = process.argv.includes("--force");
  const files = (await readdir(SEED_DIR)).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) {
    throw new Error(`No .sql chunks found in ${SEED_DIR}`);
  }
  console.log(`Loading ${files.length} chunk(s) from ${SEED_DIR}`);

  // Guard the destructive reload. hadith_embeddings has an ON DELETE CASCADE FK
  // to hadith_table, so the TRUNCATE … CASCADE below also wipes the (expensive
  // to recompute) embeddings. Refuse unless --force so an accidental re-run
  // can't silently destroy an embedded corpus.
  const { rows: embRows } = await client.query(
    "select count(*)::int as n from public.hadith_embeddings",
  );
  const embCount = embRows[0]?.n ?? 0;
  if (embCount > 0 && !force) {
    throw new Error(
      `hadith_embeddings has ${embCount} rows; TRUNCATE … CASCADE would delete them.\n` +
        "Re-run with --force to proceed, then re-run `pnpm --filter @hadith/web ingest:embeddings`.",
    );
  }

  // One transaction for the whole reload: TRUNCATE + every INSERT commit or roll
  // back together. Without this, a failure partway (network blip, bad chunk,
  // killed process) would leave hadith_table truncated or half-loaded — atomicity
  // makes a failed reload a no-op instead of data loss.
  await client.query("begin");
  await client.query("truncate table public.hadith_table cascade");

  const t0 = Date.now();
  let total = 0;
  for (const [i, name] of files.entries()) {
    const sql = await readFile(join(SEED_DIR, name), "utf8");
    const res = await client.query(sql);
    total += res.rowCount ?? 0;
    const progress = i + 1;
    if (progress % 25 === 0 || progress === files.length) {
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      const pct = ((progress / files.length) * 100).toFixed(0);
      console.log(`  [${progress}/${files.length} ${pct}%] ${name} → ${total} rows, ${dt}s`);
    }
  }

  // Sanity check before committing: refuse to replace a full corpus with a stub
  // if a chunk was silently dropped.
  const { rows } = await client.query("select count(*)::int as n from public.hadith_table");
  const finalCount = rows[0]?.n ?? 0;
  if (finalCount < 1000) {
    throw new Error(`Only ${finalCount} rows loaded (expected thousands) — rolling back.`);
  }

  await client.query("commit");
  console.log(`\nDone. public.hadith_table count(*) = ${finalCount}`);
  if (embCount > 0) {
    console.log("NOTE: embeddings were cascade-deleted — re-run ingest:embeddings.");
  }
} catch (err) {
  console.error("Load failed — rolling back:", err instanceof Error ? err.message : err);
  try {
    await client.query("rollback");
  } catch {
    /* no open transaction */
  }
  process.exitCode = 1;
} finally {
  await client.end();
}
