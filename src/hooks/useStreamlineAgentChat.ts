import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentChatMessage, AgentTool } from "../services/api";
import * as api from "../services/api";
import { useSettingsStore } from "../stores/settingsStore";
import type { AgentConnection } from "../types/agents";

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

function chooseTool(tools: AgentTool[], current: string) {
  const availableTools = tools.filter((tool) => tool.available && tool.capabilities.chat);
  const preferredId = useSettingsStore.getState().settings.defaultAgent;
  const preferred = preferredId ? availableTools.find((tool) => tool.id === preferredId) : undefined;
  if (current && availableTools.some((tool) => tool.id === current)) return current;
  return preferred?.id ?? availableTools[0]?.id ?? "";
}

export function useStreamlineAgentChat({
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
  const [connectedTool, setConnectedTool] = useState<AgentTool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connectedToolRef = useRef<AgentTool | null>(null);

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.id === selectedToolId && tool.available && tool.capabilities.chat) ?? null,
    [selectedToolId, tools],
  );

  const loadTools = useCallback(async () => {
    setLoadingTools(true);
    setError(null);
    try {
      const nextTools = await api.getAgentTools();
      setTools(nextTools);
      setSelectedToolId((current) => chooseTool(nextTools, current));
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
    onConnectionChangeRef.current?.(null);
  }, []);

  const connect = useCallback(() => {
    if (!selectedTool) return;
    connectedToolRef.current = selectedTool;
    setConnectedTool(selectedTool);
    setError(null);
    onConnectionChangeRef.current?.({
      tool: selectedTool,
      generateCommitMessage: generateCommitMessageWithAgent,
    });
  }, [generateCommitMessageWithAgent, selectedTool]);

  useEffect(() => {
    return () => {
      connectedToolRef.current = null;
      onConnectionChangeRef.current?.(null);
    };
  }, []);

  return {
    tools,
    selectedToolId,
    selectedTool,
    setSelectedToolId,
    loadingTools,
    connectedTool,
    error,
    loadTools,
    connect,
    disconnect,
    sendInput,
  };
}
