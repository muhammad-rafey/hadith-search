import "server-only";

import { numEnv } from "./env";

/**
 * In-memory per-IP token bucket. Per Vercel isolate, so total throughput scales
 * with isolate count — fine for a v1. Replace with Upstash Redis when we need
 * coordinated limits across regions.
 *
 * Anti-DoS notes:
 *   - Trust order is `x-vercel-forwarded-for` (set by the platform, not
 *     spoofable from the client) → `x-real-ip` (set by trusted reverse proxies)
 *     → first hop of `x-forwarded-for` ONLY as a last resort. On Vercel the
 *     first two are always populated; on other platforms set TRUSTED_PROXY=true
 *     to opt into the `x-forwarded-for` fallback.
 *   - The bucket map is capped (BUCKETS_MAX) and LRU-pruned to prevent heap
 *     blowup from header-cycling attacks.
 */

type Bucket = { tokens: number; lastRefill: number };

const RATE_PER_SECOND = numEnv("RATE_LIMIT_PER_SEC", 10, { min: 0.01 });
const BURST = numEnv("RATE_LIMIT_BURST", 30, { min: 1, int: true });
const BUCKETS_MAX = numEnv("RATE_LIMIT_BUCKETS_MAX", 10_000, { min: 1, int: true });
const TRUST_XFF = process.env.TRUSTED_PROXY === "true";

// Map iteration order is insertion order; we reinsert on touch to get LRU.
const buckets = new Map<string, Bucket>();

function pruneIfFull() {
  while (buckets.size >= BUCKETS_MAX) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) return;
    buckets.delete(oldest);
  }
}

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const existing = buckets.get(key);
  const b = existing ?? { tokens: BURST, lastRefill: now };
  const elapsed = (now - b.lastRefill) / 1000;
  b.tokens = Math.min(BURST, b.tokens + elapsed * RATE_PER_SECOND);
  b.lastRefill = now;

  // Reinsert to refresh LRU position.
  if (existing) buckets.delete(key);
  else pruneIfFull();
  buckets.set(key, b);

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }
  const needed = 1 - b.tokens;
  return { allowed: false, retryAfterMs: Math.ceil((needed / RATE_PER_SECOND) * 1000) };
}

export function clientKeyFromRequest(req: Request): string {
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]?.trim() || "unknown";
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  if (TRUST_XFF) {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}
