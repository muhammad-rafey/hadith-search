# 01 — Search API (Supabase Edge Function)

## Goal

A single Supabase Edge Function at `/functions/v1/search` that accepts a user query and returns reranked top-K hadiths with full metadata. This is the only network call the web (and later mobile) client makes for search.

**Latency targets:** p50 ≤ 600 ms fresh, p50 ≤ 120 ms cached. p95 ≤ 1.2 s fresh.

**Status:** Blocked on data dump + schema. Pipeline shape is fixed; concrete SQL waits.

---

## Decisions

| Concern | Pick |
|---|---|
| Runtime | Supabase Edge Functions (Deno) |
| Embedding | Cohere `embed-v4.0`, `outputDimension: 1024`, `inputType: "search_query"` |
| Vector store | Supabase `pgvector` — `halfvec(1024)` + HNSW (`m=16, ef_construction=64`) |
| Keyword retrieval | Postgres `tsvector` + `websearch_to_tsquery('english', ...)` |
| Fusion | Reciprocal Rank Fusion (RRF) in a single SQL RPC |
| Reranker | Cohere `rerank-v3.5`, `topN: 10` from a 30-candidate slate |
| Cache | Postgres `query_cache` table (7-day TTL) + isolate-local LRU |
| Auth | Supabase JWT (anonymous OK), JWT-based rate limit |
| Fallback embedder | OpenAI `text-embedding-3-small` behind a feature flag |

---

## Pipeline

```
client request (POST /search)
        │
        ▼
┌─────────────────────────┐
│ 1. Preprocess           │
│    - reference regex    │ ──► direct SQL lookup, return early
│    - narrator detect    │
│    - language detect    │
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ 2. Cache check          │ ──► return cached result
│    SHA-256(normalized)  │
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ 3. Embed query          │   Cohere embed-v4, ~80–150 ms
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ 4. Hybrid retrieval RPC │   pgvector ⊕ tsvector via RRF
│    search_hadiths(...)  │   top 30 candidates, ~5–15 ms
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ 5. Rerank               │   Cohere rerank-v3.5, top 10
│                         │   ~150–300 ms
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ 6. Cache write + log    │
└──────────┬──────────────┘
           ▼
      JSON response
```

---

## Request / response contract

```ts
// POST /functions/v1/search
type SearchRequest = {
  query: string;
  book?: number;           // optional book_number filter
  narrator?: string;       // normalized form, e.g. "abu hurairah"
  language?: "en" | "ar" | "ur";   // default "en"
  topK?: number;           // default 10, max 20
};

type SearchResult = {
  id: string;              // e.g. "bukhari:1"
  hadith_number: number;
  book_number: number;
  book_name_en: string;
  chapter_title_en: string | null;
  in_book_ref: string;
  usc_msa_ref: string | null;
  narrator: string | null;
  text_en_full: string;
  text_ar: string | null;
  relevance: number;       // from Cohere rerank, 0–1
};

type SearchResponse = {
  results: SearchResult[];
  mode: "reference" | "cache" | "fresh" | "empty";
  latency_ms: number;
};
```

Exact field names sync with the schema once it's designed against the dump.

---

## Preprocessor responsibilities

1. **Reference shortcut.** Regex `/^\s*(?:bukhari[:\s#-]+)?(\d{1,5})\s*$/i` → direct SQL by `hadith_number`. Also handle `"Book N, Hadith M"` and USC-MSA `"Vol. X, Book Y, Hadith Z"`.
2. **Narrator detection.** Phrase patterns like `"narrated by abu hurairah"`, `"hadith of aishah"` → extract narrator, normalize against the hand-curated synonym map (~50 entries cover 95% of Bukhari), pass as `narrator_filter`.
3. **Language detect.** If query contains Arabic Unicode range, route to `language="ar"`. Urdu range to `language="ur"`. Default `"en"`.
4. **Query canonicalization.** Lowercase, trim, collapse whitespace, strip trailing punctuation. The canonical form is what gets hashed for cache.

---

## Caching layers

| Layer | TTL | Purpose | Hit rate (est.) |
|---|---|---|---|
| `query_cache` (Postgres) | 7 days | Survives across isolates and regions; primary cache | 40–60% steady state |
| Isolate-local `Map` | 5 min | Catches bursts on the same Edge isolate | 5–10% |
| Client TanStack Query | 5 min `staleTime`, 30 min `gcTime` | Stops the same user re-firing identical queries | 20–40% per-user |

Cache key: `sha256(language + "|" + (book ?? "") + "|" + (narrator ?? "") + "|" + canonical_query)`.

---

## SQL RPC (sketch, finalized post-schema)

