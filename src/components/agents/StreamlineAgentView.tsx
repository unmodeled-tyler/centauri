import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cable, Play, RefreshCw, MessageSquare } from "lucide-react";
import { useRepoStore } from "../../stores/repoStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useStreamlineAgentChat } from "../../hooks/useStreamlineAgentChat";
import StreamlineMessageComponent from "./StreamlineMessage";
import StreamlineInputComponent from "./StreamlineInput";
import { loadStoredAgentOption, storeAgentOption } from "../../utils/agentOptions";
import type { AgentConnection } from "../../types/agents";
import type { AgentChatMessage } from "../../services/api";
import type { StreamlineMessage } from "./StreamlineMessage";

export function StreamlineAgentView({
  onConnectionChange,
}: {
  onConnectionChange?: (connection: AgentConnection | null) => void;
}) {
  const repoPath = useRepoStore((s) => s.repoPath);
  const refreshRepo = useRepoStore((s) => s.refresh);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const stoppedRequestRef = useRef(false);
  const [messages, setMessages] = useState<StreamlineMessage[]>([]);
  const [responding, setResponding] = useState(false);
  const [enabledOptions, setEnabledOptions] = useState<Record<string, boolean>>({});
  const defaultAgent = useSettingsStore((s) => s.settings.defaultAgent);
  const autoLaunchedRef = useRef(false);

  const {
    tools,
    selectedToolId,
    selectedTool,
    setSelectedToolId,
    loadingTools,
    connectedTool,
    error,
    loadTools,
    connect,
    disconnect: sessionDisconnect,
    sendInput,
  } = useStreamlineAgentChat({
    repoPath,
    onConnectionChange: (conn) => {
      if (!conn) refreshRepo();
      onConnectionChange?.(conn);
    },
  });

  const availableTools = useMemo(
    () => tools.filter((tool) => tool.available && tool.capabilities.chat),
    [tools],
  );
  const selectedToolAvailable = useMemo(
    () => availableTools.some((tool) => tool.id === selectedToolId),
    [availableTools, selectedToolId],
  );

  const selectedLaunchArgs = useMemo(
    () => selectedTool?.launchOptions
      .filter((option) => enabledOptions[option.id] ?? loadStoredAgentOption(option.id))
      .map((option) => option.terminalArg) ?? [],
    [enabledOptions, selectedTool],
  );

  useEffect(() => {
    if (connectedTool) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: `${connectedTool.label} connected — ready to work in ${repoPath || "this repo"}`,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [connectedTool, repoPath]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-launch default agent on mount
  useEffect(() => {
    if (
      autoLaunchedRef.current ||
      loadingTools ||
      connectedTool ||
      !repoPath ||
      !selectedToolId ||
      !selectedToolAvailable ||
      !defaultAgent
    ) return;
    autoLaunchedRef.current = true;
    connect();
  }, [connect, connectedTool, defaultAgent, loadingTools, repoPath, selectedToolAvailable, selectedToolId]);

  const disconnect = useCallback(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    sessionDisconnect();
    setMessages([]);
    setResponding(false);
  }, [sessionDisconnect]);

  const stopResponse = useCallback(() => {
    if (!activeRequestRef.current) return;
    stoppedRequestRef.current = true;
    activeRequestRef.current.abort();
    activeRequestRef.current = null;
    setResponding(false);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "system",
        content: "Agent stopped.",
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      if (!connectedTool || responding) return;
      const request = new AbortController();
      activeRequestRef.current = request;
      stoppedRequestRef.current = false;
      const userMessage: StreamlineMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      const history: AgentChatMessage[] = messages
        .filter((message): message is StreamlineMessage & AgentChatMessage => message.role === "user" || message.role === "agent")
        .map((message) => ({ role: message.role, content: message.content }));
      setMessages((prev) => [...prev, userMessage]);
      setResponding(true);
      try {
        const response = await sendInput(text, { history, args: selectedLaunchArgs, signal: request.signal });
        if (request.signal.aborted) return;
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "agent",
            content: response,
            timestamp: Date.now(),
          },
        ]);
      } catch (err) {
        if (request.signal.aborted || stoppedRequestRef.current) return;
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: err instanceof Error ? err.message : "Agent chat failed",
            timestamp: Date.now(),
          },
        ]);
      } finally {
        if (activeRequestRef.current === request) {
          activeRequestRef.current = null;
        }
        setResponding(false);
      }
    },
    [connectedTool, messages, responding, selectedLaunchArgs, sendInput],
  );

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-zinc-950">
      <div className="min-w-0 border-b border-zinc-800/70 bg-zinc-950/90 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <MessageSquare className="h-4 w-4 text-emerald-400" />
              Streamline
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Chat-powered agent interface.
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
              value={selectedToolId}
              onChange={(event) => setSelectedToolId(event.target.value)}
              disabled={loadingTools || Boolean(connectedTool)}
              className="min-w-0 max-w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 outline-none transition focus:border-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {availableTools.length === 0 && <option value="">No chat-capable agent CLIs found</option>}
              {availableTools.map((tool) => (
                <option key={tool.id} value={tool.id}>{tool.label}</option>
              ))}
            </select>

            {!connectedTool && selectedTool?.launchOptions.map((option) => (
              <label
                key={option.id}
                className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900"
                title={`Launch ${selectedTool.label} with ${option.terminalArg}`}
              >
                <input
                  type="checkbox"
                  checked={enabledOptions[option.id] ?? loadStoredAgentOption(option.id)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setEnabledOptions((current) => ({ ...current, [option.id]: checked }));
                    storeAgentOption(option.id, checked);
                  }}
                  className="h-3.5 w-3.5 accent-emerald-500"
                />
                {option.label}
              </label>
            ))}

            {!connectedTool && selectedTool && (
              <div className="w-full truncate text-right font-mono text-[10px] text-zinc-600 sm:w-auto" title={[selectedTool.command, ...selectedLaunchArgs].join(" ")}>
                {[selectedTool.command, ...selectedLaunchArgs].join(" ")}
              </div>
            )}

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
                onClick={connect}
                disabled={!selectedToolId || !selectedToolAvailable}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                Launch
              </button>
            )}
          </div>
        </div>

        {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!connectedTool && messages.length === 0 && (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-center shadow-lg shadow-black/20">
              <MessageSquare className="mx-auto h-10 w-10 text-zinc-600" />
              <div className="mt-3 text-sm font-semibold text-zinc-200">
                {loadingTools ? "Detecting agent CLIs" : availableTools.length === 0 ? "No chat-capable agent CLIs detected" : "Launch a Streamline Session"}
              </div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">
                {loadingTools
                  ? "Scanning your PATH for supported coding tools…"
                  : availableTools.length === 0
                    ? "Install Codex or Claude Code and hit Detect. Other CLIs are still available in Agent Terminal."
                    : "Pick a detected tool from the dropdown above and launch a clean chat session."}
              </div>
            </div>
          </div>
        )}

        {messages.length > 0 && (
          <div ref={messagesContainerRef} className="min-h-0 flex-1 overflow-y-auto">
            {messages.map((msg) => (
              <StreamlineMessageComponent key={msg.id} message={msg} tool={connectedTool} />
            ))}
            {responding && (
              <StreamlineMessageComponent
                message={{
                  id: "streamline-pending",
                  role: "agent",
                  content: "Working...",
                  timestamp: Date.now(),
                }}
                tool={connectedTool}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        <StreamlineInputComponent
          onSend={handleSend}
          onStop={stopResponse}
          disabled={!connectedTool}
          busy={responding}
          placeholder={
            responding
              ? "Waiting for the agent..."
              : !connectedTool
              ? "Launch an agent to start chatting"
              : "Message your agent... (Shift+Enter for new line)"
          }
        />
      </div>
    </div>
  );
}
