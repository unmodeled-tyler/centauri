import { type ReactNode, useEffect, useState } from "react";
import {
  GitBranch,
  FileText,
  GitCommit,
  History,
  ChartColumn,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  GitMerge,
  FolderSearch,
  Network,
  Bot,
} from "lucide-react";
import { useRepoStore } from "../../stores/repoStore";

export type View = "status" | "diff" | "branches" | "log" | "stats" | "stashes" | "rebase" | "settings" | "explorer" | "graph" | "agents";

const SIDEBAR_COLLAPSED_KEY = "quanta-sidebar-collapsed";

const NAV_ITEMS: Array<{ id: Exclude<View, "settings">; icon: typeof GitBranch; label: string }> = [
  { id: "explorer", icon: FolderSearch, label: "Explorer" },
  { id: "status", icon: FileText, label: "Changes" },
  { id: "diff", icon: GitCommit, label: "Diff" },
  { id: "branches", icon: GitBranch, label: "Branches" },
  { id: "log", icon: History, label: "History" },
  { id: "rebase", icon: GitMerge, label: "Rebase" },
  { id: "stats", icon: ChartColumn, label: "Stats" },
  { id: "stashes", icon: Package, label: "Stashes" },
  { id: "graph", icon: Network, label: "Graph" },
  { id: "agents", icon: Bot, label: "Agents" },
];

export function MainLayout({
  children,
  currentView,
  onViewChange,
}: {
  children: ReactNode;
  currentView: View;
  onViewChange: (view: View) => void;
}) {
  const repoPath = useRepoStore((s) => s.repoPath);
  const status = useRepoStore((s) => s.status);
  const loading = useRepoStore((s) => s.loading);
  const refresh = useRepoStore((s) => s.refresh);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "true") {
        setIsCollapsed(true);
      }
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <nav
        className={`flex flex-shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950 transition-[width] duration-200 ease-out shadow-lg shadow-black/10 ${
          isCollapsed ? "w-16" : "w-48"
        }`}
      >
        <div className="border-b border-zinc-800/60 p-3">
          <div
            className={`flex items-center ${
              isCollapsed ? "flex-col justify-center gap-3" : "justify-between gap-2"
            }`}
          >
            <div
              className={`flex items-center text-sm font-semibold text-zinc-300 ${
                isCollapsed ? "justify-center" : "gap-2"
              }`}
              title="Quanta Control"
            >
              <GitBranch className="h-4 w-4 text-emerald-400" />
              {!isCollapsed && <span>Quanta Control</span>}
            </div>
            <button
              onClick={toggleCollapsed}
              className="rounded-md p-1.5 text-zinc-500 transition-all duration-150 ease-out hover:bg-zinc-800/80 hover:text-zinc-300"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {repoPath && (
          <div className="p-3 border-b border-zinc-800/60">
            <button
              onClick={refresh}
              disabled={loading}
              className={`w-full text-xs text-zinc-400 transition-all duration-150 ease-out hover:text-zinc-200 ${
                isCollapsed ? "flex justify-center" : "flex items-center gap-2"
              }`}
              title={status?.branch || "Refresh"}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              {!isCollapsed && <span className="truncate">{status?.branch || "..."}</span>}
            </button>
          </div>
        )}

        <div className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              title={label}
              className={`w-full rounded-md px-3 py-2 text-sm transition-all duration-150 ease-out ${
                currentView === id
                  ? "bg-zinc-800/80 text-zinc-100 shadow-sm shadow-black/10"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
              } ${isCollapsed ? "flex justify-center" : "flex items-center gap-2"}`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!isCollapsed && label}
            </button>
          ))}
        </div>

        <div className="p-2 border-t border-zinc-800/60">
          <button
            onClick={() => onViewChange("settings")}
            title="Settings"
            className={`w-full rounded-md px-3 py-2 text-sm transition-all duration-150 ease-out ${
              currentView === "settings"
                ? "bg-zinc-800/80 text-zinc-100 shadow-sm shadow-black/10"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
            } ${isCollapsed ? "flex justify-center" : "flex items-center gap-2"}`}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            {!isCollapsed && "Settings"}
          </button>
        </div>
      </nav>

      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
