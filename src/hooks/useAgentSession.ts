import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentChatMessage, AgentTool } from "../services/api";
import * as api from "../services/api";
import { useSettingsStore } from "../stores/settingsStore";

const COMMIT_MESSAGE_START = "CENTAURI_COMMIT_MESSAGE_START";
const COMMIT_MESSAGE_END = "CENTAURI_COMMIT_MESSAGE_END";

function cleanCommitMessage(value: string) {
  return value
    .replace(/\r/g, "")
    .trim()
    .replace(/^```(?:gitcommit|text)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^commit message:\s*/i, "")
    .trim();
}

function extractCommitMessage(buffer: string) {
  const start = buffer.lastIndexOf(COMMIT_MESSAGE_START);
  if (start === -1) return cleanCommitMessage(buffer);
  const contentStart = start + COMMIT_MESSAGE_START.length;
  const end = buffer.indexOf(COMMIT_MESSAGE_END, contentStart);
  if (end === -1) return cleanCommitMessage(buffer);
  return cleanCommitMessage(buffer.slice(contentStart, end));
}

function wrapCommitMessagePrompt(prompt: string) {
  return [
    prompt,
    "",
    "Important: Centauri needs to place your answer directly into the commit message box.",
    "Print the final commit message exactly between these marker lines:",
    COMMIT_MESSAGE_START,
    "<commit message>",
    COMMIT_MESSAGE_END,
    "Do not print analysis outside the markers.",
  ].join("\n");
}

export interface AgentConnection {
  tool: AgentTool;
  generateCommitMessage: (prompt: string) => Promise<string>;
}

export function useAgentSession({
  repoPath,
  onConnectionChange,
}: {
  repoPath: string | null;
  onConnectionChange?: (connection: AgentConnection | null) => void;
}) {
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [selectedToolId, setSelectedToolId] = useState("");
  const [loadingTools, setLoadingTools] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectedTool, setConnectedTool] = useState<AgentTool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connectedToolRef = useRef<AgentTool | null>(null);

  const loadTools = useCallback(async () => {
    setLoadingTools(true);
    setError(null);
    try {
      const nextTools = await api.getAgentTools();
      setTools(nextTools);
      const preferredId = useSettingsStore.getState().settings.defaultAgent;
      const preferred = preferredId ? nextTools.find((tool) => tool.id === preferredId && tool.available) : undefined;
      const firstAvailable = nextTools.find((tool) => tool.available);
      setSelectedToolId((current) => {
        if (current && nextTools.some((tool) => tool.id === current && tool.available)) return current;
        return preferred?.id ?? firstAvailable?.id ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detect agent tools");
    } finally {
      setLoadingTools(false);
    }
  }, []);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  const sendInput = useCallback(
    async (prompt: string, options?: { history?: AgentChatMessage[]; args?: string[] }) => {
      const tool = connectedToolRef.current;
      if (!repoPath || !tool) {
        throw new Error("No streamlined agent session is connected.");
      }

      const result = await api.sendAgentChatMessage({
        repo: repoPath,
        tool: tool.id,
        prompt,
        history: options?.history,
        args: options?.args,
      });
      return result.message;
    },
    [repoPath],
  );

  const generateCommitMessageWithAgent = useCallback(
    async (prompt: string) => {
      const response = await sendInput(wrapCommitMessagePrompt(prompt));
      const message = extractCommitMessage(response);
      if (!message) throw new Error("The agent did not return a commit message.");
      return message;
    },
    [sendInput],
  );

  const disconnect = useCallback(() => {
    connectedToolRef.current = null;
    setConnectedTool(null);
    setConnecting(false);
    onConnectionChangeRef.current?.(null);
  }, []);

  const startSession = useCallback(async () => {
    if (!repoPath || !selectedToolId) return;
    const tool = tools.find((candidate) => candidate.id === selectedToolId);
    if (!tool) return;

    setConnecting(true);
    setError(null);

    try {
      connectedToolRef.current = tool;
      setConnectedTool(tool);
      onConnectionChangeRef.current?.({
        tool,
        generateCommitMessage: generateCommitMessageWithAgent,
      });
    } finally {
      setConnecting(false);
    }
  }, [generateCommitMessageWithAgent, repoPath, selectedToolId, tools]);

  useEffect(() => {
    return () => {
      connectedToolRef.current = null;
      onConnectionChangeRef.current?.(null);
    };
  }, []);

  return {
    tools,
    selectedToolId,
    setSelectedToolId,
    loadingTools,
    connecting,
    connectedTool,
    error,
    loadTools,
    startSession,
    disconnect,
    sendInput,
  };
}
