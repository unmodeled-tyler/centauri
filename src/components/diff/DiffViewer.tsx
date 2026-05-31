import { useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useRepoStore } from "../../stores/repoStore";
import type { FileDiff, DiffLine } from "../../types/git";
import { applyHunk, getDiff } from "../../services/api";
import { HighlightedTokens, SyntaxHighlightedLines } from "../explorer/SyntaxHighlightedLines";

function DiffLineView({
  line,
  content,
}: {
  line: DiffLine;
  content?: ReactNode;
}) {
  const bg =
    line.type === "add"
      ? "bg-emerald-500/[0.06]"
      : line.type === "delete"
        ? "bg-red-500/[0.06]"
        : "";
  const text =
    line.type === "add"
      ? "text-emerald-400"
      : line.type === "delete"
        ? "text-red-400"
        : "text-zinc-400";
  const prefix = line.type === "add" ? "+" : line.type === "delete" ? "-" : " ";

  return (
    <div className={`flex font-mono text-xs transition-colors duration-75 ${bg}`}>
      <span className="w-12 flex-shrink-0 text-right pr-2 text-zinc-600/70 select-none">
        {line.oldLineNumber ?? ""}
      </span>
      <span className="w-12 flex-shrink-0 text-right pr-2 text-zinc-600/70 select-none">
        {line.newLineNumber ?? ""}
      </span>
      <span className={`w-4 flex-shrink-0 select-none ${text}`}>{prefix}</span>
      <pre className={`flex-1 whitespace-pre-wrap break-all ${text}`}>
        {content ?? line.content}
      </pre>
    </div>
  );
}

function HunkActions({
  diff,
  hunk,
  onAction,
}: {
  diff: FileDiff;
  hunk: FileDiff["hunks"][number];
  onAction: () => void;
}) {
  const repoPath = useRepoStore((s) => s.repoPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleStage = useCallback(async () => {
    if (!repoPath || busy) return;
    setBusy(true);
    setError("");
    try {
      await applyHunk(repoPath, diff, hunk);
      onAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stage hunk");
    } finally {
      setBusy(false);
    }
  }, [repoPath, diff, hunk, busy, onAction]);

  const handleUnstage = useCallback(async () => {
    if (!repoPath || busy) return;
    setBusy(true);
    setError("");
    try {
      await applyHunk(repoPath, diff, hunk, true);
      onAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unstage hunk");
    } finally {
      setBusy(false);
    }
  }, [repoPath, diff, hunk, busy, onAction]);

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[10px] text-red-400">{error}</span>}
      <button
        onClick={handleStage}
        disabled={busy}
        className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-emerald-600/15 text-emerald-400 border border-emerald-600/20 transition-all duration-150 disabled:opacity-40"
        title="Stage hunk"
      >
        Stage
      </button>
      <button
        onClick={handleUnstage}
        disabled={busy}
        className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-yellow-600/15 text-yellow-400 border border-yellow-600/20 transition-all duration-150 disabled:opacity-40"
        title="Unstage hunk"
      >
        Unstage
      </button>
    </div>
  );
}

function DiffHunkView({
  hunks,
  diff,
  onAction,
}: {
  hunks: FileDiff["hunks"];
  diff: FileDiff;
  onAction: () => void;
}) {
  return (
    <div>
      {hunks.map((hunk, i) => (
        <div key={i}>
          <div className="px-3 py-1.5 bg-blue-500/[0.06] text-blue-400/80 text-xs font-mono border-y border-zinc-800/40">
            <div className="flex items-center justify-between">
              <span>
                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines}@@{" "}
                {hunk.header}
              </span>
              <HunkActions diff={diff} hunk={hunk} onAction={onAction} />
            </div>
          </div>
          <SyntaxHighlightedLines items={hunk.lines} filePath={diff.path} getLineContent={(line) => line.content}>
            {({ item: line, index: j, tokens, getTokenProps }) => (
              <DiffLineView
                key={j}
                line={line}
                content={<HighlightedTokens tokens={tokens} getTokenProps={getTokenProps} />}
              />
            )}
          </SyntaxHighlightedLines>
        </div>
      ))}
    </div>
  );
}

export function DiffContent({
  diffs,
  loading = false,
  loadingMessage = "Loading diff...",
  emptyStateMessage = "Select a file to view diff",
  onAction,
}: {
  diffs: FileDiff[];
  loading?: boolean;
  loadingMessage?: string;
  emptyStateMessage?: string;
  onAction?: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-500">
        {loadingMessage}
      </div>
    );
  }

  if (diffs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-600">
        {emptyStateMessage}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {diffs.map((diff, i) => (
        <div key={i} className="border-b border-zinc-800/60 last:border-0">
          <div className="px-3 py-2 bg-zinc-900/40 border-b border-zinc-800/60 flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-300">{diff.path}</span>
            {diff.oldPath && (
              <span className="text-xs text-zinc-600">
                ← {diff.oldPath}
              </span>
            )}
            <div className="flex gap-2 ml-auto text-xs">
              <span className="text-emerald-400">+{diff.additions}</span>
              <span className="text-red-400">-{diff.deletions}</span>
            </div>
          </div>
          {diff.isBinary ? (
            <div className="px-3 py-4 text-xs text-zinc-600 text-center">
              Binary file
            </div>
          ) : (
            <DiffHunkView hunks={diff.hunks} diff={diff} onAction={onAction ?? (() => {})} />
          )}
        </div>
      ))}
    </div>
  );
}

export function DiffViewer({
  repoPath,
  filePath,
  staged,
  showAllWhenNoFile = true,
  emptyStateMessage,
  refreshKey,
}: {
  repoPath: string;
  filePath: string | null;
  staged?: boolean;
  showAllWhenNoFile?: boolean;
  emptyStateMessage?: string;
  refreshKey?: number | null;
}) {
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDiffs = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getDiff(repoPath, filePath ?? undefined, staged);
      setDiffs(next);
    } catch {
      setDiffs([]);
    } finally {
      setLoading(false);
    }
  }, [repoPath, filePath, staged]);

  useEffect(() => {
    if (!filePath && !showAllWhenNoFile) {
      setDiffs([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const next = await getDiff(repoPath, filePath ?? undefined, staged);
        if (!cancelled) setDiffs(next);
      } catch {
        if (!cancelled) setDiffs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filePath, refreshKey, repoPath, showAllWhenNoFile, staged]);

  return (
    <DiffContent
      diffs={diffs}
      loading={loading}
      emptyStateMessage={filePath ? "No changes" : (emptyStateMessage || "Select a file to view diff")}
      onAction={loadDiffs}
    />
  );
}
