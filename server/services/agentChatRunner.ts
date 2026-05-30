import { spawn } from "child_process";
import type { AgentTool } from "./agentTools.js";
import { chatArgsForTool } from "./agentTools.js";

const MAX_AGENT_CHAT_OUTPUT_CHARS = 120000;
const AGENT_CHAT_TIMEOUT_MS = 10 * 60 * 1000;

export interface AgentChatMessage {
  role: "user" | "agent";
  content: string;
}

export interface AgentChatRequest {
  tool: AgentTool;
  commandPath: string;
  cwd: string;
  prompt: string;
  history: AgentChatMessage[];
  requestedArgs: string[];
  signal?: AbortSignal;
}

export function buildChatPrompt(history: AgentChatMessage[], prompt: string) {
  const turns = history
    .filter((message) => message.content.trim())
    .slice(-12)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}:\n${message.content.trim()}`);

  return [
    "You are being used through Centauri's streamlined chat interface.",
    "Respond naturally to the user's latest message while working in the current repository.",
    turns.length ? ["Conversation so far:", ...turns].join("\n\n") : "",
    "Latest user message:",
    prompt,
  ].filter(Boolean).join("\n\n");
}

function runAgentChat(command: string, args: string[], cwd: string, input: string, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Agent response stopped."));
      return;
    }

    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, TERM: "dumb", NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      cleanup();
      child.kill();
      reject(new Error("Agent response timed out."));
    }, AGENT_CHAT_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      child.kill();
      reject(new Error("Agent response stopped."));
    };
    signal?.addEventListener("abort", abort, { once: true });

    const append = (current: string, chunk: Buffer) =>
      (current + chunk.toString("utf8")).slice(-MAX_AGENT_CHAT_OUTPUT_CHARS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.stdin.end(input);
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `Agent exited with code ${code ?? "unknown"}`));
    });
  });
}

export async function runHeadlessAgentChat(request: AgentChatRequest) {
  const args = chatArgsForTool(request.tool, request.requestedArgs);
  if (!args) {
    throw new Error(`${request.tool.label} does not expose a supported non-interactive chat mode yet. Use Agent Terminal for this tool.`);
  }

  const prompt = buildChatPrompt(request.history, request.prompt);
  return runAgentChat(request.commandPath, args, request.cwd, prompt, request.signal);
}
