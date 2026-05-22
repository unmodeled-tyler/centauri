import { FolderOpen, X, ChevronRight, GitBranch, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "../../services/api";
import type { BrowseChild, BrowseResult } from "../../services/api";
import type { SystemStatus } from "../../types/system";
import { SetupChecklist } from "../setup/SetupChecklist";
import { SettingsView } from "../settings/SettingsView";
import { useSettingsStore } from "../../stores/settingsStore";
import { loadRecentRepos as loadRecentReposUtil } from "../../utils/recentRepos";

interface RepoOpenerProps {
  onSelect: (path: string) => void;
}

export function RepoOpener({ onSelect }: RepoOpenerProps) {
  const settings = useSettingsStore((s) => s.settings);
  const [path, setPath] = useState(settings.defaultRepoPath);
  const [recent, setRecent] = useState<Array<{ name: string; path: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [browseState, setBrowseState] = useState<BrowseResult | null>(null);
  const [browseHistory, setBrowseHistory] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [systemLoading, setSystemLoading] = useState(true);
  const [agentTools, setAgentTools] = useState<api.AgentTool[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadSystemStatus = useCallback(() => {
    setSystemLoading(true);
    api.getSystemStatus()
      .then(setSystemStatus)
      .catch(() => {})
      .finally(() => setSystemLoading(false));
  }, []);

  const loadAgentTools = useCallback(() => {
    setAgentsLoading(true);
    api.getAgentTools()
      .then(setAgentTools)
      .catch(() => setAgentTools([]))
      .finally(() => setAgentsLoading(false));
  }, []);

  useEffect(() => {
    const stored = loadRecentReposUtil();
    api.getRecentRepos()
      .then((repos) => setRecent(mergeRecentRepos(stored, repos)))
      .catch(() => setRecent(stored));
    loadSystemStatus();
    loadAgentTools();
    inputRef.current?.focus();
  }, [loadAgentTools, loadSystemStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) return;

    setError(null);
    try {
      const { valid, resolvedPath } = await api.validateRepo(path.trim());
      if (valid) {
        onSelect(resolvedPath);
      } else {
        setError("Not a git repository");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openBrowser = useCallback(async (startPath?: string) => {
    const target = startPath ?? (path.trim() || "~");
    setBrowsing(true);
    setError(null);
    try {
      const result = await api.browsePath(target, showHidden);
      setBrowseState(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [path, showHidden]);

  const navigateTo = useCallback(async (dirPath: string) => {
    setError(null);
    try {
      const result = await api.browsePath(dirPath, showHidden);
      if (browseState) {
        setBrowseHistory((prev) => [...prev, browseState.path]);
      }
      setBrowseState(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [browseState, showHidden]);

  const goBack = useCallback(async () => {
    if (browseHistory.length === 0) return;
    const prev = browseHistory[browseHistory.length - 1] ?? "~";
    setBrowseHistory((h) => h.slice(0, -1));
    setError(null);
    try {
      const result = await api.browsePath(prev, showHidden);
      setBrowseState(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [browseHistory, showHidden]);

  const goUp = useCallback(async () => {
    if (!browseState) return;
    const parent = browseState.path.split("/").slice(0, -1).join("/") || "/";
    navigateTo(parent);
  }, [browseState, navigateTo]);

  useEffect(() => {
    if (!browsing || !browseState) return;

    api.browsePath(browseState.path, showHidden)
      .then(setBrowseState)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseState?.path, browsing]);

  return (
    <div className="flex-1 bg-zinc-950">
      <div className="mx-auto grid h-full w-full max-w-6xl gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_380px] lg:p-10">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-8">
          {showSettings ? (
            <>
              <div className="mb-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                    <FolderOpen className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold">Settings</h1>
                    <p className="text-sm text-zinc-500">
                      Adjust startup defaults before opening a repository.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
                >
                  Back to opener
                </button>
              </div>
              <div className="-mx-6 -mb-6">
                <SettingsView />
              </div>
            </>
          ) : (
            <>
              <div className="mb-8 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                  <FolderOpen className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">Open Repository</h1>
                  <p className="text-sm text-zinc-500">
                    Enter a local path or browse for a Git repository.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mb-4">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={path}
                    onChange={(e) => {
                      setPath(e.target.value);
                      setError(null);
                    }}
                    placeholder="~/my-project"
                    className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-emerald-500"
                  >
                    Open
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openBrowser()}
                    className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    Browse directories
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
                  >
                    Preferences
                  </button>
                </div>
                {error && (
                  <p className="mt-2 flex items-center gap-1 text-sm text-red-400">
                    <X className="h-3 w-3" />
                    {error}
                  </p>
                )}
              </form>

              {browsing && browseState && (
                <div className="mb-6 overflow-hidden rounded-lg border border-zinc-800">
                  <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
                    <button
                      onClick={goBack}
                      disabled={browseHistory.length === 0}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-400"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={goUp}
                      className="rounded p-1 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                      title="Parent directory"
                    >
                      ↑
                    </button>
                    <span className="flex-1 truncate font-mono text-xs text-zinc-500">
                      {browseState.path}
                    </span>
                    <button
                      onClick={() => setShowHidden((hidden) => !hidden)}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                      title={showHidden ? "Hide hidden" : "Show hidden"}
                    >
                      {showHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {browseState.isGitRepo && (
                    <button
                      onClick={() => onSelect(browseState.path)}
                      className="w-full border-b border-zinc-800 bg-emerald-500/10 px-3 py-2 text-left transition-colors hover:bg-emerald-500/20"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                        <GitBranch className="h-4 w-4" />
                        Open this repository
                      </span>
                    </button>
                  )}

                  <div className="max-h-72 overflow-y-auto">
                    {browseState.children.map((child) => (
                      <DirectoryEntry
                        key={child.path}
                        child={child}
                        onOpen={navigateTo}
                        onSelect={onSelect}
                      />
                    ))}
                    {browseState.children.length === 0 && (
                      <div className="px-3 py-4 text-center text-xs text-zinc-600">
                        No directories found
                      </div>
                    )}
                  </div>
                </div>
              )}

              {recent.length > 0 && (
                <div>
                  <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Recent Repositories
                  </h2>
                  <div className="space-y-1">
                    {recent.map((repo) => (
                      <button
                        key={repo.path}
                        onClick={() => onSelect(repo.path)}
                        className="group w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-zinc-900"
                      >
                        <div className="flex items-center gap-3">
                          <FolderOpen className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{repo.name}</div>
                            <div className="truncate text-xs text-zinc-600">{repo.path}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="lg:pt-2">
          <SetupChecklist
            status={systemStatus}
            loading={systemLoading}
            onOpenSettings={() => setShowSettings(true)}
            onRefresh={loadSystemStatus}
            agentTools={agentTools}
            agentsLoading={agentsLoading}
            onRefreshAgents={loadAgentTools}
          />
        </div>
      </div>
    </div>
  );
}

function mergeRecentRepos(
  primary: Array<{ name: string; path: string }>,
  secondary: Array<{ name: string; path: string }>,
) {
  const seen = new Set<string>();
  const merged = [...primary, ...secondary].filter((repo) => {
    if (seen.has(repo.path)) {
      return false;
    }
    seen.add(repo.path);
    return true;
  });

  return merged.slice(0, 12);
}

function DirectoryEntry({
  child,
  onOpen,
  onSelect,
}: {
  child: BrowseChild;
  onOpen: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-900 cursor-pointer group transition-colors ${
        child.isGitRepo ? "bg-emerald-500/5" : ""
      }`}
      onClick={() => onOpen(child.path)}
    >
      {child.isGitRepo ? (
        <GitBranch className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      ) : (
        <FolderOpen className="w-4 h-4 text-zinc-600 flex-shrink-0" />
      )}
      <span
        className={`flex-1 text-sm truncate ${
          child.isGitRepo ? "text-zinc-200" : "text-zinc-400"
        }`}
      >
        {child.name}
      </span>
      {child.isGitRepo && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(child.path);
          }}
          className="hidden group-hover:block text-xs text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20"
        >
          Open
        </button>
      )}
      <ChevronRight className="w-3 h-3 text-zinc-700 group-hover:text-zinc-500 flex-shrink-0" />
    </div>
  );
}
