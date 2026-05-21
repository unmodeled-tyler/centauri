interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MAX_CACHE_SIZE = 500;

export class SimpleCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict expired entries and enforce max size
    if (this.store.size >= MAX_CACHE_SIZE) {
      this.prune();
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  private prune(): void {
    const now = Date.now();
    // First pass: remove expired entries
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
    // Second pass: if still over limit, evict oldest entries (first inserted)
    let overBy = this.store.size - MAX_CACHE_SIZE;
    if (overBy > 0) {
      for (const key of this.store.keys()) {
        if (overBy <= 0) break;
        this.store.delete(key);
        overBy--;
      }
    }
  }
}

const GIT_CACHE = new SimpleCache<unknown>(2000);

export async function cachedGitCall<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = GIT_CACHE.get(key);
  if (cached !== undefined) return cached as T;
  const result = await fn();
  GIT_CACHE.set(key, result);
  return result;
}
