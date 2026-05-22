import { useState, useEffect } from "react";
import { useRepoStore } from "./stores/repoStore";
import { MainLayout } from "./components/layout/MainLayout";
import type { View } from "./components/layout/MainLayout";
import { RepoOpener } from "./components/repo/RepoOpener";
import { StatusView } from "./components/status/StatusView";
import { DiffViewer } from "./components/diff/DiffViewer";
import { CommitPanel } from "./components/commit/CommitPanel";
import { BranchView } from "./components/branches/BranchView";
import { LogView } from "./components/log/LogView";
import { RemoteActions } from "./components/remote/RemoteActions";
import { SettingsView } from "./components/settings/SettingsView";
import { StatsView } from "./components/stats/StatsView";
import { StashView } from "./components/stashes/StashView";
import { RebaseView } from "./components/rebase/RebaseView";
import { ExplorerView } from "./components/explorer/ExplorerView";
import { GraphView } from "./components/graph/GraphView";
import { AgentTerminalView } from "./components/agents/AgentTerminalView";
import { useSettingsStore } from "./stores/settingsStore";
import type { GitFile } from "./types/git";
import { connectRepoEvents, disconnectRepoEvents } from "./services/sse";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ConfirmDialog } from "./components/common/Dialog";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import * as api from "./services/api";
import { loadRecentRepos } from "./utils/recentRepos";

const STATUS_PANEL_WIDTH_KEY = "quanta-layout-status-width";
const BRANCH_PANEL_WIDTH_KEY = "quanta-layout-branch-width";
const COMMIT_PANEL_HEIGHT_KEY = "quanta-layout-commit-height";

function loadStoredNumber(key: string, fallback: number) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type DragState =
  | { kind: "statusWidth"; startPointer: number; startSize: number }
  | { kind: "branchWidth"; startPointer: number; startSize: number }
  | { kind: "commitHeight"; startPointer: number; startSize: number }
  | null;

