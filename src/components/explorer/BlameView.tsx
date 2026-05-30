import { Loader2 } from "lucide-react";
import type { BlameLine } from "../../types/git";
import { getRelativeTime } from "../../utils/time";

export function BlameView({
  lines,
  loading,
  error,
  selectedLines,
  onToggleLine,
  showBlameDetails = true,
}: {
  lines: BlameLine[];
  loading: boolean;
  error: string | null;
  selectedLines: Set<number>;
  onToggleLine: (line: number) => void;
  showBlameDetails?: boolean;
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

  if (lines.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        No blame data
      </div>
    );
  }

  return (
    <div className="font-mono text-xs leading-5">
      {lines.map((line, i) => {
        const isRangeSelected = selectedLines.has(line.line);
        return (
          <div
            key={i}
            onClick={() => onToggleLine(line.line)}
            className={`flex hover:bg-zinc-800/30 transition-colors group cursor-pointer ${isRangeSelected ? "bg-emerald-500/10" : ""}`}
          >
            {showBlameDetails && (
              <div className="flex-shrink-0 w-[180px] flex items-center gap-2 px-2 border-r border-zinc-800/50 text-zinc-500 bg-zinc-950/40 group-hover:bg-zinc-900/40">
                <span className="text-zinc-400 font-mono w-[56px] flex-shrink-0 truncate" title={line.hash}>
                  {line.shortHash}
                </span>
                <span className="truncate flex-1 text-[10px]" title={line.summary}>
                  {line.author}
                </span>
                <span className="flex-shrink-0 text-[10px] text-zinc-600">
                  {getRelativeTime(line.date)}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1 px-3 text-zinc-300 whitespace-pre">
              {line.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
