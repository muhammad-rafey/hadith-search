import "server-only";

import { CohereClient } from "cohere-ai";

const EMBED_TIMEOUT_MS = Number(process.env.EMBED_TIMEOUT_MS ?? 1500);
const RERANK_TIMEOUT_MS = Number(process.env.RERANK_TIMEOUT_MS ?? 2000);
const EMBED_MODEL = "embed-v4.0";
const RERANK_MODEL = "rerank-v4.0-pro";
const EMBED_DIM = 1024;

let cohereClient: CohereClient | undefined;

function getClient(): CohereClient | null {
  const token = process.env.COHERE_API_KEY;
  if (!token) return null;
  if (!cohereClient) cohereClient = new CohereClient({ token });
  return cohereClient;
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
  const embeddings = (res as { embeddings?: number[][] | { float?: number[][] } })
    .embeddings;
  if (!embeddings) return undefined;
  if (Array.isArray(embeddings)) return embeddings[0];
  return embeddings.float?.[0];
}

function extractAllEmbeddings(res: unknown): number[][] | undefined {
  const embeddings = (res as { embeddings?: number[][] | { float?: number[][] } })
    .embeddings;
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
  const client = getClient();
  if (!client) {
    return { embedding: stubEmbedding(query), degraded: true, reason: "no_api_key" };
  }
  const abort = withAbortTimeout(EMBED_TIMEOUT_MS);
  try {
    // `outputDimension` is accepted by the Cohere API for embed-v4 but is
    // missing from cohere-ai@7.17.1's EmbedRequest type — assert through.
    const res = await client.embed(
      {
        model: EMBED_MODEL,
        inputType: "search_query",
        texts: [query],
        embeddingTypes: ["float"],
        outputDimension: EMBED_DIM,
      } as Parameters<typeof client.embed>[0] & { outputDimension: number },
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
  const client = getClient();
  if (!client) throw new Error("COHERE_API_KEY is required for embedDocuments");
  const res = await client.embed({
    model: EMBED_MODEL,
    inputType: "search_document",
    texts,
    embeddingTypes: ["float"],
    outputDimension: EMBED_DIM,
  } as Parameters<typeof client.embed>[0] & { outputDimension: number });
  const vecs = extractAllEmbeddings(res);
  if (!vecs || vecs.length !== texts.length) {
    throw new Error(
      `Cohere embed returned ${vecs?.length ?? 0} vectors for ${texts.length} texts`,
    );
  }
  // Dimension sanity check — wrong dim here would mean every upsert breaks
  // with a halfvec(1024) cast error downstream.
  for (let i = 0; i < vecs.length; i++) {
    const v = vecs[i];
    if (!v || v.length !== EMBED_DIM) {
      throw new Error(`Cohere returned ${v?.length ?? 0}-d vector at idx ${i} (expected ${EMBED_DIM})`);
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
 * Rerank candidates with Cohere rerank-v4.0-pro.
 *
 * On any failure (timeout, kill switch, no API key, empty result) returns the
 * identity ordering with `degraded: true` so the caller can fall back to RRF
 * order. Out-of-range indexes from Cohere are filtered defensively and
 * counted in degraded.
 */
export async function rerankCandidates(
  canonicalQuery: string,
  candidates: { text_en_full: string }[],
  topK: number,
): Promise<RerankResult> {
  if (process.env.RERANK_DISABLED === "true") {
    return identityRerank(candidates.length, topK, true);
  }
  const client = getClient();
  if (!client || candidates.length === 0) {
    return identityRerank(candidates.length, topK, !client);
  }
  const abort = withAbortTimeout(RERANK_TIMEOUT_MS);
  try {
    const res = await client.rerank(
      {
        model: RERANK_MODEL,
        query: canonicalQuery,
        documents: candidates.map((c) => c.text_en_full.slice(0, 4000)),
        topN: Math.min(topK, candidates.length),
      },
      { abortSignal: abort.signal },
    );
    const results = res.results ?? [];
    if (results.length === 0) {
      return identityRerank(candidates.length, topK, true);
    }
    const indexes: number[] = [];
    const scores: number[] = [];
    let dropped = 0;
    for (const r of results) {
      if (typeof r.index !== "number" || r.index < 0 || r.index >= candidates.length) {
        dropped++;
        continue;
      }
      indexes.push(r.index);
      scores.push(clamp01(r.relevanceScore ?? 0));
    }
    if (dropped > 0) {
      console.warn(`[cohere] rerank dropped ${dropped} out-of-range index(es) from ${results.length} results`);
    }
    if (indexes.length === 0) {
      return identityRerank(candidates.length, topK, true);
    }
    return { indexes, scores, degraded: dropped > 0 };
  } catch {
    return identityRerank(candidates.length, topK, true);
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
export const COHERE_AVAILABLE = (): boolean => Boolean(process.env.COHERE_API_KEY);

/** Encode a number[] as the Postgres halfvec/vector wire format ("[a,b,c,...]"). */
export function toPgVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
