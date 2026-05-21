import "server-only";

/**
 * In-memory per-IP token bucket. Per Vercel isolate, so total throughput scales
 * with isolate count — fine for a v1. Replace with Upstash Redis when we need
 * coordinated limits across regions.
 */

type Bucket = { tokens: number; lastRefill: number };

const RATE_PER_SECOND = Number(process.env.RATE_LIMIT_PER_SEC ?? 10);
const BURST = Number(process.env.RATE_LIMIT_BURST ?? 30);
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: BURST, lastRefill: now };
  const elapsed = (now - b.lastRefill) / 1000;
  b.tokens = Math.min(BURST, b.tokens + elapsed * RATE_PER_SECOND);
  b.lastRefill = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    buckets.set(key, b);
    return { allowed: true, retryAfterMs: 0 };
  }
  buckets.set(key, b);
  const needed = 1 - b.tokens;
  return { allowed: false, retryAfterMs: Math.ceil((needed / RATE_PER_SECOND) * 1000) };
}

export function clientKeyFromRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}
