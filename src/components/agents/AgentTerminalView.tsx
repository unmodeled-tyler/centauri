import { useEffect, useMemo, useRef, useState } from "react";
import { Cable, Loader2, Play, RefreshCw } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useRepoStore } from "../../stores/repoStore";
import { CentauriMark } from "../brand/CentauriMark";
import * as api from "../../services/api";

export function AgentTerminalView() {
  const repoPath = useRepoStore((s) => s.repoPath);
  const refreshRepo = useRepoStore((s) => s.refresh);
  const panelRef = useRef<HTMLDivElement | null>(null);
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
    let frame = 0;
    const fitTerminal = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        fitRef.current?.fit();
        const term = terminalRef.current;
        if (!term || socketRef.current?.readyState !== WebSocket.OPEN) return;
        socketRef.current.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      });
    };

    const observer = new ResizeObserver(fitTerminal);
    if (panelRef.current) observer.observe(panelRef.current);
    if (terminalEl.current) observer.observe(terminalEl.current);
    window.addEventListener("resize", fitTerminal);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", fitTerminal);
    };
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
        window.requestAnimationFrame(() => fit.fit());
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
    <div ref={panelRef} className="flex h-full min-w-0 flex-col overflow-hidden bg-zinc-950">
      <div className="min-w-0 border-b border-zinc-800/70 bg-zinc-950/90 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <CentauriMark className="h-5 w-5" variant="agent" />
              Agent Terminal
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Run any detected coding CLI inside the current repository.
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
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
              className="min-w-0 max-w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 outline-none transition focus:border-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-50"
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!connectedTool && !connecting && !terminalRef.current && (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-center shadow-lg shadow-black/20">
              <CentauriMark className="mx-auto h-10 w-10" variant="agent" />
              <div className="mt-3 text-sm font-semibold text-zinc-200">
                {loadingTools ? "Detecting agent CLIs" : availableTools.length === 0 ? "No agent CLIs detected" : "Launch an agent CLI"}
              </div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">
                {loadingTools
                  ? "Scanning your PATH for supported coding tools…"
                  : availableTools.length === 0
                    ? "Install a supported CLI and hit Detect. Missing tools stay hidden until they are ready."
                    : "Pick a detected tool from the dropdown above and launch it in this repo."}
              </div>
            </div>
          </div>
        )}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-2">
          <div ref={terminalEl} className="h-full min-h-0 w-full min-w-0 overflow-hidden" />
        </div>
      </div>
    </div>
  );
}
