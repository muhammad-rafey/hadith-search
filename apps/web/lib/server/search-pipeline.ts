import "server-only";

import {
  type BukhariRpcRow,
  BukhariRpcRowSchema,
  mapRowToSearchResult,
  parseBukhariId,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
} from "@hadith/shared-types";

import { embedQuery, rerankCandidates, toPgVectorLiteral } from "./cohere";
import { canonicalKey, sha256Hex } from "./hash";
import { TtlLru } from "./lru-cache";
import { parseReference, type Reference } from "./reference-parser";
import { getSupabaseAdmin } from "./supabase-admin";

const CACHE_TTL_DAYS = Number(process.env.CACHE_TTL_DAYS ?? 7);

const lru = new TtlLru<string, SearchResponse>();

/**
 * Pipeline entry point.
 *
 * Stages:
 *   1. Preprocess (canonicalize, hash, detect language).
 *   2. Reference shortcut (return early on hit).
 *   3. In-memory LRU check.
 *   4. Postgres query_cache check.
 *   5. Cohere embed.
 *   6. search_bukhari_hybrid RPC.
 *   7. Cohere rerank.
 *   8. Map rows, log + cache writes (fire-and-forget).
 */
export async function runSearch(
  req: SearchRequest,
  userId: string | null,
): Promise<SearchResponse> {
  const start = Date.now();
  const language = req.language ?? "en";
  const queryLength = req.query.length;
  const canonical = canonicalKey({
    language,
    book: req.book ?? null,
    narrator: req.narrator ?? null,
    query: req.query,
  });
  const query_hash = sha256Hex(canonical);
  const supabase = getSupabaseAdmin();

  // Stage 2: Reference shortcut. Skips cache (cheap path, no rerank).
  const ref = parseReference(req.query);
  if (ref) {
    const refResult = await resolveReference(supabase, ref);
    if (refResult) {
      const response: SearchResponse = {
        results: [refResult],
        mode: "reference",
        latency_ms: Date.now() - start,
      };
      void logSearch(supabase, {
        user_id: userId,
        query_hash,
        query_length: queryLength,
        mode: "reference",
        language,
        result_count: 1,
        has_filter: false,
        latency_ms: response.latency_ms,
        degraded: false,
      });
      return response;
    }
  }

  // Stage 3+4: cache lookups.
  if (!req.skip_cache) {
    const local = lru.get(query_hash);
    if (local) {
      const response: SearchResponse = { ...local, mode: "cache", latency_ms: Date.now() - start };
      void logSearch(supabase, {
        user_id: userId,
        query_hash,
        query_length: queryLength,
        mode: "cache",
        language,
        result_count: response.results.length,
        has_filter: Boolean(req.book || req.narrator),
        latency_ms: response.latency_ms,
        degraded: response.degraded ?? false,
      });
      return response;
    }
    const cached = await readQueryCache(supabase, query_hash);
    if (cached) {
      lru.set(query_hash, cached);
      const response: SearchResponse = {
        ...cached,
        mode: "cache",
        latency_ms: Date.now() - start,
      };
      void logSearch(supabase, {
        user_id: userId,
        query_hash,
        query_length: queryLength,
        mode: "cache",
        language,
        result_count: response.results.length,
        has_filter: Boolean(req.book || req.narrator),
        latency_ms: response.latency_ms,
        degraded: response.degraded ?? false,
      });
      return response;
    }
  }

  // Stage 5: Cohere embed (raw query — gets best semantic signal).
  const embed = await embedQuery(req.query);

  // Stage 6: hybrid RPC.
  const { data, error } = await supabase.rpc("search_bukhari_hybrid", {
    query_text: canonical,
    query_embedding: toPgVectorLiteral(embed.embedding),
    match_count: 30,
    rrf_k: 50,
    book_filter: req.book ?? null,
    narrator_filter: req.narrator ?? null,
    ts_config: "english",
  });
  if (error) {
    throw new Error(`search_bukhari_hybrid failed: ${error.message}`);
  }
  const rawRows = (data ?? []) as unknown[];
  if (rawRows.length === 0) {
    const response: SearchResponse = {
      results: [],
      mode: "empty",
      latency_ms: Date.now() - start,
      ...(embed.degraded ? { degraded: true } : {}),
    };
    void logSearch(supabase, {
      user_id: userId,
      query_hash,
      query_length: queryLength,
      mode: "empty",
      language,
      result_count: 0,
      has_filter: Boolean(req.book || req.narrator),
      latency_ms: response.latency_ms,
      degraded: embed.degraded,
    });
    return response;
  }

  // Validate the RPC payload at the trust boundary.
  const rows: BukhariRpcRow[] = [];
  for (const row of rawRows) {
    const parsed = BukhariRpcRowSchema.safeParse(row);
    if (parsed.success) rows.push(parsed.data);
  }

  // Map to SearchResult, then rerank by canonical query (privacy: never pass raw to rerank).
  const candidates = rows.map(mapRowToSearchResult);
  const rr = await rerankCandidates(canonical, candidates, req.topK ?? 10);
  const results: SearchResult[] = rr.indexes
    .map((i, j) => {
      const c = candidates[i];
      if (!c) return null;
      const score = rr.scores[j];
      return typeof score === "number" ? { ...c, relevance: score } : c;
    })
    .filter((r): r is SearchResult => r !== null);

  const degraded = embed.degraded || rr.degraded;
  const response: SearchResponse = {
    results,
    mode: "fresh",
    latency_ms: Date.now() - start,
    ...(degraded ? { degraded: true } : {}),
  };

  // Stage 8: fire-and-forget cache + log writes. Never block the response.
  if (!req.skip_cache) {
    lru.set(query_hash, response);
    void writeQueryCache(supabase, query_hash, response);
  }
  void logSearch(supabase, {
    user_id: userId,
    query_hash,
    query_length: queryLength,
    mode: "fresh",
    language,
    result_count: response.results.length,
    has_filter: Boolean(req.book || req.narrator),
    latency_ms: response.latency_ms,
    degraded,
  });

  return response;
}

