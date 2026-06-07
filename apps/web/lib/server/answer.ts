import "server-only";

import type {
  AnswerCitation,
  AnswerRequest,
  AnswerResponse,
  SearchResult,
} from "@hadith/shared-types";

import { COHERE_AVAILABLE, cohereGenerateGrounded, type GroundedDocument } from "./cohere";
import { numEnv } from "./env";
import { canonicalKey, sha256Hex } from "./hash";
import { TtlLru } from "./lru-cache";
import { runSearch } from "./search-pipeline";

// Kill switch — when "true", the endpoint always abstains (no model call). Also
// the effective state whenever COHERE_API_KEY is unset, so search keeps working
// and the answer panel degrades gracefully instead of erroring.
const ANSWER_DISABLED = process.env.ANSWER_DISABLED === "true";

// Cohere chat model. Default to the current Command flagship; override per the
// project's key (e.g. "command-r-08-2024") without a code change.
const ANSWER_MODEL = process.env.ANSWER_MODEL?.trim() || "command-a-03-2025";

// Generation budget. The route's maxDuration must exceed this plus the internal
// search budget.
const ANSWER_TIMEOUT_MS = numEnv("ANSWER_TIMEOUT_MS", 12_000, { min: 1 });

// Minimum top-result reranker relevance to attempt an answer. Set higher than
// search's MIN_RELEVANCE (0.02) because a *citable* answer needs at least one
// strong hit, not just the best of a weak pool. Calibrated low for the
// bge-reranker score scale; raise toward ~0.3 when reranking via Cohere.
const MIN_ANSWER_RELEVANCE = numEnv("MIN_ANSWER_RELEVANCE", 0.1, { min: 0, max: 1 });

// How many top hadiths to actually ground the answer in (a tighter set than the
// list the user sees gives the model a cleaner, more relevant context).
const MAX_ANSWER_DOCS = numEnv("MAX_ANSWER_DOCS", 8, { min: 1, max: 20, int: true });

const ABSTAIN_MESSAGE =
  "I couldn't find a hadith in Sahih al-Bukhari that directly answers this. Try rephrasing your question, or browse the results below.";

const DEGRADED_MESSAGE =
  "The answer service is temporarily unavailable, so I can't generate a grounded answer right now. The search results below are still based on your question.";

const SYSTEM_PROMPT = [
  "You are a careful assistant for a Sahih al-Bukhari hadith search app.",
  "Answer the user's question USING ONLY the provided hadith documents.",
  "Rules:",
  "- Ground every statement in the provided hadiths. Do not use outside knowledge.",
  "- If the provided hadiths do not actually answer the question, say so plainly and do not guess.",
  "- Do NOT issue religious rulings, fatwas, or personal opinions beyond what the hadith text states.",
  "- Be concise (a short paragraph). Quote or paraphrase faithfully and cite the hadiths you used.",
  "- Respond in the same language as the user's question.",
].join("\n");

// Per-isolate cache. Only successful ("answered") responses are stored, so a
// transient outage or a weak-retrieval abstention self-heals on the next request
// — mirrors the search pipeline's degraded-skip-cache rule.
const lru = new TtlLru<string, AnswerResponse>();

/**
 * Generate a grounded answer for a free-text question.
 *
 * Re-runs `runSearch()` internally (reusing its cache) so the answer is grounded
 * in exactly the hadiths the search response returns, then either abstains (weak
 * retrieval / disabled / no key / degraded) or calls Cohere with a strict
 * grounding prompt and maps the citations back to the source hadiths.
 */
export async function generateAnswer(
  req: AnswerRequest,
  userId: string | null,
): Promise<AnswerResponse> {
  const start = Date.now();
  const language = req.language ?? "en";
  const topK = req.topK ?? MAX_ANSWER_DOCS;
  const useCache = !req.skip_cache;

  const cacheKey = sha256Hex(canonicalKey({ language, query: req.query }));
  if (useCache) {
    const cached = lru.get(cacheKey);
    if (cached) return { ...cached, latency_ms: Date.now() - start };
  }

  // Reuse the search pipeline (and its cache) for retrieval.
  const search = await runSearch(
    { query: req.query, language, topK, skip_cache: req.skip_cache },
    userId,
  );

  // Retrieval was unreliable → never synthesize over it.
  if (search.degraded) {
    return degraded(DEGRADED_MESSAGE, start);
  }

  // Nothing to ground an answer in.
  if (search.results.length === 0) {
    return abstain(ABSTAIN_MESSAGE, start);
  }

  // Require at least one strong hit. `relevance` is absent only when the
  // reranker degraded (handled above), so treat missing as 0 here.
  const topRelevance = search.results[0]?.relevance ?? 0;
  if (topRelevance < MIN_ANSWER_RELEVANCE) {
    return abstain(ABSTAIN_MESSAGE, start);
  }

  // Generation unavailable → abstain (search still works; UI degrades cleanly).
  if (ANSWER_DISABLED || !COHERE_AVAILABLE()) {
    return abstain(ABSTAIN_MESSAGE, start);
  }

  // Ground in the top N results. Use the array index as the document id so the
  // mapping back to a SearchResult is robust regardless of hadith id format.
  const docResults = search.results.slice(0, MAX_ANSWER_DOCS);
  const documents: GroundedDocument[] = docResults.map((r, i) => ({
    id: String(i),
    text: groundingTextFor(r),
  }));

  const generated = await cohereGenerateGrounded({
    system: SYSTEM_PROMPT,
    query: req.query,
    documents,
    model: ANSWER_MODEL,
    timeoutMs: ANSWER_TIMEOUT_MS,
  });

  // Model failed/timed out → degrade rather than error.
  if (!generated) {
    return degraded(DEGRADED_MESSAGE, start);
  }

  const citations = mapCitations(generated.citedIds, docResults);
  const response: AnswerResponse = {
    answer: generated.text,
    status: "answered",
    citations,
    model: ANSWER_MODEL,
    latency_ms: Date.now() - start,
  };
  if (useCache) lru.set(cacheKey, response);
  return response;
}

/** Map cited document ids (array-index strings) back to citation records. */
function mapCitations(citedIds: string[], docResults: SearchResult[]): AnswerCitation[] {
  const citations: AnswerCitation[] = [];
  const seen = new Set<string>();
  for (const id of citedIds) {
    const idx = Number.parseInt(id, 10);
    if (!Number.isInteger(idx)) continue;
    const r = docResults[idx];
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    citations.push({
      hadith_id: r.id,
      hadith_number_label: r.hadith_number_label,
      in_book_ref: r.in_book_ref,
      collection: r.collection,
    });
  }
  return citations;
}

/**
 * Build the grounding text for one hadith — chapter (bab) name, narrator, then
 * the body. Same salient fields the reranker scores on (rerankDocFor in
 * search-pipeline.ts), so the model sees the signal that ranked it.
 */
function groundingTextFor(r: SearchResult): string {
  const parts: string[] = [];
  parts.push(`${r.collection} ${r.hadith_number_label}`);
  if (r.chapter_title_en) parts.push(r.chapter_title_en);
  if (r.narrator) parts.push(`Narrated ${r.narrator}`);
  parts.push(r.text_en_full);
  return parts.join(". ");
}

function abstain(message: string, start: number): AnswerResponse {
  return {
    answer: message,
    status: "abstained",
    citations: [],
    model: "",
    latency_ms: Date.now() - start,
  };
}

function degraded(message: string, start: number): AnswerResponse {
  return {
    answer: message,
    status: "degraded",
    citations: [],
    model: "",
    latency_ms: Date.now() - start,
    degraded: true,
  };
}
