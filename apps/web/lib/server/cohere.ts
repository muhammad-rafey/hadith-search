import "server-only";

import { CohereClient, CohereClientV2 } from "cohere-ai";

const EMBED_TIMEOUT_MS = Number(process.env.EMBED_TIMEOUT_MS ?? 1500);
const RERANK_TIMEOUT_MS = Number(process.env.RERANK_TIMEOUT_MS ?? 2000);
const EMBED_MODEL = "embed-v4.0";
const RERANK_MODEL = "rerank-v4.0-pro";
const EMBED_DIM = 1024;

// ── Embedding provider selection ────────────────────────────────────────────
// `cohere` (default) uses Cohere embed-v4.0. `bge-local` routes embeds to a
// local BGE-M3 server (scripts/bge_m3_server.py) — same 1024-dim space, so no
// DB migration is needed. The provider MUST match between ingest (documents)
// and search (query) or the vectors aren't comparable and recall collapses.
const EMBED_PROVIDER = (process.env.EMBED_PROVIDER ?? "cohere").toLowerCase();
const IS_BGE_LOCAL = EMBED_PROVIDER === "bge-local";
const BGE_EMBED_URL = process.env.BGE_EMBED_URL ?? "http://127.0.0.1:8000";
const BGE_MODEL_ID = "bge-m3";
// Local MPS inference: a warm query encode is tens of ms, but the first call
// and large ingest batches need real headroom — keep these generous.
const BGE_QUERY_TIMEOUT_MS = Number(process.env.BGE_QUERY_TIMEOUT_MS ?? 8000);
const BGE_DOC_TIMEOUT_MS = Number(process.env.BGE_DOC_TIMEOUT_MS ?? 120_000);
// Local reranker (bge-reranker-v2-m3) lives on the same server by default.
// Scoring a pool of ~60-80 (query, doc) pairs on MPS takes a couple of seconds
// from cold and well under a second warm — keep the timeout generous.
const BGE_RERANK_URL = process.env.BGE_RERANK_URL ?? BGE_EMBED_URL;
const BGE_RERANK_TIMEOUT_MS = Number(process.env.BGE_RERANK_TIMEOUT_MS ?? 20_000);

