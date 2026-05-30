import { useState, useEffect, useCallback, useMemo } from "react";
import { useRepoStore } from "../../stores/repoStore";
import { ConfirmDialog } from "../common/Dialog";
import * as api from "../../services/api";
import type {
  BlameLine,
  CommitInfo,
  GrepMatch,
  PickaxeMode,
  FileDiff,
  TodoItem,
  Tag,
} from "../../types/git";
import {
  Search,
  FolderOpen,
  File,
  GitCommit,
  Hash,
  Clock,
  ArrowRightLeft,
  Loader2,
  TagIcon,
  AlertCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { BlameView } from "./BlameView";
import { CommitList } from "./CommitList";
import { CompareView } from "./CompareView";
import { FileTree } from "./FileTree";
import { buildFileTree } from "./buildFileTree";
import { PickaxeResultsPanel } from "./PickaxeResultsPanel";
import { SearchResultsPanel } from "./SearchResultsPanel";
import { TodosPanel } from "./TodosPanel";
import { TagsPanel } from "./TagsPanel";

// ── Main ExplorerView ──

const FILE_HISTORY_HEIGHT_KEY = "centauri-explorer-file-history-height";
const EXPLORER_LEFT_PANEL_COLLAPSED_KEY = "centauri-explorer-left-panel-collapsed";

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

function loadStoredBoolean(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type ExplorerMode = "browse" | "search" | "pickaxe" | "compare" | "todos" | "tags";

function ResizeHandle({ onPointerDown }: { onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="group relative h-1.5 w-full flex-shrink-0 cursor-row-resize select-none"
      role="separator"
      aria-orientation="horizontal"
      title="Resize file history"
    >
      <div className="absolute inset-0 border-y border-zinc-800/40 transition-colors group-hover:bg-emerald-500/20" />
    </div>
  );
}

export function ExplorerView({ initialFilePath, onConsumed }: { initialFilePath?: string | null; onConsumed?: () => void }) {
  const repoPath = useRepoStore((s) => s.repoPath);
  const refresh = useRepoStore((s) => s.refresh);

  // Mode
  const [mode, setMode] = useState<ExplorerMode>("browse");

  // File tree
  const [treeFiles, setTreeFiles] = useState<string[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildFileTree(treeFiles), [treeFiles]);

  // Selected file
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileHistoryHeight, setFileHistoryHeight] = useState(() => loadStoredNumber(FILE_HISTORY_HEIGHT_KEY, 260));
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(() => loadStoredBoolean(EXPLORER_LEFT_PANEL_COLLAPSED_KEY, false));
  const [historyDrag, setHistoryDrag] = useState<{ startPointer: number; startSize: number } | null>(null);

  // Blame
  const [blameLines, setBlameLines] = useState<BlameLine[]>([]);
  const [blameLoading, setBlameLoading] = useState(false);
  const [blameError, setBlameError] = useState<string | null>(null);

  // File history
  const [fileHistory, setFileHistory] = useState<CommitInfo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Search / Pickaxe
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GrepMatch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [pickaxeMode, setPickaxeMode] = useState<PickaxeMode>("S");

  // Compare
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [compareDiffs, setCompareDiffs] = useState<FileDiff[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // TODOs
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [todoLoading, setTodoLoading] = useState(false);
  const [todoError, setTodoError] = useState<string | null>(null);
  const [todoTruncated, setTodoTruncated] = useState(false);

  // Tags
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagLoading, setTagLoading] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagMessage, setNewTagMessage] = useState("");
  const [newTagRef, setNewTagRef] = useState("");
  const [tagCreating, setTagCreating] = useState(false);
  const [deletingTagName, setDeletingTagName] = useState<string | null>(null);
  const [confirmDeleteTag, setConfirmDeleteTag] = useState<string | null>(null);

  // Line history (for blame view)
  const [lineHistoryRange, setLineHistoryRange] = useState<{ start: number; end: number } | null>(null);
  const [lineHistory, setLineHistory] = useState<CommitInfo[]>([]);
  const [lineHistoryLoading, setLineHistoryLoading] = useState(false);
  const [lineHistoryError, setLineHistoryError] = useState<string | null>(null);
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());

  // ── Load file tree ──

  const loadTree = useCallback(async () => {
    if (!repoPath) return;
    setTreeLoading(true);
    try {
      const result = await api.getFileTree(repoPath);
      setTreeFiles(result.files);
      // Auto-expand first level
      const firstLevel = new Set<string>();
      for (const f of result.files) {
        const slash = f.indexOf("/");
        if (slash > 0) {
          firstLevel.add(f.slice(0, slash));
        }
      }
      setExpandedDirs(firstLevel);
    } catch {
      setTreeFiles([]);
    } finally {
      setTreeLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  // ── Load blame + history when file selected ──

  useEffect(() => {
    setSelectedLines(new Set());
    setLineHistoryRange(null);

    if (!repoPath || !selectedFile) {
      setBlameLines([]);
      setFileHistory([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setBlameLoading(true);
      setBlameError(null);
      setHistoryLoading(true);

      try {
        const [blameResult, historyResult] = await Promise.all([
          api.getBlame(repoPath, selectedFile),
          api.getFileHistory(repoPath, selectedFile),
        ]);

        if (!cancelled) {
          setBlameLines(blameResult.lines);
          setFileHistory(historyResult.commits);
        }
      } catch (err) {
        if (!cancelled) {
          setBlameError(err instanceof Error ? err.message : "Failed to load blame");
        }
      } finally {
        if (!cancelled) {
          setBlameLoading(false);
          setHistoryLoading(false);
        }
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [repoPath, selectedFile]);

  useEffect(() => {
    if (!historyDrag) return;

    const handlePointerMove = (event: PointerEvent) => {
      const nextHeight = clamp(
        historyDrag.startSize - (event.clientY - historyDrag.startPointer),
        120,
        Math.max(220, Math.floor(window.innerHeight * 0.7)),
      );
      setFileHistoryHeight(nextHeight);
    };

    const handlePointerUp = () => setHistoryDrag(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [historyDrag]);

  useEffect(() => {
    try {
      localStorage.setItem(FILE_HISTORY_HEIGHT_KEY, String(fileHistoryHeight));
    } catch {}
  }, [fileHistoryHeight]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPLORER_LEFT_PANEL_COLLAPSED_KEY, String(leftPanelCollapsed));
    } catch {}
  }, [leftPanelCollapsed]);

  // ── Search ──

  const runSearch = useCallback(async () => {
    if (!repoPath || !searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);
    setSearchTruncated(false);

    try {
      const result = await api.grepCode(repoPath, searchQuery.trim());
      setSearchResults(result.matches);
      setSearchTruncated(Boolean(result.truncated));
      if (result.matches.length === 0) {
        setSearchError("No matches found");
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }, [repoPath, searchQuery]);

  // ── Pickaxe ──

  const [pickaxeResults, setPickaxeResults] = useState<CommitInfo[]>([]);
  const [pickaxeLoading, setPickaxeLoading] = useState(false);
  const [pickaxeError, setPickaxeError] = useState<string | null>(null);

  const runPickaxe = useCallback(async () => {
    if (!repoPath || !searchQuery.trim()) return;
    setPickaxeLoading(true);
    setPickaxeError(null);
    setPickaxeResults([]);

    try {
      const result = await api.pickaxeSearch(repoPath, searchQuery.trim(), pickaxeMode);
      setPickaxeResults(result.commits);
      if (result.commits.length === 0) {
        setPickaxeError("No commits found");
      }
    } catch (err) {
      setPickaxeError(err instanceof Error ? err.message : "Pickaxe search failed");
    } finally {
      setPickaxeLoading(false);
    }
  }, [repoPath, searchQuery, pickaxeMode]);

  // ── Compare ──

  const runCompare = useCallback(async () => {
    if (!repoPath || !compareFrom.trim() || !compareTo.trim()) return;
    setCompareLoading(true);
    setCompareError(null);
    setCompareDiffs([]);

    try {
      const result = await api.compareRefs(repoPath, compareFrom.trim(), compareTo.trim());
      setCompareDiffs(result.diffs);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : "Compare failed");
    } finally {
      setCompareLoading(false);
    }
  }, [repoPath, compareFrom, compareTo]);

  // ── Load TODOs when entering that mode ──

  useEffect(() => {
    if (mode !== "todos" || !repoPath) return;

    let cancelled = false;
    setTodoLoading(true);
    setTodoError(null);
    setTodoTruncated(false);

    api.scanTodos(repoPath)
      .then((result) => {
        if (!cancelled) {
          setTodoItems(result.items);
          setTodoTruncated(Boolean(result.truncated));
          if (result.items.length === 0) {
            setTodoError("No TODOs or FIXMEs found");
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setTodoError(err instanceof Error ? err.message : "Failed to scan");
      })
      .finally(() => {
        if (!cancelled) setTodoLoading(false);
      });

    return () => { cancelled = true; };
  }, [mode, repoPath]);

  // ── Load Tags when entering that mode ──

  useEffect(() => {
    if (mode !== "tags" || !repoPath) return;

    let cancelled = false;
    setTagLoading(true);
    setTagError(null);

    api.getTags(repoPath)
      .then((result) => {
        if (!cancelled) {
          setTags(result.tags);
        }
      })
      .catch((err) => {
        if (!cancelled) setTagError(err instanceof Error ? err.message : "Failed to load tags");
      })
      .finally(() => {
        if (!cancelled) setTagLoading(false);
      });

    return () => { cancelled = true; };
  }, [mode, repoPath]);

  const createTagAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath || !newTagName.trim()) return;
    setTagCreating(true);
    setTagError(null);
    try {
      await api.createTag(
        repoPath,
        newTagName.trim(),
        newTagMessage.trim() || undefined,
        newTagRef.trim() || undefined,
      );
      setNewTagName("");
      setNewTagMessage("");
      setNewTagRef("");
      const result = await api.getTags(repoPath);
      setTags(result.tags);
      void refresh();
    } catch (err) {
      setTagError(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setTagCreating(false);
    }
  };

  const deleteTagAction = async (name: string) => {
    if (!repoPath) return;
    setTagError(null);
    setDeletingTagName(name);
    try {
      await api.deleteTag(repoPath, name);
      setTags((prev) => prev.filter((t) => t.name !== name));
      void refresh();
    } catch (err) {
      setTagError(err instanceof Error ? err.message : "Failed to delete tag");
    } finally {
      setDeletingTagName(null);
    }
  };

  // ── Line history ──

  const loadLineHistory = useCallback(async () => {
    if (!repoPath || !selectedFile || !lineHistoryRange) return;
    setLineHistoryLoading(true);
    setLineHistoryError(null);
    setLineHistory([]);

    try {
      const result = await api.getLineHistory(
        repoPath,
        selectedFile,
        lineHistoryRange.start,
        lineHistoryRange.end,
      );
      setLineHistory(result.commits);
      if (result.commits.length === 0) {
        setLineHistoryError("No commits affected these lines");
      }
    } catch (err) {
      setLineHistoryError(err instanceof Error ? err.message : "Failed to trace line history");
    } finally {
      setLineHistoryLoading(false);
    }
  }, [repoPath, selectedFile, lineHistoryRange]);

  useEffect(() => {
    if (lineHistoryRange && selectedFile) {
      void loadLineHistory();
    } else {
      setLineHistory([]);
      setLineHistoryError(null);
    }
  }, [lineHistoryRange, selectedFile, loadLineHistory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "pickaxe") {
      void runPickaxe();
    } else if (mode === "search") {
      void runSearch();
    }
  };

  const handleCompareSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runCompare();
  };

  const toggleLine = (line: number) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(line)) {
        next.delete(line);
      } else {
        next.add(line);
      }
      return next;
    });
  };

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const openFileInExplorer = useCallback((path: string) => {
    setSelectedFile(path);
    setMode("browse");
    setExpandedDirs((prev) => {
      const dirs = new Set(prev);
      const parts = path.split("/");
      let current = "";
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i]!;
        dirs.add(current);
      }
      return dirs;
    });
  }, []);

  useEffect(() => {
    if (initialFilePath) {
      openFileInExplorer(initialFilePath);
      onConsumed?.();
    }
  }, [initialFilePath, openFileInExplorer, onConsumed]);

  if (!repoPath) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Open a repository to explore
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* ── Header with mode tabs ── */}
      <div className="flex-shrink-0 border-b border-zinc-800/60">
        <div className="flex items-center gap-1 px-3 py-1.5">
          {([
            ["browse", "Browse"],
            ["search", "Code Search"],
            ["pickaxe", "Pickaxe"],
            ["compare", "Compare"],
            ["todos", "TODOs"],
            ["tags", "Tags"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                mode === id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setLeftPanelCollapsed((collapsed) => !collapsed)}
            className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            title={leftPanelCollapsed ? "Show explorer panel" : "Hide explorer panel"}
            aria-label={leftPanelCollapsed ? "Show explorer panel" : "Hide explorer panel"}
          >
            {leftPanelCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* ── Search / Compare bar ── */}
      {mode !== "browse" && (
        <div className="flex-shrink-0 border-b border-zinc-800/40 px-3 py-2">
          {mode === "search" && (
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search code (regex)…"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-md py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <button
                type="submit"
                disabled={searchLoading || !searchQuery.trim()}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-md text-xs font-medium text-white transition-colors"
              >
                {searchLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Search"
                )}
              </button>
            </form>
          )}

          {mode === "pickaxe" && (
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder='Find commits that added/removed…'
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-md py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <select
                value={pickaxeMode}
                onChange={(e) => setPickaxeMode(e.target.value as PickaxeMode)}
                className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="S">-S (string)</option>
                <option value="G">-G (regex)</option>
              </select>
              <button
                type="submit"
                disabled={pickaxeLoading || !searchQuery.trim()}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-md text-xs font-medium text-white transition-colors"
              >
                {pickaxeLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Search"
                )}
              </button>
            </form>
          )}

          {mode === "compare" && (
            <form onSubmit={handleCompareSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={compareFrom}
                onChange={(e) => setCompareFrom(e.target.value)}
                placeholder="From (branch/commit)…"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md py-1.5 px-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
              <ArrowRightLeft className="h-4 w-4 text-zinc-500 flex-shrink-0" />
              <input
                type="text"
                value={compareTo}
                onChange={(e) => setCompareTo(e.target.value)}
                placeholder="To (branch/commit)…"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md py-1.5 px-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
              <button
                type="submit"
                disabled={compareLoading || !compareFrom.trim() || !compareTo.trim()}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-md text-xs font-medium text-white transition-colors"
              >
                {compareLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Compare"
                )}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel: file tree or search results */}
        {!leftPanelCollapsed && (
          <div className="w-64 flex-shrink-0 border-r border-zinc-800/40 overflow-auto bg-zinc-950/60">
            {mode === "browse" && (
              treeLoading ? (
                <div className="flex items-center justify-center h-full text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <FileTree
                  nodes={tree}
                  selectedFile={selectedFile}
                  onSelectFile={setSelectedFile}
                  expandedDirs={expandedDirs}
                  onToggleDir={toggleDir}
                />
              )
            )}

            {mode === "search" && (
              <SearchResultsPanel
                loading={searchLoading}
                error={searchError}
                results={searchResults}
                truncated={searchTruncated}
                onOpenFile={openFileInExplorer}
              />
            )}

            {mode === "pickaxe" && (
              <PickaxeResultsPanel
                loading={pickaxeLoading}
                error={pickaxeError}
                commits={pickaxeResults}
              />
            )}

            {mode === "compare" && (
              <div className="p-4 text-xs text-zinc-500 text-center">
                Enter two refs above to compare
              </div>
            )}

            {mode === "todos" && (
              <TodosPanel
                loading={todoLoading}
                error={todoError}
                items={todoItems}
                truncated={todoTruncated}
                onOpenFile={openFileInExplorer}
              />
            )}

            {mode === "tags" && (
              <TagsPanel
                loading={tagLoading}
                error={tagError}
                tags={tags}
                newTagName={newTagName}
                newTagMessage={newTagMessage}
                newTagRef={newTagRef}
                creating={tagCreating}
                deletingTagName={deletingTagName}
                onNewTagNameChange={setNewTagName}
                onNewTagMessageChange={setNewTagMessage}
                onNewTagRefChange={setNewTagRef}
                onCreateTag={createTagAction}
                onDeleteTag={(name: string) => setConfirmDeleteTag(name)}
              />
            )}
          </div>
        )}

        {/* Right panel: content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {mode === "browse" && (
            <>
              {!selectedFile ? (
                <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                  <div className="text-center">
                    <FolderOpen className="h-8 w-8 mx-auto mb-2 text-zinc-700" />
                    <p>Select a file to see blame and history</p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col">
                  {/* File header */}
                  <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/40 bg-zinc-900/40">
                    <File className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-300 font-mono truncate">{selectedFile}</span>
                  </div>

                  {/* Blame (top half) */}
                  <div className="flex-1 min-h-0 overflow-auto border-b border-zinc-800/40">
                    <div className="flex items-center justify-between px-3 py-1 border-b border-zinc-800/30 bg-zinc-900/20">
                      <div className="flex items-center gap-1.5">
                        <Hash className="h-3 w-3 text-zinc-500" />
                        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Blame</span>
                      </div>
                      {selectedLines.size > 0 && (
                        <button
                          onClick={() => {
                            const sorted = [...selectedLines].sort((a, b) => a - b);
                            setLineHistoryRange({ start: sorted[0]!, end: sorted[sorted.length - 1]! });
                          }}
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                        >
                          <Clock className="h-2.5 w-2.5" />
                          {(() => {
                            const sorted = [...selectedLines].sort((a, b) => a - b);
                            return `Trace L${sorted[0]}–L${sorted[sorted.length - 1]} (${selectedLines.size} selected)`;
                          })()}
                        </button>
                      )}
                    </div>
                    <BlameView
                      lines={blameLines}
                      loading={blameLoading}
                      error={blameError}
                      selectedLines={selectedLines}
                      onToggleLine={toggleLine}
                    />
                  </div>

                  {/* Line History (appears when tracing) */}
                  {lineHistoryRange && (
                    <div className="h-[120px] flex-shrink-0 overflow-hidden border-b border-zinc-800/40">
                      <div className="flex items-center justify-between px-3 py-1 border-b border-zinc-800/30 bg-zinc-900/20">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-zinc-500" />
                          <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                            Line History (L{lineHistoryRange.start}–{lineHistoryRange.end})
                          </span>
                        </div>
                        <button
                          onClick={() => { setLineHistoryRange(null); setSelectedLines(new Set()); }}
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                      <div className="overflow-auto h-[calc(100%-25px)]">
                        <CommitList
                          commits={lineHistory}
                          loading={lineHistoryLoading}
                          emptyMessage={lineHistoryError ?? "No commits found"}
                        />
                      </div>
                    </div>
                  )}

                  {/* History (bottom panel) */}
                  <ResizeHandle onPointerDown={(event) => setHistoryDrag({ startPointer: event.clientY, startSize: fileHistoryHeight })} />
                  <div className="min-h-[120px] flex-shrink-0 overflow-hidden" style={{ height: fileHistoryHeight }}>
                    <div className="flex items-center gap-1.5 px-3 py-1 border-b border-zinc-800/30 bg-zinc-900/20">
                      <Clock className="h-3 w-3 text-zinc-500" />
                      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">File History</span>
                      {fileHistory.length > 0 && (
                        <span className="text-[10px] text-zinc-600">{fileHistory.length} commits</span>
                      )}
                    </div>
                    <div className="overflow-auto h-[calc(100%-25px)]">
                      <CommitList commits={fileHistory} loading={historyLoading} emptyMessage="No history found" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === "search" && (
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
              <div className="text-center">
                <Search className="h-8 w-8 mx-auto mb-2 text-zinc-700" />
                <p>Search results appear in the left panel</p>
                <p className="text-xs mt-1 text-zinc-600">Click a result to browse that file</p>
              </div>
            </div>
          )}

          {mode === "pickaxe" && (
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
              <div className="text-center">
                <GitCommit className="h-8 w-8 mx-auto mb-2 text-zinc-700" />
                <p>Commit results appear in the left panel</p>
              </div>
            </div>
          )}

          {mode === "compare" && (
            <CompareView diffs={compareDiffs} loading={compareLoading} error={compareError} />
          )}

          {mode === "todos" && (
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-zinc-700" />
                <p>TODO items appear in the left panel</p>
                <p className="text-xs mt-1 text-zinc-600">Click an item to browse that file</p>
              </div>
            </div>
          )}

          {mode === "tags" && (
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
              <div className="text-center">
                <TagIcon className="h-8 w-8 mx-auto mb-2 text-zinc-700" />
                <p>Create and manage tags from the left panel</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmDeleteTag && (
        <ConfirmDialog
          title="Delete Tag"
          message={`Delete tag "${confirmDeleteTag}"?`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            const name = confirmDeleteTag;
            setConfirmDeleteTag(null);
            void deleteTagAction(name);
          }}
          onCancel={() => setConfirmDeleteTag(null)}
        />
      )}
    </div>
  );
}
