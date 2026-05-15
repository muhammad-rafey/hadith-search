// =============================================================================
// supabase/functions/search/index.ts — hadith hybrid-search Edge Function
// =============================================================================
//
// Implements the pipeline described in plan/01-search-api.md:
//   1. Preprocess        (reference shortcut, narrator detect, language detect,
//                         query canonicalization)
//   2. Cache check       (Postgres `query_cache` keyed by SHA-256 of canonical)
//   3. Embed             (Cohere embed-v4.0, 1024-dim float)
//   4. Hybrid retrieve   (search_hadiths RPC: pgvector ⊕ tsvector via RRF)
//   5. Rerank            (Cohere rerank-v4.0-pro, top-N)
//   6. Cache write + log (fire-and-forget; never logs raw query, only hash)
//
// Privacy: raw query text NEVER leaves this function for analytics. The hash
// is what goes into search_logs / cache key / future PostHog events.
//
// Local dev mode: when `COHERE_API_KEY` is empty (placeholder env), the
// function skips embedding + reranking and falls back to the same deterministic
// stub embedding used in seed.sql so the RPC still runs end-to-end. Response
// is marked `degraded: true`.
//
// Cross-workspace TS imports don't work cleanly in Deno (the shared-types
// package lives outside the function dir and uses tsconfig path mapping that
// Deno doesn't honor), so we inline the request schema below. Keep in sync
// with `SearchRequestSchema` in `packages/shared-types/src/index.ts`.
//
// =============================================================================

import { CohereClient } from "cohere-ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const COHERE_API_KEY = Deno.env.get("COHERE_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RERANK_DISABLED = (Deno.env.get("RERANK_DISABLED") ?? "false").toLowerCase() === "true";

const HAS_COHERE = COHERE_API_KEY.length > 0;
const CACHE_TTL_DAYS = 7;
const EMBED_DIM = 1024;
const RPC_MATCH_COUNT = 30;

// -----------------------------------------------------------------------------
// Inline schema — mirrors SearchRequestSchema in shared-types
// -----------------------------------------------------------------------------

const LanguageSchema = z.enum(["en", "ar", "ur"]);
type Language = z.infer<typeof LanguageSchema>;

const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  book: z.number().int().positive().optional(),
  narrator: z.string().min(1).max(100).optional(),
  language: LanguageSchema.default("en"),
  topK: z.number().int().min(1).max(20).default(10),
});

type SearchResult = {
  id: string;
  hadith_number: number;
  book_number: number;
  book_name_en: string;
  chapter_title_en: string | null;
  in_book_ref: string;
  usc_msa_ref: string | null;
  narrator: string | null;
  text_en_full: string;
  text_ar: string | null;
  relevance?: number;
};

type RpcCandidate = SearchResult & { score: number };

type SearchMode = "reference" | "cache" | "fresh" | "empty";

type SearchResponse = {
  results: SearchResult[];
  mode: SearchMode;
  latency_ms: number;
  degraded?: boolean;
};

// -----------------------------------------------------------------------------
// Clients
// -----------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cohere = HAS_COHERE ? new CohereClient({ token: COHERE_API_KEY }) : null;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// Arabic block: U+0600..U+06FF
const ARABIC_RE = /[؀-ۿ]/;
// Urdu-specific Unicode supplements: U+0750..U+077F, U+FB50..U+FDFF, U+FE70..U+FEFF.
// Heuristic only — Urdu shares the Arabic block, so we treat the
// supplement-block hits as a stronger Urdu signal.
const URDU_RE = /[ݐ-ݿﭐ-﷿ﹰ-﻿]/;

/** Canonicalize: lowercase, trim, collapse whitespace, strip trailing punctuation. */
function canonicalize(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\s\p{P}]+$/u, "");
}

/** SHA-256 hex of a UTF-8 string. */
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Best-effort language detection. */
function detectLanguage(q: string, fallback: Language): Language {
  if (URDU_RE.test(q)) return "ur";
  if (ARABIC_RE.test(q)) return "ar";
  return fallback;
}