/** POST a batch of texts to the local BGE-M3 server and return the vectors. */
async function bgeEmbed(
  texts: string[],
  inputType: "document" | "query",
  timeoutMs: number,
): Promise<number[][]> {
  const abort = withAbortTimeout(timeoutMs);
  try {
    const res = await fetch(`${BGE_EMBED_URL}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texts, input_type: inputType }),
      signal: abort.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`bge-m3 server ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { embeddings?: number[][] };
    const vecs = data.embeddings;
    if (!vecs || vecs.length !== texts.length) {
      throw new Error(`bge-m3 returned ${vecs?.length ?? 0} vectors for ${texts.length} texts`);
    }
    return vecs;
  } finally {
    abort.clear();
  }
}

let cohereClient: CohereClient | undefined;
let cohereClientV2: CohereClientV2 | undefined;

function getClient(): CohereClient | null {
  const token = process.env.COHERE_API_KEY;
  if (!token) return null;
  if (!cohereClient) cohereClient = new CohereClient({ token });
  return cohereClient;
}

// Embeddings go through the v2 client because only the v2 embed endpoint honors
// `outputDimension`. The v1 client silently drops it and returns embed-v4.0's
// 1536-d default, which fails to cast into the halfvec(1024) column. Rerank
// stays on the v1 client (it has no such parameter).
function getClientV2(): CohereClientV2 | null {
  const token = process.env.COHERE_API_KEY;
  if (!token) return null;
  if (!cohereClientV2) cohereClientV2 = new CohereClientV2({ token });
  return cohereClientV2;
}

/**
 * Wire an AbortSignal into the SDK call so an in-flight request actually
 * stops on timeout (the previous Promise.race left the request running in
 * the background — fine for one-off testing, but on a stuck Cohere endpoint
 * this piles up zombie work and burns Vercel CPU seconds).
 */
function withAbortTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${ms}ms`)), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

/** Cohere v4 returns `{ embeddings: { float: number[][] } }`, older v3 returned
 *  `{ embeddings: number[][] }`. Handle both. */
function extractFirstEmbedding(res: unknown): number[] | undefined {
  const embeddings = (res as { embeddings?: number[][] | { float?: number[][] } }).embeddings;
  if (!embeddings) return undefined;
  if (Array.isArray(embeddings)) return embeddings[0];
  return embeddings.float?.[0];
}

function extractAllEmbeddings(res: unknown): number[][] | undefined {
  const embeddings = (res as { embeddings?: number[][] | { float?: number[][] } }).embeddings;
  if (!embeddings) return undefined;
  if (Array.isArray(embeddings)) return embeddings;
  return embeddings.float;
}

export type EmbedResult =
  | { embedding: number[]; degraded: false }
  | { embedding: number[]; degraded: true; reason: string };

/**
 * Embed a query string. Returns a 1024-d vector.
 *
 * Falls back to a deterministic stub (FNV-1a + xorshift32 PRNG, unit-normalized)
 * when Cohere is unavailable, returning a wrong vector but a wired DB call —
 * the FTS branch of the hybrid RPC still surfaces real results, with
 * `degraded: true` propagated to the client.
 */
export async function embedQuery(query: string): Promise<EmbedResult> {
  if (IS_BGE_LOCAL) {
    try {
      const vecs = await bgeEmbed([query], "query", BGE_QUERY_TIMEOUT_MS);
      const vec = vecs[0];
      if (!vec || vec.length !== EMBED_DIM) {
        return { embedding: stubEmbedding(query), degraded: true, reason: "bad_response" };
      }
      return { embedding: vec, degraded: false };
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 120) : "unknown";
      return { embedding: stubEmbedding(query), degraded: true, reason };
    }
  }
  const client = getClientV2();
  if (!client) {
    return { embedding: stubEmbedding(query), degraded: true, reason: "no_api_key" };
  }
  const abort = withAbortTimeout(EMBED_TIMEOUT_MS);
  try {
    // v2 embed endpoint — honors `outputDimension` so embed-v4.0 returns the
    // 1024-d vector the halfvec(1024) column expects (v1 ignores it → 1536-d).
    const res = await client.embed(
      {
        model: EMBED_MODEL,
        inputType: "search_query",
        texts: [query],
        embeddingTypes: ["float"],
        outputDimension: EMBED_DIM,
      },
      { abortSignal: abort.signal },
    );
    const vec = extractFirstEmbedding(res);
    if (!vec || vec.length !== EMBED_DIM) {
      // Dimension mismatch is a config bug — log loud so it gets noticed.
      console.warn(
        `[cohere] embedQuery wrong dim: got ${vec?.length}, expected ${EMBED_DIM}. Falling back.`,
      );
      return { embedding: stubEmbedding(query), degraded: true, reason: "bad_response" };
    }
    return { embedding: vec, degraded: false };
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 120) : "unknown";
    return { embedding: stubEmbedding(query), degraded: true, reason };
  } finally {
    abort.clear();
  }
}

/**
 * Embed a batch of documents for the ingest pipeline. Uses
 * inputType="search_document" — asymmetric mode pairs with "search_query"
 * at retrieval time and improves recall meaningfully.
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (IS_BGE_LOCAL) {
    const vecs = await bgeEmbed(texts, "document", BGE_DOC_TIMEOUT_MS);
    for (let i = 0; i < vecs.length; i++) {
      const v = vecs[i];
      if (!v || v.length !== EMBED_DIM) {
        throw new Error(
          `bge-m3 returned ${v?.length ?? 0}-d vector at idx ${i} (expected ${EMBED_DIM})`,
        );
      }
    }
    return vecs;
  }
  const client = getClientV2();
  if (!client) throw new Error("COHERE_API_KEY is required for embedDocuments");
  const res = await client.embed({
    model: EMBED_MODEL,
    inputType: "search_document",
    texts,
    embeddingTypes: ["float"],
    outputDimension: EMBED_DIM,
  });
  const vecs = extractAllEmbeddings(res);
  if (!vecs || vecs.length !== texts.length) {
    throw new Error(`Cohere embed returned ${vecs?.length ?? 0} vectors for ${texts.length} texts`);
  }
  // Dimension sanity check — wrong dim here would mean every upsert breaks
  // with a halfvec(1024) cast error downstream.
  for (let i = 0; i < vecs.length; i++) {
    const v = vecs[i];
    if (!v || v.length !== EMBED_DIM) {
      throw new Error(
        `Cohere returned ${v?.length ?? 0}-d vector at idx ${i} (expected ${EMBED_DIM})`,
      );
    }
  }
  return vecs;
}

export type RerankResult = {
  /** Indexes into the input array, best first. */
  indexes: number[];
  /** Normalized scores in [0, 1], aligned with `indexes`. */
  scores: number[];
  degraded: boolean;
};

/**
 * Rerank `documents` (prebuilt strings, aligned 1:1 with the caller's candidate
 * array) against `query` with a cross-encoder.
 *
 * Backend follows EMBED_PROVIDER: `bge-local` → the local bge-reranker-v2-m3
 * server; otherwise Cohere rerank-v4.0-pro. Both return calibrated [0, 1]
 * relevance scores, so the caller's threshold applies uniformly.
 *
 * On any failure (timeout, kill switch, no backend, empty result) returns the
 * identity ordering with `degraded: true` so the caller can fall back to RRF
 * order. Out-of-range indexes from the backend are filtered defensively and
 * counted in degraded.
 */
export async function rerankCandidates(
  query: string,
  documents: string[],
  topK: number,
): Promise<RerankResult> {
  if (process.env.RERANK_DISABLED === "true") {
    return identityRerank(documents.length, topK, true);
  }
  if (documents.length === 0) {
    return identityRerank(0, topK, false);
  }
  const topN = Math.min(topK, documents.length);
  const hits = IS_BGE_LOCAL
    ? await bgeRerank(query, documents, topN)
    : await cohereRerank(query, documents, topN);
  if (!hits) {
    return identityRerank(documents.length, topK, true);
  }
  const indexes: number[] = [];
  const scores: number[] = [];
  let dropped = 0;
  for (const h of hits) {
    if (typeof h.index !== "number" || h.index < 0 || h.index >= documents.length) {
      dropped++;
      continue;
    }
    indexes.push(h.index);
    scores.push(clamp01(h.score));
  }
  if (dropped > 0) {
    console.warn(`[rerank] dropped ${dropped} out-of-range index(es) from ${hits.length} results`);
  }
  if (indexes.length === 0) {
    return identityRerank(documents.length, topK, true);
  }
  return { indexes, scores, degraded: dropped > 0 };
}

type RerankHit = { index: number; score: number };

/** Cohere rerank-v4.0-pro. Returns null on any failure (caller falls back). */
async function cohereRerank(
  query: string,
  documents: string[],
  topN: number,
): Promise<RerankHit[] | null> {
  const client = getClient();
  if (!client) return null;
  const abort = withAbortTimeout(RERANK_TIMEOUT_MS);
  try {
    const res = await client.rerank(
      {
        model: RERANK_MODEL,
        query,
        documents: documents.map((d) => d.slice(0, 4000)),
        topN,
      },
      { abortSignal: abort.signal },
    );
    const results = res.results ?? [];
    if (results.length === 0) return null;
    return results.map((r) => ({ index: r.index, score: r.relevanceScore ?? 0 }));
  } catch {
    return null;
  } finally {
    abort.clear();
  }
}

/** Local bge-reranker-v2-m3 server. Returns null on any failure. */
async function bgeRerank(
  query: string,
  documents: string[],
  topN: number,
): Promise<RerankHit[] | null> {
  const abort = withAbortTimeout(BGE_RERANK_TIMEOUT_MS);
  try {
    const res = await fetch(`${BGE_RERANK_URL}/rerank`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        documents: documents.map((d) => d.slice(0, 4000)),
        top_n: topN,
      }),
      signal: abort.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[rerank] bge-reranker ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as {
      results?: { index: number; relevance_score: number }[];
    };
    const results = data.results ?? [];
    if (results.length === 0) return null;
    return results.map((r) => ({ index: r.index, score: r.relevance_score }));
  } catch (err) {
    console.warn(`[rerank] bge-reranker failed: ${err instanceof Error ? err.message : err}`);
    return null;
  } finally {
    abort.clear();
  }
}

function identityRerank(n: number, topK: number, degraded: boolean): RerankResult {
  const len = Math.min(n, topK);
  return {
    indexes: Array.from({ length: len }, (_, i) => i),
    scores: Array.from({ length: len }, (_, i) => 1 - i / Math.max(len, 1)),
    degraded,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ── Stub embedding (used when Cohere is unavailable) ────────────────────────

function stubEmbedding(seed: string): number[] {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let state = h >>> 0;
  const xs32 = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  const v = new Array<number>(EMBED_DIM);
  let sum = 0;
  for (let i = 0; i < EMBED_DIM; i++) {
    const r = xs32() * 2 - 1;
    v[i] = r;
    sum += r * r;
  }
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < EMBED_DIM; i++) v[i] = (v[i] ?? 0) / norm;
  return v;
}

export const COHERE_EMBED_DIM = EMBED_DIM;
export const COHERE_EMBED_MODEL = EMBED_MODEL;
/** The model id actually in use, given EMBED_PROVIDER. Stored in
 *  `hadith_embeddings.model` and folded into the ingest text_hash so a
 *  provider swap forces a full re-embed. */
export const ACTIVE_EMBED_MODEL = IS_BGE_LOCAL ? BGE_MODEL_ID : EMBED_MODEL;
export const EMBED_PROVIDER_ID = EMBED_PROVIDER;
export const COHERE_AVAILABLE = (): boolean => Boolean(process.env.COHERE_API_KEY);

/** Encode a number[] as the Postgres halfvec/vector wire format ("[a,b,c,...]"). */
export function toPgVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