```sql
create or replace function search_hadiths(
  query_text         text,
  query_embedding    halfvec(1024),
  match_count        int   default 30,
  rrf_k              int   default 50,
  full_text_weight   float default 1.0,
  semantic_weight    float default 1.0,
  collection_filter  text  default 'bukhari',
  book_filter        int   default null,
  narrator_filter    text  default null,
  language_filter    text  default 'en'
)
returns table (...)
language sql stable as $$
  with full_text as (
    select h.id,
           row_number() over (
             order by ts_rank_cd(h.fts, websearch_to_tsquery('english', query_text)) desc
           ) as rank_ix
    from hadiths h
    where h.fts @@ websearch_to_tsquery('english', query_text)
      and h.collection = collection_filter
      and h.language = language_filter
      and (book_filter is null or h.book_number = book_filter)
      and (narrator_filter is null or h.narrator_normalized ilike '%' || narrator_filter || '%')
    order by rank_ix
    limit least(match_count, 60) * 2
  ),
  semantic as (
    select e.hadith_id as id,
           row_number() over (order by e.embedding <=> query_embedding) as rank_ix
    from hadith_embeddings e
    join hadiths h on h.id = e.hadith_id
    where h.collection = collection_filter
      and h.language = language_filter
      and (book_filter is null or h.book_number = book_filter)
      and (narrator_filter is null or h.narrator_normalized ilike '%' || narrator_filter || '%')
    order by rank_ix
    limit least(match_count, 60) * 2
  )
  select h.*,
         (coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight
        + coalesce(1.0 / (rrf_k + s.rank_ix),  0.0) * semantic_weight) as score
  from full_text ft
    full outer join semantic s on ft.id = s.id
    join hadiths h on h.id = coalesce(ft.id, s.id)
  order by score desc
  limit match_count;
$$;
```

Adapted from Supabase's published hybrid-search pattern. Lock in once the `hadiths` schema is finalized.

---

## Edge Function skeleton (Deno)

```ts
// supabase/functions/search/index.ts
import { CohereClient } from "npm:cohere-ai";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cohere = new CohereClient({ token: Deno.env.get("COHERE_API_KEY")! });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const started = performance.now();
  const { query, book, narrator, language = "en", topK = 10 } = await req.json();

  // 1. Reference shortcut
  const refMatch = query.match(/^\s*(?:bukhari[:\s#-]+)?(\d{1,5})\s*$/i);
  if (refMatch) { /* direct select, return mode: "reference" */ }

  // 2. Cache check
  const cacheKey = await sha256(`${language}|${book ?? ""}|${narrator ?? ""}|${query.trim().toLowerCase()}`);
  // SELECT FROM query_cache WHERE query_hash = cacheKey AND expires_at > now()

  // 3. Embed
  const { embeddings } = await cohere.embed({
    model: "embed-v4.0",
    inputType: "search_query",
    texts: [query],
    embeddingTypes: ["float"],
    outputDimension: 1024,
  });

  // 4. Hybrid retrieval
  const { data: candidates } = await supabase.rpc("search_hadiths", {
    query_text: query,
    query_embedding: embeddings.float![0],
    match_count: 30,
    book_filter: book ?? null,
    narrator_filter: narrator ?? null,
    language_filter: language,
  });
  if (!candidates?.length) return Response.json({ results: [], mode: "empty" });

  // 5. Rerank
  const rerank = await cohere.rerank({
    model: "rerank-v3.5",
    query,
    documents: candidates.map((c) => c.text_en_full),
    topN: topK,
  });
  const results = rerank.results.map((r) => ({
    ...candidates[r.index],
    relevance: r.relevanceScore,
  }));

  // 6. Cache write + log (fire-and-forget)
  // upsert query_cache, insert search_logs

  return Response.json({
    results,
    mode: "fresh",
    latency_ms: Math.round(performance.now() - started),
  });
});
```

---

## Failure modes & fallbacks

| Failure | Behavior |
|---|---|
| Cohere embed times out (> 2 s) | Fall back to OpenAI `text-embedding-3-small` (1536-dim — needs a parallel index or a runtime projection; document the cost) |
| Cohere rerank fails | Skip rerank, return RRF-ordered top-K with a `degraded: true` flag |
| Postgres RPC empty | Return `{ results: [], mode: "empty" }` — client shows "no matches, try rephrasing" |
| Cache write fails | Log warning, return result normally |
| Rate limit exceeded | HTTP 429 with `Retry-After`, client surfaces toast |

---

## Rate limiting

v1: rely on Supabase's per-JWT rate limit (default 60 req/min, tweakable). Sufficient until ~10k MAU.

v2 (post-launch): add a Postgres-backed bucket:

```sql
create table rate_limits (
  user_id uuid not null,
  window_start timestamptz not null,
  count int default 1,
  primary key (user_id, window_start)
);
```

Or swap to Upstash Redis if Postgres write load becomes a concern.

---

## Observability

- Each request inserts a row into `search_logs` with: `user_id`, `query_hash` (NOT raw query), `mode`, `latency_ms`, `result_count`, `had_filter`, `language`, `created_at`.
- `console.log` flows to Supabase Edge Function logs; Sentry catches uncaught throws via manual `Sentry.captureException` (see `03-analytics-monitoring.md`).

---

## Verification

1. Local: `supabase functions serve search`, `curl` with eval queries.
2. Eval set: 50 hand-curated `(query, expected hadith_id)` pairs. Track recall@10 and MRR.
   - Required smoke set: `"intention"`, `"abu hurairah"`, `"fasting in ramadan"`, `"ablution"`, `"bukhari:1"`, `"riba"`, `"washing before prayer"`, `"narrated by aisha about prayer"`.
3. Latency budget: p50 ≤ 600 ms, p95 ≤ 1.2 s measured against staging.
4. Cache: send same query twice, second response has `mode: "cache"` and `latency_ms` < 150.
5. Rerank toggle: temporarily disable rerank, confirm `degraded: true` flag flows through.
6. Negative test: nonsense query like `"asdfqwerty"` returns `mode: "empty"`.

---

## Pending blockers

- Data dump from user.
- Schema designed against the dump (will be `00-data-schema.md`).
- Embeddings loaded (will be covered in `00-data-ingestion.md` post-dump).
- Sunnah.com written permission (in case the dump format implies attribution requirements that affect the response shape).
