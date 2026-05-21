import { create } from "zustand";
import type { StatusResult, Branch, CommitInfo } from "../types/git";
import * as api from "../services/api";
import { saveRecentRepo } from "../utils/recentRepos";

// Module-level guard prevents concurrent sync operations
let _syncInFlight = false;

function rememberRecentRepo(path: string) {
  try {
    const next = saveRecentRepo(path);

    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.setRecentRepos(next);
    }
  } catch {}
}

function buildStatusSignature(status: StatusResult | null) {
  if (!status) return null;

  const fileCount = status.files.length;
  const firstPath = fileCount > 0 ? status.files[0]?.path : "";

  return `${status.branch}|${status.ahead}|${status.behind}|${status.staged}|${status.unstaged}|${status.untracked}|${status.conflicted}|${fileCount}|${firstPath}`;
}

interface RepoStore {
  repoPath: string | null;
  status: StatusResult | null;
  branches: Branch[];
  commits: CommitInfo[];
  loading: boolean;
  error: string | null;
  lastStatusUpdateAt: number | null;
  lastChangeDetectedAt: number | null;

  setRepo: (path: string | null) => void;
  refresh: () => Promise<void>;
  pollRepo: () => Promise<void>;
  refreshStatus: () => Promise<boolean>;
  refreshBranches: () => Promise<void>;
  refreshLog: () => Promise<void>;
  clearError: () => void;
}

export const useRepoStore = create<RepoStore>((set, get) => {

  async function syncRepo(showLoading: boolean) {
    const { repoPath } = get();
    if (!repoPath || _syncInFlight) return;

    _syncInFlight = true;
    if (showLoading) set({ loading: true, error: null });
    try {
      const [statusResult, branchesResult, logResult] = await Promise.allSettled([
        api.getStatus(repoPath),
        api.getBranches(repoPath),
        api.getLog(repoPath, 50),
      ]);

      const patch: Partial<RepoStore> = {};

      if (statusResult.status === "fulfilled") {
        const previousStatus = get().status;
        const status = statusResult.value;
        const previousSignature = buildStatusSignature(previousStatus);
        const nextSignature = buildStatusSignature(status);
        const hasChanged = previousSignature !== null && previousSignature !== nextSignature;

        patch.status = status;
        patch.lastStatusUpdateAt = Date.now();
        if (hasChanged) patch.lastChangeDetectedAt = Date.now();
      }

      if (branchesResult.status === "fulfilled") {
        patch.branches = branchesResult.value;
      }

      if (logResult.status === "fulfilled") {
        patch.commits = logResult.value;
      }

      const errors = [statusResult, branchesResult, logResult]
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
      if (errors.length > 0) {
        patch.error = errors.join("; ");
      }

      set(patch);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    } finally {
      _syncInFlight = false;
      if (showLoading) set({ loading: false });
    }
  }

  return {
  repoPath: null,
  status: null,
  branches: [],
  commits: [],
  loading: false,
  error: null,
  lastStatusUpdateAt: null,
  lastChangeDetectedAt: null,

  setRepo: (path) => {
    if (path) {
      rememberRecentRepo(path);
    }
    set({
      repoPath: path,
      status: null,
      branches: [],
      commits: [],
      error: null,
      lastStatusUpdateAt: null,
      lastChangeDetectedAt: null,
    });
    const state = get();
    if (state.refresh) state.refresh();
  },

  refresh: () => syncRepo(true),

  pollRepo: () => syncRepo(false),

  refreshStatus: async () => {
    const { repoPath } = get();
    if (!repoPath) return false;
    try {
      const previousStatus = get().status;
      const status = await api.getStatus(repoPath);
      const previousSignature = buildStatusSignature(previousStatus);
      const nextSignature = buildStatusSignature(status);
      const hasChanged = previousSignature !== null && previousSignature !== nextSignature;

      set({
        status,
        lastStatusUpdateAt: Date.now(),
        lastChangeDetectedAt: hasChanged ? Date.now() : get().lastChangeDetectedAt,
      });

      return hasChanged;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      return false;
    }
  },

  refreshBranches: async () => {
    const { repoPath } = get();
    if (!repoPath) return;
    try {
      const branches = await api.getBranches(repoPath);
      set({ branches });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    }
  },

  refreshLog: async () => {
    const { repoPath } = get();
    if (!repoPath) return;
    try {
      const commits = await api.getLog(repoPath, 50);
      set({ commits });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    }
  },

  clearError: () => set({ error: null }),
  };
});
