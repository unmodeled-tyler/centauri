import { create } from "zustand";
import type { AgentTool } from "../services/api";

interface AgentState {
  connectedTool: AgentTool | null;
  sendPrompt: ((prompt: string) => void) | null;
  setConnectedAgent: (tool: AgentTool, sendPrompt: (prompt: string) => void) => void;
  clearConnectedAgent: () => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  connectedTool: null,
  sendPrompt: null,
  setConnectedAgent: (tool, sendPrompt) => set({ connectedTool: tool, sendPrompt }),
  clearConnectedAgent: () => set({ connectedTool: null, sendPrompt: null }),
}));