/**
 * Reference parser. Returns { collection, hadith_number } if the query
 * unambiguously names a single hadith. Handles:
 *   - "bukhari:1", "bukhari 1", "bukhari #1", "bukhari-1"
 *   - bare "1" (treat as bukhari since it's the only collection seeded)
 *   - "Book N, Hadith M" → looked up by (book_number, hadith_number) — but we
 *     don't have a unique index there, so we resolve via SELECT.
 *   - USC-MSA "Vol. X, Book Y, Hadith Z" → looked up via usc_msa_ref string.
 */
type ReferenceMatch =
  | { kind: "id"; collection: string; hadith_number: number }
  | { kind: "book_hadith"; book_number: number; hadith_number: number }
  | { kind: "usc_msa"; usc_msa_ref: string };

function parseReference(rawQuery: string): ReferenceMatch | null {
  const q = rawQuery.trim();

  // bukhari:1 / bukhari 1 / bukhari #1 / bukhari-1 / bare digits
  const idRe = /^\s*(?:(bukhari)[:\s#-]+)?(\d{1,5})\s*$/i;
  const idMatch = q.match(idRe);
  if (idMatch) {
    return {
      kind: "id",
      collection: (idMatch[1] ?? "bukhari").toLowerCase(),
      hadith_number: Number(idMatch[2]),
    };
  }

  // USC-MSA: "Vol. X, Book Y, Hadith Z"
  const uscRe = /vol\.?\s*(\d+)\s*,\s*book\s*(\d+)\s*,\s*hadith\s*(\d+)/i;
  const uscMatch = q.match(uscRe);
  if (uscMatch) {
    return {
      kind: "usc_msa",
      usc_msa_ref: `Vol. ${uscMatch[1]}, Book ${uscMatch[2]}, Hadith ${uscMatch[3]}`,
    };
  }

  // "Book N, Hadith M"
  const bookRe = /book\s*(\d+)\s*,\s*hadith\s*(\d+)/i;
  const bookMatch = q.match(bookRe);
  if (bookMatch) {
    return {
      kind: "book_hadith",
      book_number: Number(bookMatch[1]),
      hadith_number: Number(bookMatch[2]),
    };
  }

  return null;
}

/**
 * FNV-1a 32-bit hash. Used to seed the deterministic stub embedding when
 * Cohere isn't configured. Mirrors the spirit of seed.sql's _stub_embedding.
 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic 1024-d unit-norm float vector for local-dev fallback. */
function stubEmbedding(text: string): number[] {
  let state = fnv1a(text) || 1;
  const v = new Array<number>(EMBED_DIM);
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const x = (state / 0xffffffff) * 2 - 1;
    v[i] = x;
    norm += x * x;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBED_DIM; i++) v[i] /= norm;
  return v;
}

/**
 * pgvector wire format for an array of floats: "[v1,v2,...]". The Supabase
 * JS client passes RPC args as JSON, and `halfvec` accepts this string form.
 */
function toPgVector(arr: number[]): string {
  return `[${arr.join(",")}]`;
}

// -----------------------------------------------------------------------------
// Logging (fire-and-forget; hashes only, never raw query)
// -----------------------------------------------------------------------------

function logSearch(row: {
  user_id: string | null;
  query_hash: string;
  query_length: number;
  mode: SearchMode;
  language: string;
  result_count: number;
  has_filter: boolean;
  latency_ms: number;
  degraded: boolean;
}): void {
  // Don't await — never block the response on logging.
  supabase
    .from("search_logs")
    .insert(row)
    .then(({ error }) => {
      if (error) console.error("search_logs insert failed:", error.message);
    });
}

// -----------------------------------------------------------------------------
// Reference shortcut handler
// -----------------------------------------------------------------------------

async function handleReference(ref: ReferenceMatch, topK: number): Promise<SearchResult[]> {
  const cols =
    "id, hadith_number, book_number, book_name_en, chapter_title_en, in_book_ref, usc_msa_ref, narrator, text_en_full, text_ar";

  let q = supabase.from("hadiths").select(cols).limit(topK);

  if (ref.kind === "id") {
    q = q.eq("collection", ref.collection).eq("hadith_number", ref.hadith_number);
  } else if (ref.kind === "book_hadith") {
    q = q.eq("book_number", ref.book_number).eq("hadith_number", ref.hadith_number);
  } else {
    q = q.eq("usc_msa_ref", ref.usc_msa_ref);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SearchResult[];
}

// -----------------------------------------------------------------------------
// Cohere embed (with stub fallback)
// -----------------------------------------------------------------------------

async function embedQuery(query: string): Promise<number[]> {
  if (!cohere) return stubEmbedding(query);

  const res = await cohere.embed({
    model: "embed-v4.0",
    inputType: "search_query",
    texts: [query],
    embeddingTypes: ["float"],
    outputDimension: EMBED_DIM,
  });

  // The cohere-ai SDK returns `embeddings.float?: number[][]` in v4 responses.
  // Be defensive: the older shape was `embeddings: number[][]`.
  // deno-lint-ignore no-explicit-any
  const e: any = (res as any).embeddings;
  const vec: number[] | undefined = Array.isArray(e) ? e[0] : e?.float?.[0];
  if (!vec || vec.length !== EMBED_DIM) {
    throw new Error(`Cohere embed returned unexpected shape (length ${vec?.length ?? "n/a"})`);
  }
  return vec;
}

// -----------------------------------------------------------------------------
// Cohere rerank (with kill-switch fallback)
// -----------------------------------------------------------------------------

async function rerankCandidates(
  query: string,
  candidates: RpcCandidate[],
  topK: number,
): Promise<{ results: SearchResult[]; degraded: boolean }> {
  // Kill switch or no Cohere → return RRF-ordered top-K and mark degraded.
  if (RERANK_DISABLED || !cohere) {
    return {
      results: candidates.slice(0, topK).map(({ score: _score, ...rest }) => rest),
      degraded: true,
    };
  }

  try {
    const rerank = await cohere.rerank({
      model: "rerank-v4.0-pro",
      query,
      documents: candidates.map((c) => c.text_en_full),
      topN: topK,
    });

    const results: SearchResult[] = rerank.results.map((r) => {
      const { score: _s, ...base } = candidates[r.index];
      return { ...base, relevance: r.relevanceScore };
    });
    return { results, degraded: false };
  } catch (err) {
    // Per plan: skip rerank, return RRF-ordered with degraded flag.
    console.error("rerank failed, falling back to RRF order:", err);
    return {
      results: candidates.slice(0, topK).map(({ score: _score, ...rest }) => rest),
      degraded: true,
    };
  }
}

// -----------------------------------------------------------------------------
// Auth helper — pull user_id out of the JWT (for analytics only).
// -----------------------------------------------------------------------------

async function userIdFromAuth(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  try {
    const token = auth.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Main handler
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, { status: 405 });
  }

  const started = performance.now();
  let queryHash = "";
  let mode: SearchMode = "fresh";
  let degraded = false;

  try {
    // ---------------------------------------------------------------------
    // Parse + validate
    // ---------------------------------------------------------------------
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return jsonResponse({ error: "invalid JSON body" }, { status: 400 });
    }

    const parsed = SearchRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse(
        { error: "invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { query, book, narrator, language: reqLang, topK } = parsed.data;

    const language = detectLanguage(query, reqLang);
    const canonical = canonicalize(query);
    const userId = await userIdFromAuth(req);

    queryHash = await sha256Hex(`${language}|${book ?? ""}|${narrator ?? ""}|${canonical}`);

    // ---------------------------------------------------------------------
    // 1. Reference shortcut
    // ---------------------------------------------------------------------
    const ref = parseReference(query);
    if (ref) {
      const refResults = await handleReference(ref, topK);
      mode = refResults.length > 0 ? "reference" : "empty";
      const latency = Math.round(performance.now() - started);
      logSearch({
        user_id: userId,
        query_hash: queryHash,
        query_length: query.length,
        mode,
        language,
        result_count: refResults.length,
        has_filter: book != null || narrator != null,
        latency_ms: latency,
        degraded: false,
      });
      const body: SearchResponse = {
        results: refResults,
        mode,
        latency_ms: latency,
      };
      return jsonResponse(body);
    }

    // ---------------------------------------------------------------------
    // 2. Cache check
    // ---------------------------------------------------------------------
    {
      const { data: cached, error: cacheErr } = await supabase
        .from("query_cache")
        .select("results, expires_at")
        .eq("query_hash", queryHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cacheErr) {
        console.error("query_cache read failed:", cacheErr.message);
      } else if (cached) {
        mode = "cache";
        const latency = Math.round(performance.now() - started);
        const cachedResults = cached.results as SearchResult[];
        logSearch({
          user_id: userId,
          query_hash: queryHash,
          query_length: query.length,
          mode,
          language,
          result_count: cachedResults.length,
          has_filter: book != null || narrator != null,
          latency_ms: latency,
          degraded: false,
        });
        const body: SearchResponse = {
          results: cachedResults,
          mode,
          latency_ms: latency,
        };
        return jsonResponse(body);
      }
    }

    // ---------------------------------------------------------------------
    // 3. Embed (or stub)
    // ---------------------------------------------------------------------
    const embedding = await embedQuery(query);

    if (!HAS_COHERE) {
      // Local-dev mode: no real embedding service available.
      degraded = true;
    }

    // ---------------------------------------------------------------------
    // 4. Hybrid retrieve via RPC
    // ---------------------------------------------------------------------
    const tsConfig = language === "en" ? "english" : "simple";
    const { data: rpcData, error: rpcErr } = await supabase.rpc("search_hadiths", {
      query_text: query,
      query_embedding: toPgVector(embedding),
      match_count: RPC_MATCH_COUNT,
      book_filter: book ?? null,
      narrator_filter: narrator ?? null,
      language_filter: language,
      ts_config: tsConfig,
    });

    if (rpcErr) {
      console.error("search_hadiths RPC failed:", rpcErr.message);
      throw new Error("search RPC failed");
    }

    const candidates = (rpcData ?? []) as RpcCandidate[];

    if (candidates.length === 0) {
      mode = "empty";
      const latency = Math.round(performance.now() - started);
      logSearch({
        user_id: userId,
        query_hash: queryHash,
        query_length: query.length,
        mode,
        language,
        result_count: 0,
        has_filter: book != null || narrator != null,
        latency_ms: latency,
        degraded,
      });
      const body: SearchResponse = {
        results: [],
        mode,
        latency_ms: latency,
        degraded: degraded || undefined,
      };
      return jsonResponse(body);
    }

    // ---------------------------------------------------------------------
    // 5. Rerank
    // ---------------------------------------------------------------------
    const reranked = await rerankCandidates(query, candidates, topK);
    degraded = degraded || reranked.degraded;

    // ---------------------------------------------------------------------
    // 6. Cache write + log (fire-and-forget)
    // ---------------------------------------------------------------------
    // Skip the cache write when degraded so a stub-mode or rerank-failure
    // response doesn't poison the cache for 7 days. Real, reranked responses
    // are the only thing worth caching.
    if (!degraded) {
      const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      supabase
        .from("query_cache")
        .upsert(
          {
            query_hash: queryHash,
            results: reranked.results,
            expires_at: expiresAt,
          },
          { onConflict: "query_hash" },
        )
        .then(({ error }) => {
          if (error) console.error("query_cache write failed:", error.message);
        });
    }

    const latency = Math.round(performance.now() - started);
    logSearch({
      user_id: userId,
      query_hash: queryHash,
      query_length: query.length,
      mode,
      language,
      result_count: reranked.results.length,
      has_filter: book != null || narrator != null,
      latency_ms: latency,
      degraded,
    });

    const body: SearchResponse = {
      results: reranked.results,
      mode,
      latency_ms: latency,
      degraded: degraded || undefined,
    };
    return jsonResponse(body);
  } catch (err) {
    const latency = Math.round(performance.now() - started);
    // Log the error WITHOUT the raw query — only the hash.
    console.error("search handler error:", {
      query_hash: queryHash || "(pre-hash)",
      latency_ms: latency,
      message: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse({ error: "internal error" }, { status: 500 });
  }
});
