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
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
    let overBy = this.store.size - MAX_CACHE_SIZE;
    if (overBy > 0) {
      for (const key of this.store.keys()) {
        if (overBy <= 0) break;
        this.store.delete(key);
        overBy--;
      }
    }
  }

  /** Invalidate all cache entries matching a prefix, or all entries if no prefix given. */
  invalidate(prefix?: string): void {
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

const GIT_CACHE = new SimpleCache<unknown>(2000);

/** Longer TTL cache for expensive stats queries (30 seconds). */
const STATS_CACHE = new SimpleCache<unknown>(30_000);

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

export async function cachedStatsCall<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = STATS_CACHE.get(key);
  if (cached !== undefined) return cached as T;
  const result = await fn();
  STATS_CACHE.set(key, result);
  return result;
}

/** Invalidate cache entries for a specific repo (prefix like "status:/path/to/repo") or all repo-related keys. */
export function invalidateCache(repoPath?: string): void {
  if (repoPath) {
    GIT_CACHE.invalidate(`status:${repoPath}`);
    GIT_CACHE.invalidate(`log:${repoPath}`);
    GIT_CACHE.invalidate(`remotes:${repoPath}`);
    GIT_CACHE.invalidate(`tags:${repoPath}`);
    GIT_CACHE.invalidate(`tree:${repoPath}`);
    STATS_CACHE.invalidate(`stats:${repoPath}`);
  } else {
    GIT_CACHE.invalidate();
    STATS_CACHE.invalidate();
  }
}
