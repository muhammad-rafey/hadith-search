import "server-only";

/**
 * Parse a numeric environment variable safely.
 *
 * `Number(process.env.X ?? d)` only applies the default when X is *unset* — a
 * malformed value (empty string, "abc") yields `0`/`NaN` and silently
 * propagates: `NaN` disables the `MIN_RELEVANCE` floor, throws on
 * `new Date(… + NaN)`, makes `setTimeout(fn, NaN)` fire immediately, and 429s
 * every request when a rate limit becomes `NaN`. This returns the fallback for
 * any unset/blank/non-finite value and clamps to an optional [min, max] range.
 */
export function numEnv(
  name: string,
  fallback: number,
  opts?: { min?: number; max?: number; int?: boolean },
): number {
  const raw = process.env[name];
  const parsed = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  let n = Number.isFinite(parsed) ? parsed : fallback;
  if (opts?.int) n = Math.trunc(n);
  if (opts?.min !== undefined && n < opts.min) n = opts.min;
  if (opts?.max !== undefined && n > opts.max) n = opts.max;
  return n;
}
