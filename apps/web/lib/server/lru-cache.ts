import "server-only";

/**
 * Minimal LRU with TTL. Per Vercel isolate, fronts the Postgres query_cache so
 * burst-of-same-query traffic hits zero DB rows.
 */

type Entry<V> = { value: V; expiresAt: number };

const TTL_MS = Number(process.env.LRU_TTL_MS ?? 5 * 60 * 1000);
const CAPACITY = Number(process.env.LRU_CAPACITY ?? 50);

export class TtlLru<K, V> {
  private map = new Map<K, Entry<V>>();

  constructor(
    private capacity: number = CAPACITY,
    private ttlMs: number = TTL_MS,
  ) {}

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Reinsert to mark as recently used.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}
