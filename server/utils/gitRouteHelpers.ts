export interface LineMatch {
  file: string;
  line: number;
  content: string;
}

export function parseBoundedLimit(value: unknown, fallback = 50, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

export function parseGitLineMatches(stdout: string): LineMatch[] {
  const matches: LineMatch[] = [];

  for (const raw of stdout.split("\n")) {
    if (!raw) continue;

    const colonIdx = raw.indexOf(":");
    const secondColonIdx = raw.indexOf(":", colonIdx + 1);

    if (colonIdx <= 0 || secondColonIdx <= colonIdx) continue;

    const file = raw.slice(0, colonIdx);
    const line = Number(raw.slice(colonIdx + 1, secondColonIdx));
    const content = raw.slice(secondColonIdx + 1);

    if (Number.isFinite(line)) {
      matches.push({ file, line, content });
    }
  }

  return matches;
}

// ── Per-repo operation mutex ──────────────────────────────────────────────

const repoQueues = new Map<string, Promise<unknown>>();

/**
 * Serializes async operations per repo so concurrent mutations don't conflict.
 * Uses a chain of promises so operations run in order but don't block each other
 * across different repos.
 */
export function withRepoLock<T>(repoPath: string, fn: () => Promise<T>): Promise<T> {
  const prev = repoQueues.get(repoPath) ?? Promise.resolve();
  const next = prev.then(() => fn(), () => fn());
  repoQueues.set(repoPath, next);
  // Clean up old entries after they resolve
  next.catch(() => {}).then(() => {
    if (repoQueues.get(repoPath) === next) {
      repoQueues.delete(repoPath);
    }
  });
  return next as Promise<T>;
}
