import chokidar from "chokidar";
import { join, relative, sep } from "path";

interface WatcherClient {
  id: number;
  write(data: string): void;
}

class RepoWatcherInstance {
  private clients = new Map<number, WatcherClient>();
  private nextClientId = 1;
  private watcher: ReturnType<typeof chokidar.watch>;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private repoPath: string) {
    const gitDir = join(repoPath, ".git");
    this.watcher = chokidar.watch(
      [
        repoPath,
        join(gitDir, "HEAD"),
        join(gitDir, "refs"),
        join(gitDir, "index"),
        join(gitDir, "stash"),
      ],
      {
        ignored: (path) => shouldIgnorePath(repoPath, path),
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      },
    );

    this.watcher
      .on("add", () => this.onChange())
      .on("change", () => this.onChange())
      .on("unlink", () => this.onChange())
      .on("error", (err) => {
        console.warn(`[centauri] Repo watcher disabled for ${this.repoPath}:`, err);
        this.stop();
        WATCHER_MAP.delete(this.repoPath);
      });
  }

  private onChange() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.broadcast("data: refresh\n\n");
    }, 350);
  }

  private broadcast(data: string) {
    for (const client of this.clients.values()) {
      client.write(data);
    }
  }

  add(writeFn: (data: string) => void): () => void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    const id = this.nextClientId++;
    this.clients.set(id, { id, write: writeFn });
    return () => {
      this.clients.delete(id);
      if (this.clients.size === 0) {
        this.stopTimer = setTimeout(() => {
          this.stop();
          WATCHER_MAP.delete(this.repoPath);
        }, 30000);
      }
    };
  }

  stop() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.watcher.close().catch(() => {});
  }
}

const WATCHER_MAP = new Map<string, RepoWatcherInstance>();

const IGNORED_SEGMENTS = new Set([
  ".cache",
  ".idea",
  ".next",
  ".nuxt",
  ".turbo",
  ".venv",
  ".vscode",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const WATCHED_GIT_PATHS = new Set(["HEAD", "index", "refs", "stash"]);

function shouldIgnorePath(repoPath: string, path: string) {
  const relativePath = relative(repoPath, path);
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (segments[0] === ".git") {
    return segments.length > 1 && !WATCHED_GIT_PATHS.has(segments[1]!);
  }
  if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) {
    return true;
  }

  return path.endsWith(`${sep}.DS_Store`) || path.endsWith(".log");
}

export function shutdownAllWatchers(): void {
  for (const [path, watcher] of WATCHER_MAP) {
    watcher.stop();
    WATCHER_MAP.delete(path);
  }
}

export function getRepoWatcher(repoPath: string): RepoWatcherInstance {
  let watcher = WATCHER_MAP.get(repoPath);
  if (!watcher) {
    watcher = new RepoWatcherInstance(repoPath);
    WATCHER_MAP.set(repoPath, watcher);
  }
  return watcher;
}
