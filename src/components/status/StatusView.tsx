import {
  Plus,
  Minus,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Trash2,
  EyeOff,
  File,
  Folder,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRepoStore } from "../../stores/repoStore";
import { ConfirmDialog } from "../common/Dialog";
import * as api from "../../services/api";
import { ContextMenu, type ContextMenuEntry } from "../common/ContextMenu";
import type { GitFile } from "../../types/git";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  added: { label: "A", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  modified: { label: "M", color: "text-yellow-400", bg: "bg-yellow-500/10" },
  deleted: { label: "D", color: "text-red-400", bg: "bg-red-500/10" },
  renamed: { label: "R", color: "text-blue-400", bg: "bg-blue-500/10" },
  untracked: { label: "U", color: "text-purple-400", bg: "bg-purple-500/10" },
  conflicted: { label: "C", color: "text-orange-400", bg: "bg-orange-500/10" },
  copied: { label: "C", color: "text-blue-400", bg: "bg-blue-500/10" },
};

function FileItem({
  file,
  repoPath,
  onSelect,
  isSelected,
  onAction,
}: {
  file: GitFile;
  repoPath: string;
  onSelect: (file: GitFile) => void;
  isSelected: boolean;
  onAction: () => void;
}) {
  const config: { label: string; color: string; bg: string } =
    STATUS_CONFIG[file.status] ?? { label: "M", color: "text-yellow-400", bg: "bg-yellow-500/10" };

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [gitignoreError, setGitignoreError] = useState("");

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const addPathToGitignore = useCallback(
    async (pattern: string) => {
      setGitignoreError("");
      try {
        await api.addToGitignore(repoPath, [pattern]);
        await onAction();
      } catch (err) {
        setGitignoreError(err instanceof Error ? err.message : "Failed to update .gitignore");
      }
    },
    [repoPath, onAction],
  );

  const menuItems: ContextMenuEntry[] = [
    {
      label: "Stage",
      icon: <Plus className="w-3.5 h-3.5" />,
      onClick: () => { api.stageFiles(repoPath, [file.path]).then(onAction).catch(() => {}); },
    },
    {
      label: "Discard Changes",
      icon: <Trash2 className="w-3.5 h-3.5" />,
      onClick: () => setConfirmDiscard(true),
      danger: true,
    },
    { separator: true },
    {
      label: `Ignore "${file.path}"`,
      icon: <EyeOff className="w-3.5 h-3.5" />,
      onClick: () => addPathToGitignore(file.path),
    },
    {
      label: `Ignore "${getFilename(file.path)}"`,
      icon: <File className="w-3.5 h-3.5" />,
      onClick: () => addPathToGitignore(getFilename(file.path)),
    },
  ];

  if (file.path.includes("/")) {
    menuItems.push({
      label: `Ignore "${getDirGlob(file.path)}"`,
      icon: <Folder className="w-3.5 h-3.5" />,
      onClick: () => addPathToGitignore(getDirGlob(file.path)),
    });
  }

  return (
    <>
      {gitignoreError && (
        <div className="px-3 py-1 text-xs text-red-400 bg-red-500/10 border-b border-red-500/20">
          {gitignoreError}
        </div>
      )}
      <div
        onClick={() => onSelect(file)}
        onContextMenu={handleContextMenu}
        className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm group transition-all duration-150 ease-out ${
          isSelected
            ? "bg-zinc-800/80 border-l-2 border-emerald-500"
            : "hover:bg-zinc-900/60 border-l-2 border-transparent"
        }`}
      >
        <span
          className={`w-5 text-center text-xs font-mono font-bold ${config.color}`}
        >
          {config.label}
        </span>
        <span className="flex-1 min-w-0 truncate text-sm" title={file.path}>
          <span className="text-zinc-300">{getFilename(file.path)}</span>
          {getDir(file.path) && (
            <span className="text-zinc-600 ml-1 text-xs">{getDir(file.path)}</span>
          )}
        </span>
        {(file.additions > 0 || file.deletions > 0) && (
          <span className="hidden group-hover:hidden sm:inline-flex items-center gap-1 text-xs font-mono flex-shrink-0 mr-1">
            {file.additions > 0 && (
              <span className="text-emerald-500">+{file.additions}</span>
            )}
            {file.deletions > 0 && (
              <span className="text-red-500">-{file.deletions}</span>
            )}
          </span>
        )}
        <div className="hidden group-hover:flex items-center gap-1">
          {file.stagedStatus === "staged" || file.stagedStatus === "partially_staged" ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                api.unstageFiles(repoPath, [file.path]).then(onAction).catch(() => {});
              }}
              className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
              title="Unstage"
            >
              <Minus className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                api.stageFiles(repoPath, [file.path]).then(onAction).catch(() => {});
              }}
              className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
              title="Stage"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDiscard(true);
            }}
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400"
            title="Discard"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {ctxMenu &&
        createPortal(
          <ContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            items={menuItems}
            onClose={() => setCtxMenu(null)}
          />,
          document.body,
        )}

      {confirmDiscard && (
        <ConfirmDialog
          title="Discard Changes"
          message={`Discard changes to ${file.path}?`}
          confirmLabel="Discard"
          danger
          onConfirm={() => {
            setConfirmDiscard(false);
            api.discardChanges(repoPath, [file.path]).then(onAction).catch(() => {});
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </>
  );
}

function getFilename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function getDir(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/") + "/";
}

function getDirGlob(filePath: string): string {
  const idx = filePath.indexOf("/");
  return idx === -1 ? filePath : filePath.slice(0, idx + 1);
}

export function StatusView({
  onSelectFile,
  selectedFile,
}: {
  onSelectFile: (file: GitFile | null) => void;
  selectedFile: GitFile | null;
}) {
  const repoPath = useRepoStore((s) => s.repoPath);
  const status = useRepoStore((s) => s.status);
  const refreshStatus = useRepoStore((s) => s.refreshStatus);
  const lastStatusUpdateAt = useRepoStore((s) => s.lastStatusUpdateAt);
  const lastChangeDetectedAt = useRepoStore((s) => s.lastChangeDetectedAt);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);
  const [showChangeNotice, setShowChangeNotice] = useState(false);

  useEffect(() => {
    if (!lastChangeDetectedAt) return;
    setShowChangeNotice(true);
    const timer = window.setTimeout(() => setShowChangeNotice(false), 5000);
    return () => window.clearTimeout(timer);
  }, [lastChangeDetectedAt]);

  if (!repoPath || !status) return null;

  const stagedFiles = status.files.filter(
    (f) => f.stagedStatus === "staged" || f.stagedStatus === "partially_staged",
  );
  const unstagedFiles = status.files.filter(
    (f) => f.stagedStatus === "unstaged" || f.stagedStatus === "partially_staged",
  );

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-zinc-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Changes</h2>
          <span className="text-xs text-zinc-500">
            {status.files.length} file{status.files.length !== 1 ? "s" : ""}
          </span>
          {showChangeNotice && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
              <Sparkles className="h-3 w-3" />
              Change detected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastStatusUpdateAt && (
            <span className="hidden text-[11px] text-zinc-500 sm:inline">
              Updated {new Date(lastStatusUpdateAt).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => { api.stageFiles(repoPath).then(refreshStatus).catch(() => {}); }}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Stage all"
          >
            Stage All
          </button>
          <button
            onClick={() => refreshStatus()}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {stagedFiles.length > 0 && (
          <div className="border-b border-zinc-800/50">
            <button
              onClick={() => setStagedOpen(!stagedOpen)}
              className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900/50 transition-colors duration-150"
            >
              {stagedOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Staged ({stagedFiles.length})
            </button>
            {stagedOpen &&
              stagedFiles.map((file) => (
                <FileItem
                  key={`staged-${file.path}`}
                  file={file}
                  repoPath={repoPath}
                  onSelect={onSelectFile}
                  isSelected={selectedFile?.path === file.path}
                  onAction={refreshStatus}
                />
              ))}
          </div>
        )}

        {unstagedFiles.length > 0 && (
          <div>
            <button
              onClick={() => setUnstagedOpen(!unstagedOpen)}
              className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900/50 transition-colors duration-150"
            >
              {unstagedOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Unstaged ({unstagedFiles.length})
            </button>
            {unstagedOpen &&
              unstagedFiles.map((file) => (
                <FileItem
                  key={`unstaged-${file.path}`}
                  file={file}
                  repoPath={repoPath}
                  onSelect={onSelectFile}
                  isSelected={selectedFile?.path === file.path}
                  onAction={refreshStatus}
                />
              ))}
          </div>
        )}

        {status.files.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-zinc-600">
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-5 py-4 text-center shadow-sm shadow-black/5">
              No changes detected
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