// ── Reference shortcut resolver ─────────────────────────────────────────────

async function resolveReference(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ref: Reference,
): Promise<SearchResult | null> {
  if (ref.kind === "by_book_and_seq") {
    const { data, error } = await supabase
      .rpc("get_bukhari_book_hadiths", { p_book: ref.book, p_limit: 500, p_offset: 0 });
    if (error || !data) return null;
    const rows = (data as unknown[])
      .map((r) => BukhariRpcRowSchema.safeParse(r))
      .filter((p): p is { success: true; data: BukhariRpcRow } => p.success)
      .map((p) => p.data);
    const row = rows.find((r) => r.our_hadith_number === ref.seq);
    return row ? mapRowToSearchResult(row) : null;
  }
  // by_urn_or_number — try URN first when the value is large enough; else
  // hadithNumber. Fall through both if needed.
  if (ref.value >= 10000) {
    const byUrn = await lookupBy(supabase, "get_bukhari_hadith_by_urn", { p_urn: ref.value });
    if (byUrn) return byUrn;
  }
  const byNumber = await lookupBy(supabase, "get_bukhari_hadith_by_number", { p_n: ref.value });
  if (byNumber) return byNumber;
  if (ref.value < 10000) {
    return lookupBy(supabase, "get_bukhari_hadith_by_urn", { p_urn: ref.value });
  }
  return null;
}

async function lookupBy(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rpc: "get_bukhari_hadith_by_urn" | "get_bukhari_hadith_by_number",
  args: Record<string, unknown>,
): Promise<SearchResult | null> {
  const { data, error } = await supabase.rpc(rpc, args);
  if (error || !data) return null;
  const rows = data as unknown[];
  const first = rows[0];
  if (!first) return null;
  const parsed = BukhariRpcRowSchema.safeParse(first);
  return parsed.success ? mapRowToSearchResult(parsed.data) : null;
}

// ── Cache + log helpers ─────────────────────────────────────────────────────

async function readQueryCache(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  query_hash: string,
): Promise<SearchResponse | null> {
  const { data, error } = await supabase
    .from("query_cache")
    .select("results, expires_at")
    .eq("query_hash", query_hash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return data.results as SearchResponse;
}

async function writeQueryCache(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  query_hash: string,
  response: SearchResponse,
): Promise<void> {
  const expires_at = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // Drop latency_ms from cached body — it'll be replaced on read.
  const { latency_ms: _ignored, ...body } = response;
  void _ignored;
  const { error } = await supabase
    .from("query_cache")
    .upsert({ query_hash, results: body, expires_at }, { onConflict: "query_hash" });
  if (error) {
    console.error("query_cache upsert failed:", error.message.slice(0, 200));
  }
}

type SearchLogRow = {
  user_id: string | null;
  query_hash: string;
  query_length: number;
  mode: SearchResponse["mode"];
  language: string;
  result_count: number;
  has_filter: boolean;
  latency_ms: number;
  degraded: boolean;
};

async function logSearch(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  row: SearchLogRow,
): Promise<void> {
  const { error } = await supabase.from("search_logs").insert(row);
  if (error) {
    console.error("search_logs insert failed:", error.message.slice(0, 200));
  }
}

/** Exported for the bookmark page bulk lookup. */
export function parseBukhariIdsBulk(ids: string[]): number[] {
  return ids
    .map(parseBukhariId)
    .filter((n): n is number => typeof n === "number");
}
