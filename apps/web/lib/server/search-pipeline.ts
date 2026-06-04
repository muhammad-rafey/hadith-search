import "server-only";

import {
  type BukhariRpcRow,
  BukhariRpcRowSchema,
  HadithRowSchema,
  mapRowToSearchResult,
  mapSearchRow,
  type SearchRequest,
  type SearchResponse,
  SearchResponseSchema,
  type SearchResult,
} from "@hadith/shared-types";

import {
  ACTIVE_EMBED_MODEL,
  EMBED_PROVIDER_ID,
  embedQuery,
  rerankCandidates,
  toPgVectorLiteral,
} from "./cohere";
import { numEnv } from "./env";
import { canonicalKey, normalizeQuery, sha256Hex } from "./hash";
import { TtlLru } from "./lru-cache";
import { parseReference, type Reference } from "./reference-parser";
import { getSupabaseAdmin } from "./supabase-admin";

const CACHE_TTL_DAYS = numEnv("CACHE_TTL_DAYS", 7, { min: 0 });

// Hybrid retrieval pool size. We over-fetch a wide candidate set (FTS + vector,
// fused by RRF) and let the cross-encoder reranker pick the true top results
// from it — a bigger pool gives the reranker more chances to surface a relevant
// hadith that either single leg ranked low. Capped by the RPC. Tuned down from
// the cap because each candidate is a cross-encoder pass: ~40 docs reranks in
// ~4-5s on local MPS, and a smaller vector fetch also keeps the cold-start RPC
// (first query loads the HNSW index) under Postgres's statement timeout. Raise
// it when the reranker runs on a GPU or via Cohere.
const RETRIEVE_COUNT = numEnv("RETRIEVE_COUNT", 40, { min: 1, max: 100, int: true });

// Minimum reranker relevance for a result to be shown — the lever that cuts the
// off-topic tail (kNN/RRF always return SOME rows; below this score they're
// noise). Calibrated to bge-reranker-v2-m3, whose scores are compressed low:
// genuine matches land ~0.02–0.9 while unrelated docs score ~0.0000, so the
// floor sits just above the noise floor, NOT at a Cohere-style 0.3. Only applied
// when the reranker actually ran (never in degraded mode, where scores are
// synthetic RRF-order placeholders). Tune via MIN_RELEVANCE.
const MIN_RELEVANCE = numEnv("MIN_RELEVANCE", 0.02, { min: 0, max: 1 });

const lru = new TtlLru<string, SearchResponse>();

