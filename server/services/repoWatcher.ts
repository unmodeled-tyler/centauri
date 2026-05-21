import chokidar from "chokidar";
import { sep } from "path";

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
    this.watcher = chokidar.watch(repoPath, {
      ignored: shouldIgnorePath,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 100 },
    });

    this.watcher
      .on("add", () => this.onChange())
      .on("change", () => this.onChange())
      .on("unlink", () => this.onChange())
      .on("addDir", () => this.onChange())
      .on("unlinkDir", () => this.onChange())
      .on("error", (err) => {
        console.warn(`[quanta-control] Repo watcher disabled for ${this.repoPath}:`, err);
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

export function shutdownAllWatchers(): void {
  for (const [path, watcher] of WATCHER_MAP) {
    watcher.stop();
    WATCHER_MAP.delete(path);
  }
}

const IGNORED_SEGMENTS = new Set([
  ".cache",
  ".git",
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

function shouldIgnorePath(path: string) {
  const segments = path.split(/[\\/]+/);
  if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) {
    return true;
  }

  return path.endsWith(`${sep}.DS_Store`) || path.endsWith(".log");
}

export function getRepoWatcher(repoPath: string): RepoWatcherInstance {
  let watcher = WATCHER_MAP.get(repoPath);
  if (!watcher) {
    watcher = new RepoWatcherInstance(repoPath);
    WATCHER_MAP.set(repoPath, watcher);
  }
  return watcher;
}
