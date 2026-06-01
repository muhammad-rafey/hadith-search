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
    "DATABASE_URL is not set.\n" +
      "Run with: node --env-file=.env scripts/load_chunks.mjs",
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  const files = (await readdir(SEED_DIR)).filter((f) => f.endsWith(".sql")).sort();
  console.log(`Loading ${files.length} chunk(s) from ${SEED_DIR}`);

  // Idempotency: wipe before reload.
  await client.query("truncate table public.hadith_table");

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

  const { rows } = await client.query("select count(*)::int as n from public.hadith_table");
  console.log(`\nDone. public.hadith_table count(*) = ${rows[0].n}`);
} catch (err) {
  console.error("Load failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