// Verified once per isolate. The vector leg compares the query embedding against
// the corpus embeddings, which is only meaningful if BOTH were produced by the
// same model. A provider mismatch (e.g. corpus embedded with bge-m3 but
// EMBED_PROVIDER=cohere at query time) does NOT raise a dimension error — both
// are 1024-d — so it silently collapses vector recall. We can't fix it at
// request time, but we surface it loudly and mark the response degraded so the
// failure is observable instead of silent. Returns true ("treat as ok") on any
// uncertainty so the guard can never break search.
let providerCheck: Promise<boolean> | undefined;
function verifyEmbeddingProvider(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<boolean> {
  if (!providerCheck) {
    providerCheck = (async () => {
      const { data, error } = await supabase
        .from("hadith_embeddings")
        .select("model")
        .limit(1)
        .maybeSingle();
      const stored = (data as { model?: string } | null)?.model;
      if (error || !stored) return true; // empty corpus / can't read → don't cry wolf
      if (stored !== ACTIVE_EMBED_MODEL) {
        console.error(
          `[search] EMBED PROVIDER MISMATCH: corpus embedded with "${stored}" but queries embed with "${ACTIVE_EMBED_MODEL}" (EMBED_PROVIDER=${EMBED_PROVIDER_ID}). Vector recall is unreliable until the corpus is re-embedded with the active provider.`,
        );
        return false;
      }
      return true;
    })().catch(() => true);
  }
  return providerCheck;
}

/**
 * Pipeline entry point.
 *
 * Stages:
 *   1. Preprocess (canonicalize, hash, detect language).
 *   2. Reference shortcut (return early on hit).
 *   3. In-memory LRU check.
 *   4. Postgres query_cache check.
 *   5. Embed (Cohere embed-v4.0 or local BGE-M3, per EMBED_PROVIDER).
 *   6. search_bukhari_hybrid RPC (FTS + vector, RRF-fused).
 *   7. Cross-encoder rerank (Cohere rerank-v4.0-pro or local bge-reranker-v2-m3),
 *      then a MIN_RELEVANCE cutoff to drop the off-topic tail.
 *   8. Map rows, log + cache writes (fire-and-forget).
 *
 * Degraded results (embed or rerank fell back) are NEVER cached — not in the
 * persistent query_cache and not in the per-isolate LRU — so a transient
 * provider failure self-heals on the next request instead of memoizing a bad
 * (empty or RRF-order) result for every later query until the entry expires.
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
    query: req.query,
  });
  const query_hash = sha256Hex(canonical);
  // The clean, normalized query — what the FTS leg and the reranker actually
  // search. NOT `canonical`, which is the `lang|book|narrator|`-prefixed cache
  // key; feeding that to websearch_to_tsquery ANDs in junk tokens and matches
  // nothing.
  const queryText = normalizeQuery(req.query);
  const useCache = !req.skip_cache;
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
      fireAndForgetLog(supabase, {
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
  if (useCache) {
    const local = lru.get(query_hash);
    if (local) {
      const response: SearchResponse = { ...local, mode: "cache", latency_ms: Date.now() - start };
      fireAndForgetLog(supabase, {
        user_id: userId,
        query_hash,
        query_length: queryLength,
        mode: "cache",
        language,
        result_count: response.results.length,
        has_filter: false,
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
      fireAndForgetLog(supabase, {
        user_id: userId,
        query_hash,
        query_length: queryLength,
        mode: "cache",
        language,
        result_count: response.results.length,
        has_filter: false,
        latency_ms: response.latency_ms,
        degraded: response.degraded ?? false,
      });
      return response;
    }
  }

  // Stage 5: embed (raw query — gets best semantic signal). Per EMBED_PROVIDER:
  // Cohere embed-v4.0 or the local BGE-M3 server.
  const embed = await embedQuery(req.query);
  // Guard against a silent vector-recall collapse when the query-time provider
  // doesn't match the model the corpus was embedded with (cached per isolate).
  const providerOk = await verifyEmbeddingProvider(supabase);

  // Stage 6: hybrid RPC. Always runs both legs — the FTS/keyword leg (grounds
  // results in the literal terms the user typed) and the vector leg (semantic
  // similarity), fused by RRF. Over-fetch RETRIEVE_COUNT candidates to feed the
  // reranker a wide pool.
  const { data, error } = await supabase.rpc("search_bukhari_hybrid", {
    query_text: queryText,
    query_embedding: toPgVectorLiteral(embed.embedding),
    match_count: RETRIEVE_COUNT,
    rrf_k: 50,
    book_filter: null,
    narrator_filter: null,
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
    fireAndForgetLog(supabase, {
      user_id: userId,
      query_hash,
      query_length: queryLength,
      mode: "empty",
      language,
      result_count: 0,
      has_filter: false,
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

  // Map to SearchResult, then rerank by the normalized query — not the raw input,
  // and not `canonical` (the lang|book|narrator-prefixed cache key). The reranked
  // document includes the chapter (bab) name and narrator, not just the body,
  // giving the cross-encoder more signal to judge relevance (same fields the
  // ingest passage embeds).
  const candidates = rows.map(mapRowToSearchResult);
  const rerankDocs = candidates.map(rerankDocFor);
  const rr = await rerankCandidates(queryText, rerankDocs, req.topK ?? 10);
  const results: SearchResult[] = [];
  for (let j = 0; j < rr.indexes.length; j++) {
    const idx = rr.indexes[j];
    if (typeof idx !== "number") continue;
    const c = candidates[idx];
    if (!c) continue;
    const score = rr.scores[j];
    // Drop the off-topic tail by reranker score. Skip the cutoff when degraded
    // (scores are synthetic RRF-order placeholders, not real relevance) so a
    // reranker outage falls back to "show RRF order" rather than "show nothing".
    if (!rr.degraded && typeof score === "number" && score < MIN_RELEVANCE) continue;
    results.push(typeof score === "number" ? { ...c, relevance: score } : c);
  }

  // `providerOk === false` means the vector leg compared mismatched embedding
  // spaces — mark degraded so the result isn't cached and the client can show
  // the degraded state. The reranker scores (cross-encoder, embedding-agnostic)
  // are still valid, so the MIN_RELEVANCE floor above stays in effect.
  const degraded = embed.degraded || rr.degraded || !providerOk;
  const response: SearchResponse = {
    results,
    mode: "fresh",
    latency_ms: Date.now() - start,
    ...(degraded ? { degraded: true } : {}),
  };

  // Stage 8: fire-and-forget cache + log writes. Never block the response.
  // Skip ALL caching (LRU + persistent) when degraded — a transient embed/rerank
  // failure must not be memoized, or a one-off timeout would serve its empty or
  // RRF-order result to every later request until the entry expires. Letting
  // degraded responses fall through means the next request re-runs and self-heals.
  if (useCache && !degraded) {
    lru.set(query_hash, response);
    // Never persist an empty result for CACHE_TTL_DAYS. If every candidate fell
    // below MIN_RELEVANCE (or the floor is mis-tuned), a 7-day cached "no
    // matches" would be hard to notice or recover from. The 5-min LRU above
    // still absorbs bursts; only non-empty results reach the durable cache.
    if (results.length > 0) {
      void writeQueryCache(supabase, query_hash, response).catch((e) => {
        console.error("query_cache write failed:", e instanceof Error ? e.message : e);
      });
    }
  }
  fireAndForgetLog(supabase, {
    user_id: userId,
    query_hash,
    query_length: queryLength,
    mode: "fresh",
    language,
    result_count: response.results.length,
    has_filter: false,
    latency_ms: response.latency_ms,
    degraded,
  });

  return response;
}

/**
 * Build the text handed to the reranker for one candidate: chapter (bab) name,
 * narrator, then the body — the same salient fields the ingest passage embeds
 * (ingest additionally prefixes a "Book N" label and joins with " | "), so the
 * cross-encoder judges on essentially the same signal the vector leg saw.
 */
function rerankDocFor(c: SearchResult): string {
  const parts: string[] = [];
  if (c.chapter_title_en) parts.push(c.chapter_title_en);
  if (c.narrator) parts.push(`Narrated ${c.narrator}`);
  parts.push(c.text_en_full);
  return parts.join(". ");
}

// ── Reference shortcut resolver ─────────────────────────────────────────────

async function resolveReference(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ref: Reference,
): Promise<SearchResult | null> {
  if (ref.kind === "by_book_and_seq") {
    // bukhari-only (book+seq is unambiguous only for integer book numbers).
    const { data, error } = await supabase.rpc("get_bukhari_hadith_by_book_seq", {
      p_book: ref.book,
      p_seq: ref.seq,
    });
    if (error || !data) return null;
    const first = (data as unknown[])[0];
    if (!first) return null;
    const parsed = BukhariRpcRowSchema.safeParse(first);
    return parsed.success ? mapRowToSearchResult(parsed.data) : null;
  }
  // by_number — match the canonical hadithNumber for the collection. If that
  // misses and the value is all-digits, fall back to a URN lookup (covers a
  // permalink-style "{collection}:{urn}" pasted into the search box).
  const byNumber = await resolveGeneric(supabase, "get_hadith_by_collection_number", {
    p_collection: ref.collection,
    p_number: ref.value,
  });
  if (byNumber) return byNumber;
  if (/^\d+$/.test(ref.value)) {
    const urn = Number.parseInt(ref.value, 10);
    // Cap at int4 max — a larger value can't be a real URN and would overflow
    // the p_urn int parameter (Postgres 22003).
    if (Number.isFinite(urn) && urn <= 2_147_483_647) {
      return resolveGeneric(supabase, "get_hadith_by_collection_urn", {
        p_collection: ref.collection,
        p_urn: urn,
      });
    }
  }
  return null;
}

async function resolveGeneric(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rpc: "get_hadith_by_collection_number" | "get_hadith_by_collection_urn",
  args: Record<string, unknown>,
): Promise<SearchResult | null> {
  const { data, error } = await supabase.rpc(rpc, args);
  if (error || !data) return null;
  const first = (data as unknown[])[0];
  if (!first) return null;
  const parsed = HadithRowSchema.safeParse(first);
  return parsed.success ? mapSearchRow(parsed.data) : null;
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
  // Validate stored body — if someone manually edits the cache row or the
  // schema drifts, treat it as a cache miss rather than returning garbage.
  const parsed = SearchResponseSchema.safeParse({
    ...(data.results as Record<string, unknown>),
    latency_ms: 0, // placeholder; overwritten by caller
  });
  return parsed.success ? parsed.data : null;
}

async function writeQueryCache(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  query_hash: string,
  response: SearchResponse,
): Promise<void> {
  const expires_at = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // Drop latency_ms from cached body — it'll be replaced on read.
  const { latency_ms, ...body } = response;
  void latency_ms;
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

function fireAndForgetLog(supabase: ReturnType<typeof getSupabaseAdmin>, row: SearchLogRow): void {
  // Always handle the rejection — Node's default mode warns on unhandled
  // rejections; strict mode would crash the worker.
  void logSearch(supabase, row).catch((e) => {
    console.error("search_logs insert failed:", e instanceof Error ? e.message : e);
  });
}

async function logSearch(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  row: SearchLogRow,
): Promise<void> {
  const { error } = await supabase.from("search_logs").insert(row);
  if (error) {
    console.error("search_logs insert failed:", error.message.slice(0, 200));
  }
}
