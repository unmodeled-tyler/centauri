import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Cable, Loader2, Play, RefreshCw, SquareTerminal } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useRepoStore } from "../../stores/repoStore";
import * as api from "../../services/api";

export function AgentTerminalView() {
  const repoPath = useRepoStore((s) => s.repoPath);
  const refreshRepo = useRepoStore((s) => s.refresh);
  const terminalEl = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [tools, setTools] = useState<api.AgentTool[]>([]);
  const [selectedTool, setSelectedTool] = useState("");
  const [loadingTools, setLoadingTools] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectedTool, setConnectedTool] = useState<api.AgentTool | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableTools = useMemo(() => tools.filter((tool) => tool.available), [tools]);

  const loadTools = async () => {
    setLoadingTools(true);
    setError(null);
    try {
      const nextTools = await api.getAgentTools();
      setTools(nextTools);
      const firstAvailable = nextTools.find((tool) => tool.available);
      setSelectedTool((current) => {
        if (current && nextTools.some((tool) => tool.id === current && tool.available)) return current;
        return firstAvailable?.id ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detect agent tools");
    } finally {
      setLoadingTools(false);
    }
  };

  useEffect(() => {
    void loadTools();
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      terminalRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      fitRef.current?.fit();
      const term = terminalRef.current;
      if (!term || socketRef.current?.readyState !== WebSocket.OPEN) return;
      socketRef.current.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const disconnect = () => {
    socketRef.current?.close();
    socketRef.current = null;
    setConnectedTool(null);
    setConnecting(false);
    void refreshRepo();
  };

  const startSession = async () => {
    if (!repoPath || !selectedTool) return;
    const tool = tools.find((candidate) => candidate.id === selectedTool);
    if (!tool) return;

    setConnecting(true);
    setError(null);

    try {
      socketRef.current?.close();
      terminalRef.current?.dispose();

      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        theme: {
          background: "#09090b",
          foreground: "#e4e4e7",
          cursor: "#34d399",
          selectionBackground: "#3f3f46",
        },
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminalRef.current = terminal;
      fitRef.current = fit;

      if (terminalEl.current) {
        terminal.open(terminalEl.current);
        fit.fit();
      }

      terminal.writeln(`Launching ${tool.label} in ${repoPath}`);
      terminal.writeln("────────────────────────────────────────────────────────────");

      const url = await api.createAgentTerminalUrl(repoPath, tool.id);
      const socket = new WebSocket(url);
      socketRef.current = socket;

      terminal.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "input", data }));
        }
      });

      socket.addEventListener("open", () => {
        setConnectedTool(tool);
        setConnecting(false);
        socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as { type: string; data?: string; message?: string; exitCode?: number; signal?: number };
        if (message.type === "output" && typeof message.data === "string") terminal.write(message.data);
        if (message.type === "error") terminal.writeln(`\r\nError: ${message.message ?? "agent failed"}`);
        if (message.type === "exit") terminal.writeln(`\r\n\r\n[agent exited with code ${message.exitCode ?? "unknown"}]`);
      });

      socket.addEventListener("close", () => {
        setConnectedTool(null);
        setConnecting(false);
        void refreshRepo();
      });

      socket.addEventListener("error", () => {
        setError("Terminal connection failed");
        setConnecting(false);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start agent");
      setConnecting(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="border-b border-zinc-800/70 bg-zinc-950/90 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Bot className="h-4 w-4 text-emerald-400" />
              Agent Terminal
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Run any detected coding CLI inside the current repository.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void loadTools()}
              disabled={loadingTools || Boolean(connectedTool)}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingTools ? "animate-spin" : ""}`} />
              Detect
            </button>

            <select
              value={selectedTool}
              onChange={(event) => setSelectedTool(event.target.value)}
              disabled={loadingTools || Boolean(connectedTool)}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 outline-none transition focus:border-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {availableTools.length === 0 && <option value="">No agent CLIs found</option>}
              {availableTools.map((tool) => (
                <option key={tool.id} value={tool.id}>{tool.label}</option>
              ))}
            </select>

            {connectedTool ? (
              <button
                onClick={disconnect}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/25"
              >
                <Cable className="h-3.5 w-3.5" />
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => void startSession()}
                disabled={!selectedTool || connecting}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Launch
              </button>
            )}
          </div>
        </div>

        {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)]">
        <aside className="overflow-y-auto border-r border-zinc-800/70 bg-zinc-950/60 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Detected tools</div>
          <div className="space-y-2">
            {loadingTools ? (
              <div className="text-xs text-zinc-500">Scanning PATH…</div>
            ) : availableTools.length === 0 ? (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-3 text-xs leading-5 text-zinc-500">
                No supported agent CLIs were detected on PATH. Install one and hit Detect.
              </div>
            ) : availableTools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => !connectedTool && setSelectedTool(tool.id)}
                disabled={Boolean(connectedTool)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                  selectedTool === tool.id
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-200">{tool.label}</span>
                  <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                    ready
                  </span>
                </div>
                <div className="mt-1 truncate text-xs text-zinc-500" title={tool.path ?? tool.command}>
                  {tool.path ?? tool.command}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          {!connectedTool && !connecting && !terminalRef.current && (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-center shadow-lg shadow-black/20">
                <SquareTerminal className="mx-auto h-8 w-8 text-emerald-400" />
                <div className="mt-3 text-sm font-semibold text-zinc-200">Launch an agent CLI</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">
                  Quanta will attach to the selected tool through a real pseudo-terminal, with the working directory set to this repo.
                </div>
              </div>
            </div>
          )}
          <div ref={terminalEl} className="min-h-0 flex-1 overflow-hidden p-2" />
        </section>
      </div>
    </div>
  );
}