export default function App() {
  const repoPath = useRepoStore((s) => s.repoPath);
  const setRepo = useRepoStore((s) => s.setRepo);
  const status = useRepoStore((s) => s.status);
  const lastStatusUpdateAt = useRepoStore((s) => s.lastStatusUpdateAt);
  const settings = useSettingsStore((s) => s.settings);
  const [view, setView] = useState<View>("status");
  const [selectedFile, setSelectedFile] = useState<GitFile | null>(null);
  const [explorerInitialFilePath, setExplorerInitialFilePath] = useState<string | null>(null);
  const [statusPanelWidth, setStatusPanelWidth] = useState(() => loadStoredNumber(STATUS_PANEL_WIDTH_KEY, 320));
  const [branchPanelWidth, setBranchPanelWidth] = useState(() => loadStoredNumber(BRANCH_PANEL_WIDTH_KEY, 384));
  const [commitPanelHeight, setCommitPanelHeight] = useState(() => loadStoredNumber(COMMIT_PANEL_HEIGHT_KEY, 180));
  const [dragState, setDragState] = useState<DragState>(null);
  const [confirmDiscardPath, setConfirmDiscardPath] = useState<string | null>(null);

  useKeyboardShortcuts({
    view,
    onViewChange: setView,
    selectedFile,
    onSelectFile: setSelectedFile,
    onConfirmDiscard: (path) => setConfirmDiscardPath(path),
  });

  useEffect(() => {
    setSelectedFile(null);
  }, [repoPath]);

  useEffect(() => {
    if (!status) return;

    if (status.files.length === 0) {
      setSelectedFile(null);
      setView((currentView) => (currentView === "diff" ? "status" : currentView));
      return;
    }

    if (selectedFile && !status.files.some((file) => file.path === selectedFile.path)) {
      setSelectedFile(null);
    }
  }, [selectedFile, status]);

  useEffect(() => {
    if (!repoPath || !settings.autoRefresh) return;

    const store = useRepoStore.getState();
    connectRepoEvents(repoPath, () => {
      void store.pollRepo();
    });

    return () => {
      disconnectRepoEvents();
    };
  }, [repoPath, settings.autoRefresh]);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (dragState.kind === "statusWidth") {
        const nextWidth = clamp(
          dragState.startSize + (event.clientX - dragState.startPointer),
          240,
          640,
        );
        setStatusPanelWidth(nextWidth);
        return;
      }

      if (dragState.kind === "branchWidth") {
        const nextWidth = clamp(
          dragState.startSize + (event.clientX - dragState.startPointer),
          280,
          720,
        );
        setBranchPanelWidth(nextWidth);
        return;
      }

      const nextHeight = clamp(
        dragState.startSize - (event.clientY - dragState.startPointer),
        140,
        420,
      );
      setCommitPanelHeight(nextHeight);
    };

    const handlePointerUp = () => setDragState(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState]);

  useEffect(() => {
    try {
      localStorage.setItem(STATUS_PANEL_WIDTH_KEY, String(statusPanelWidth));
      localStorage.setItem(BRANCH_PANEL_WIDTH_KEY, String(branchPanelWidth));
      localStorage.setItem(COMMIT_PANEL_HEIGHT_KEY, String(commitPanelHeight));
    } catch {}
  }, [statusPanelWidth, branchPanelWidth, commitPanelHeight]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI) return;
    window.electronAPI.setRecentRepos(loadRecentRepos());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI) return;
    window.electronAPI.setCurrentRepo(repoPath ?? null);
  }, [repoPath]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI) return;
    const electronAPI = window.electronAPI;

    const removeOpenRepo = electronAPI.onOpenRepo(async (path) => {
      if (!path) return;
      try {
        const result = await api.validateRepo(path);
        if (result.valid) {
          setRepo(result.resolvedPath);
        } else {
          electronAPI.notify("Quanta Control", `Not a valid repo: ${path}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        electronAPI.notify("Quanta Control", `Failed to open repo: ${message}`);
      }
    });

    const removePullRepo = electronAPI.onPullRepo(async () => {
      const current = useRepoStore.getState().repoPath;
      if (!current) return;
      try {
        await api.pull(current);
        electronAPI.notify("Quanta Control", `Pulled ${current}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Pull failed";
        electronAPI.notify("Quanta Control", `Pull failed: ${message}`);
      }
    });

    return () => {
      removeOpenRepo();
      removePullRepo();
    };
  }, [setRepo]);

  if (!repoPath) {
    return <RepoOpener onSelect={setRepo} />;
  }

  return (
    <>
    <MainLayout currentView={view} onViewChange={setView}>
      <div className="h-full flex flex-col bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900/20">
        <header className="h-10 border-b border-zinc-800/60 flex items-center justify-between px-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRepo("")}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ← Change Repo
            </button>
          </div>
          <RemoteActions />
        </header>

        <div className="flex-1 flex overflow-hidden">
          {view === "status" && (
            <>
              <div
                className="flex-shrink-0 overflow-y-auto border-r border-zinc-800"
                style={{ width: statusPanelWidth }}
              >
                <ErrorBoundary><StatusView
                  onSelectFile={(file) => {
                    setSelectedFile(file);
                    setView("diff");
                  }}
                  selectedFile={selectedFile}
                /></ErrorBoundary>
              </div>
              <ResizeHandle
                orientation="vertical"
                onPointerDown={(event) =>
                  setDragState({
                    kind: "statusWidth",
                    startPointer: event.clientX,
                    startSize: statusPanelWidth,
                  })
                }
              />
              <div className="flex min-w-0 flex-1 flex-col">
                {status?.files.length === 0 ? (
                  <CleanWorkspace />
                ) : (
                  <>
                    <div className="min-h-0 flex-1">
                      <ErrorBoundary><DiffViewer
                        repoPath={repoPath}
                        filePath={selectedFile?.path ?? null}
                        showAllWhenNoFile={false}
                        emptyStateMessage="Select a changed file to inspect its diff"
                        refreshKey={lastStatusUpdateAt}
                      /></ErrorBoundary>
                    </div>
                    <ResizeHandle
                      orientation="horizontal"
                      onPointerDown={(event) =>
                        setDragState({
                          kind: "commitHeight",
                          startPointer: event.clientY,
                          startSize: commitPanelHeight,
                        })
                      }
                    />
                    <div
                      className="flex-shrink-0 overflow-y-auto"
                      style={{ height: commitPanelHeight }}
                    >
                      <ErrorBoundary><CommitPanel onCommitted={() => setSelectedFile(null)} /></ErrorBoundary>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {view === "diff" && (
            <FlatView><DiffViewer
              repoPath={repoPath}
              filePath={selectedFile?.path ?? null}
              refreshKey={lastStatusUpdateAt}
            /></FlatView>
          )}

          {view === "branches" && (
            <>
              <div className="flex-shrink-0" style={{ width: branchPanelWidth }}>
                <ErrorBoundary><BranchView /></ErrorBoundary>
              </div>
              <ResizeHandle
                orientation="vertical"
                onPointerDown={(event) =>
                  setDragState({
                    kind: "branchWidth",
                    startPointer: event.clientX,
                    startSize: branchPanelWidth,
                  })
                }
              />
              <div className="flex flex-1 items-center justify-center bg-zinc-950/40">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 text-center">
                  <div className="text-sm font-medium text-zinc-300">Branch Workspace</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Drag the divider to give the branch panel more or less space.
                  </div>
                </div>
              </div>
            </>
          )}

          {view === "log" && <FlatView><LogView /></FlatView>}
          {view === "stats" && <FlatView><StatsView onOpenSettings={() => setView("settings")} /></FlatView>}
          {view === "stashes" && <FlatView><StashView /></FlatView>}
          {view === "rebase" && <FlatView><RebaseView /></FlatView>}
          {view === "settings" && <FlatView><SettingsView /></FlatView>}
          {view === "explorer" && <FlatView><ExplorerView initialFilePath={explorerInitialFilePath} onConsumed={() => setExplorerInitialFilePath(null)} /></FlatView>}
          {view === "graph" && (
            <FlatView>
              <GraphView
                onNavigate={(path) => {
                  setExplorerInitialFilePath(path);
                  setView("explorer");
                }}
              />
            </FlatView>
          )}
          {view === "agents" && <FlatView><AgentTerminalView /></FlatView>}
        </div>
      </div>
    </MainLayout>

    {confirmDiscardPath && (
      <ConfirmDialog
        title="Discard Changes"
        message={`Discard changes to ${confirmDiscardPath}?`}
        confirmLabel="Discard"
        danger
        onConfirm={() => {
          const path = confirmDiscardPath;
          setConfirmDiscardPath(null);
          void api.discardChanges(repoPath!, [path]).then(() => {
            setSelectedFile(null);
            useRepoStore.getState().refresh();
          }).catch(() => {
            useRepoStore.getState().refresh();
          });
        }}
        onCancel={() => setConfirmDiscardPath(null)}
      />
    )}
  </>
  );
}

function ResizeHandle({
  orientation,
  onPointerDown,
}: {
  orientation: "vertical" | "horizontal";
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={`group relative flex-shrink-0 select-none transition-colors duration-150 ${
        orientation === "vertical"
          ? "h-full w-1.5 cursor-col-resize"
          : "h-1.5 w-full cursor-row-resize"
      }`}
      role="separator"
      aria-orientation={orientation}
    >
      <div
        className={`absolute inset-0 transition-colors duration-150 group-hover:bg-emerald-500/20 ${
          orientation === "vertical" ? "border-x border-zinc-800/40" : "border-y border-zinc-800/40"
        }`}
      />
    </div>
  );
}

function CleanWorkspace() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-6 py-5 text-center shadow-lg shadow-black/10">
        <div className="text-sm font-medium text-zinc-200">Working tree is clean</div>
        <div className="mt-1 text-xs text-zinc-500">
          No local changes to review right now. This view will repopulate when new edits land.
        </div>
      </div>
    </div>
  );
}

function FlatView({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1">
      <ErrorBoundary>{children}</ErrorBoundary>
    </div>
  );
}
