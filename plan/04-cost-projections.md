# 04 — Cost & Infrastructure Projections

## Goal

Know what running this costs at each scale, where the cost-curve breaks, and which levers are available before the bill becomes a problem.

All figures USD/month, list prices as of mid-2026.

---

## Assumptions

- **20 searches per MAU per month.** Pure browsing/reading is free (handled by Postgres reads + static Next.js).
- **50% cache hit rate** at the Postgres `query_cache` layer once usage stabilizes. Cached searches skip embed + rerank.
- **Cohere `embed-v4`:** $0.12 per 1M tokens.
- **Cohere `rerank-v3.5`:** $2 per 1,000 search calls (docs ≤ 500 tokens, ≤ 100 per call — we send 30).
- **Average query:** ~10 tokens for embedding.
- **Supabase Pro:** $25/mo base.
- **Vercel:** Hobby is fine until launch; Pro ($20/mo) once we want analytics + larger build minutes + team seats.
- **One-time corpus embedding:** ~7,500 hadiths × ~120 tokens ≈ 900K tokens ≈ **$0.11** at Cohere v4 pricing. Negligible. Repeat for Arabic + Urdu later: still < $1 total.

---

## Development phase (just you, building)

| Item | Cost |
|---|---|
| Supabase Free (or Pro for backups) | $0 — $25 |
| Vercel Hobby | $0 |
| Cohere usage (heavy testing) | ~$5 |
| Sentry + PostHog free tiers | $0 |
| Better Stack free | $0 |
| Domain (one-time, $10–15/yr) | ~$1 |
| **Total** | **~$10–35 / month** |

Start on Supabase Free. Move to Pro when daily backups / PITR matter, or when you cross the free-tier compute/storage caps.

---

## 100 active users

| Item | Calc | Cost |
|---|---|---|
| Supabase Pro | base | $25.00 |
| Vercel Hobby | base | $0.00 |
| Embedding (cache misses) | 100 × 20 × 0.5 × 10 tokens × $0.12/M | $0.001 |
| Reranker | 100 × 20 × 0.5 = 1,000 calls × $2/1k | $2.00 |
| Edge Function invocations | well under 2M free | $0 |
| Domain | | $1 |
| **Total** | | **~$28 / month** |

---

## 1,000 active users

| Item | Calc | Cost |
|---|---|---|
| Supabase Pro | | $25 |
| Vercel Pro (team seat + analytics) | | $20 |
| Embedding | 1,000 × 20 × 0.5 × 10 × $0.12/M | $0.012 |
| Reranker | 10,000 cache-miss × $2/1k | $20 |
| Edge Function | ~20k/mo, free | $0 |
| Domain | | $1 |
| **Total** | | **~$66 / month** |

---

## 10,000 active users

| Item | Calc | Cost |
|---|---|---|
| Supabase Pro + small compute bump | | $35 |
| Vercel Pro | | $20 |
| Embedding | 10,000 × 20 × 0.5 × 10 × $0.12/M | $0.12 |
| Reranker | 100,000 cache-miss × $2/1k | $200 |
| Edge Function | ~200k/mo, free | $0 |
| Bandwidth (~50 GB) | within Vercel Pro cap | $0 |
| PostHog (free tier still) | | $0 |
| **Total** | | **~$255 / month** |

The reranker now dominates. Evaluate cost levers before crossing 25k MAU.

---

## 100,000 active users

| Item | Calc | Cost |
|---|---|---|
| Supabase Pro + Medium compute + read replica | | $150 |
| Vercel Pro + extra bandwidth (~500 GB) | $20 + 250 GB × $0.15 | $58 |
| Embedding | 100,000 × 20 × 0.5 × 10 × $0.12/M | $1.20 |
| Reranker (Cohere list price) | 1M cache-miss × $2/1k | **$2,000** |
| **Reranker (self-hosted bge-reranker-v2-m3 on Modal)** | 24×7 small GPU + bursts | **~$200–400** |
| Edge Function beyond 2M free | ~2M extra × $2/M | $4 |
| Sentry + PostHog paid tier (more events) | | $50 |
| **Total (Cohere path)** | | **~$2,280 / month** |
| **Total (self-hosted reranker path)** | | **~$680 / month** |

At 100k MAU, swap to a self-hosted reranker — or negotiate Cohere committed pricing.

---

## Cost levers (in order of impact)

1. **Cache TTL.** Bumping `query_cache` from 7 → 30 days at scale realistically lifts hit rate from 50 → 65% — that's a ~30% reduction in rerank spend overnight. Trade-off: stale rerank scores if we retune the model.
2. **Precompute hot queries.** Nightly cron: take the top-1,000 queries from the past 30 days, run them through the full pipeline, write into `query_cache` with a 90-day TTL. Negligible compute, huge hit-rate bump.
3. **Self-hosted reranker.** Around 25k MAU, deploy `bge-reranker-v2-m3` (open-source, Arabic-strong) on Modal/Replicate/Beam. ~$50–150/mo idle, scales linearly with bursts. Same architecture, swap one env var.
4. **Voyage `rerank-2.5-lite`** as a Cohere alternative — token-based pricing may be cheaper at our query/doc length.
5. **Embedding fallback to OpenAI `text-embedding-3-small`.** Cuts per-query embed cost 6× at the price of one painful re-embedding day when adding Arabic/Urdu. Only relevant if Cohere has an outage; not a steady-state lever.
6. **Tighten `topK` for retrieval.** Rerank 20 instead of 30 candidates → 33% less rerank cost. Re-run the eval set to confirm recall doesn't drop.

---

## Spend caps & alerting

- **Supabase Spend Cap: ON.** Default for new projects on Pro plan; verify in the dashboard.
- **Cohere monthly cap:** $50 to start, lift in steps. Cohere doesn't natively enforce a cap — set a billing alert at $40 and have the Edge Function check a Supabase config flag before calling rerank (a kill switch).
- **PostHog billing alerts:** at 80% of free tier.
- **Sentry billing alerts:** at 80% of free tier.
- **Better Stack:** alert when daily AI spend (from a tracked metric) crosses $X.

---

## What is NOT in these numbers

- Your time. Track it separately — at part-time + your hourly rate, it dwarfs every line item until 10k MAU.
- App-store revenue share (mobile only; not relevant for web).
- Customer support tooling (free tier of email + GitHub for v1).
- Future audio recitation storage (~$0.021/GB/month on Supabase Storage — negligible).
- One-time corpus embedding cost (< $5 for all 6 collections × 3 languages).

---

## Sanity check vs. revenue

A donation-ware Islamic app at 100k MAU monetizing at $0.05–0.20 per MAU per month via tasteful donate-to-support / "Pro" tier covers operational cost comfortably with 5–10% conversion. The architecture stays cash-flow neutral well before it hits enterprise scale.

---

## Verification

1. After Phase 3 ships, instrument actual cache hit rate from `search_logs.mode` — confirm or recalibrate the 50% assumption.
2. After 30 days of production traffic, compute actual `searches per MAU per month` from PostHog — adjust projections.
3. After 90 days, audit Cohere monthly bill against the projection table; if drift > 30%, find out why.
4. Set up a single Supabase scheduled function to email a monthly cost-summary digest (Supabase usage, Cohere spend pulled via their API, Vercel via theirs).
