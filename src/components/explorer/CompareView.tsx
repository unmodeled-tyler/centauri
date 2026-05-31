import { File, Loader2 } from "lucide-react";
import type { FileDiff } from "../../types/git";
import { HighlightedTokens, SyntaxHighlightedLines } from "./SyntaxHighlightedLines";

export function CompareView({
  diffs,
  loading,
  error,
}: {
  diffs: FileDiff[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm">
        {error}
      </div>
    );
  }

  if (diffs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        No differences between these refs
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      {diffs.map((diff) => (
        <div key={diff.path} className="border-b border-zinc-800/40">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/60 text-xs font-medium text-zinc-300">
            <File className="h-3 w-3 text-zinc-400" />
            <span>{diff.path}</span>
            <span className="text-zinc-500">
              +{diff.additions} −{diff.deletions}
            </span>
          </div>
          <div className="font-mono text-xs">
            {diff.hunks.map((hunk, hi) => (
              <div key={hi}>
                <div className="px-3 py-0.5 text-zinc-500 bg-zinc-900/30 text-[10px]">
                  {hunk.header}
                </div>
                <SyntaxHighlightedLines items={hunk.lines} filePath={diff.path} getLineContent={(line) => line.content}>
                  {({ item: line, index: li, tokens, getTokenProps }) => (
                    <div
                      key={li}
                      className={`px-3 py-0 whitespace-pre ${
                        line.type === "add"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : line.type === "delete"
                            ? "bg-red-500/10 text-red-300"
                            : "text-zinc-400"
                      }`}
                    >
                      <HighlightedTokens tokens={tokens} getTokenProps={getTokenProps} />
                    </div>
                  )}
                </SyntaxHighlightedLines>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
