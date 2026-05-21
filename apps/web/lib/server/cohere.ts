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

/** Reject after `ms` if `p` hasn't settled. The request continues in the
 *  background but the caller proceeds. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
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
  try {
    // `outputDimension` is accepted by the Cohere API for embed-v4 but is
    // missing from cohere-ai@7.17.1's EmbedRequest type — assert through.
    const res = await withTimeout(
      client.embed({
        model: EMBED_MODEL,
        inputType: "search_query",
        texts: [query],
        embeddingTypes: ["float"],
        outputDimension: EMBED_DIM,
      } as Parameters<typeof client.embed>[0] & { outputDimension: number }),
      EMBED_TIMEOUT_MS,
      "embedQuery",
    );
    const vec = extractFirstEmbedding(res);
    if (!vec || vec.length !== EMBED_DIM) {
      return { embedding: stubEmbedding(query), degraded: true, reason: "bad_response" };
    }
    return { embedding: vec, degraded: false };
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 120) : "unknown";
    return { embedding: stubEmbedding(query), degraded: true, reason };
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
 * order.
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
  try {
    const res = await withTimeout(
      client.rerank({
        model: RERANK_MODEL,
        query: canonicalQuery,
        documents: candidates.map((c) => c.text_en_full.slice(0, 4000)),
        topN: Math.min(topK, candidates.length),
      }),
      RERANK_TIMEOUT_MS,
      "rerank",
    );
    const results = res.results ?? [];
    if (results.length === 0) {
      return identityRerank(candidates.length, topK, true);
    }
    return {
      indexes: results.map((r) => r.index),
      scores: results.map((r) => clamp01(r.relevanceScore ?? 0)),
      degraded: false,
    };
  } catch {
    return identityRerank(candidates.length, topK, true);
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

/** Encode a number[] as the Postgres halfvec/vector wire format ("[a,b,c,...]"). */
export function toPgVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
