import { spawn } from "child_process";
import type { AgentTool } from "./agentTools.js";
import { chatArgsForTool, streamingChatArgsForTool } from "./agentTools.js";

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

export type AgentChatStreamEvent =
  | { type: "text"; delta: string }
  | { type: "activity"; title: string; detail?: string; status?: "running" | "done" | "error" }
  | { type: "error"; message: string }
  | { type: "done"; message: string };

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

function eventString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function eventRole(event: Record<string, unknown>): string {
  const direct = eventString(event.role);
  if (direct) return direct;

  for (const key of ["message", "item"]) {
    const nested = event[key];
    if (nested && typeof nested === "object") {
      const role = eventRole(nested as Record<string, unknown>);
      if (role) return role;
    }
  }

  return "";
}

function isRenderableAssistantEvent(event: Record<string, unknown>) {
  const role = eventRole(event).toLowerCase();
  return role !== "user" && role !== "system" && role !== "developer";
}

function compactJson(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toolInput(event: Record<string, unknown>, item: Record<string, unknown> | null) {
  return event.input ?? event.arguments ?? event.args ?? event.params ?? item?.input ?? item?.arguments ?? item?.args;
}

function toolName(event: Record<string, unknown>, item: Record<string, unknown> | null) {
  return eventString(
    event.tool_name ||
    event.tool ||
    event.name ||
    event.function_name ||
    item?.tool_name ||
    item?.tool ||
    item?.name ||
    item?.function_name,
  );
}

function inputObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function shorten(value: string, max = 96) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function summarizeToolCall(name: string, input: unknown) {
  const lower = name.toLowerCase();
  const args = inputObject(input);
  const command = eventString(args.command || args.cmd || args.script);
  const path = eventString(args.path || args.file_path || args.filePath || args.filename || args.file);
  const pattern = eventString(args.pattern || args.query || args.regex);

  if (/bash|shell|exec|command|terminal/.test(lower) && command) return `Run ${shorten(command)}`;
  if (/read|open|view/.test(lower) && path) return `Read ${path}`;
  if (/write|create/.test(lower) && path) return `Write ${path}`;
  if (/edit|patch|update|replace/.test(lower) && path) return `Edit ${path}`;
  if (/grep|search|find/.test(lower) && pattern) return `Search ${shorten(pattern, 64)}`;
  if (/list|ls/.test(lower) && path) return `List ${path}`;

  const compact = compactJson(input);
  return compact ? `${name} ${shorten(compact)}` : name || "Tool call";
}

function extractTextDelta(event: Record<string, unknown>): string {
  const message = event.message;
  if (message && typeof message === "object") {
    const nested = extractTextDelta(message as Record<string, unknown>);
    if (nested) return nested;
  }

  const content = event.content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        const item = part as Record<string, unknown>;
        return eventString(item.text || item.delta || item.content);
      })
      .join("");
  }

  const candidates = [
    event.delta,
    event.text,
    content,
    event.output,
  ];

  for (const candidate of candidates) {
    const value = eventString(candidate);
    if (value) return value;
  }

  const item = event.item;
  if (item && typeof item === "object") {
    return extractTextDelta(item as Record<string, unknown>);
  }

  return "";
}

function extractActivity(event: Record<string, unknown>): AgentChatStreamEvent | null {
  const type = eventString(event.type || event.event || event.kind);
  const subtype = eventString(event.subtype || event.name || event.tool || event.tool_name);
  const item = event.item && typeof event.item === "object" ? event.item as Record<string, unknown> : null;
  const itemType = item ? eventString(item.type || item.name || item.tool || item.tool_name) : "";
  const name = toolName(event, item);
  const input = toolInput(event, item);
  const label = summarizeToolCall(name || subtype || itemType || type, input);
  const detail = compactJson(input);

  if (/tool|function|command|exec|bash|patch|edit|read|write|grep|find|ls/i.test([type, subtype, itemType].join(" "))) {
    return {
      type: "activity",
      title: label || "Tool activity",
      detail: detail || undefined,
      status: /error|failed|fail/i.test(type) ? "error" : /done|completed|complete|end/i.test(type) ? "done" : "running",
    };
  }

  return null;
}

function normalizeJsonEvent(value: unknown): AgentChatStreamEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  const type = eventString(event.type || event.event || event.kind);
  if (!isRenderableAssistantEvent(event)) return null;

  if (/result|done|completed|complete|final/i.test(type)) {
    const message = eventString(event.result || event.message || event.output || event.text || event.content);
    return message ? { type: "done", message } : null;
  }

  const text = extractTextDelta(event);
  if (text && /assistant|message|content|text|delta|response|completion/i.test(type)) {
    return { type: "text", delta: text };
  }

  return extractActivity(event);
}

function runStreamingAgentChat(
  command: string,
  args: string[],
  cwd: string,
  input: string,
  signal: AbortSignal | undefined,
  onEvent: (event: AgentChatStreamEvent) => void,
) {
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
    let lineBuffer = "";
    let settled = false;
    const structured = args.includes("--json") || args.includes("stream-json");
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

    const append = (current: string, chunk: string) =>
      (current + chunk).slice(-MAX_AGENT_CHAT_OUTPUT_CHARS);
    const emitText = (delta: string) => {
      if (!delta) return;
      stdout = append(stdout, delta);
      onEvent({ type: "text", delta });
    };
    const handleStructured = (chunk: string) => {
      lineBuffer += chunk;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const normalized = normalizeJsonEvent(JSON.parse(trimmed));
          if (normalized?.type === "text") emitText(normalized.delta);
          else if (normalized) onEvent(normalized);
        } catch {
          emitText(`${line}\n`);
        }
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      const value = chunk.toString("utf8");
      if (structured) handleStructured(value);
      else emitText(value);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const value = chunk.toString("utf8");
      stderr = append(stderr, value);
      onEvent({ type: "activity", title: "Agent output", detail: value.trim(), status: "running" });
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
      if (structured && lineBuffer.trim()) {
        try {
          const normalized = normalizeJsonEvent(JSON.parse(lineBuffer.trim()));
          if (normalized?.type === "text") emitText(normalized.delta);
          else if (normalized) onEvent(normalized);
        } catch {
          emitText(`${lineBuffer}\n`);
        }
      }
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

export async function streamHeadlessAgentChat(
  request: AgentChatRequest,
  onEvent: (event: AgentChatStreamEvent) => void,
) {
  const args = streamingChatArgsForTool(request.tool, request.requestedArgs);
  if (!args) {
    throw new Error(`${request.tool.label} does not expose a supported non-interactive chat mode yet. Use Agent Terminal for this tool.`);
  }

  const prompt = buildChatPrompt(request.history, request.prompt);
  const message = await runStreamingAgentChat(request.commandPath, args, request.cwd, prompt, request.signal, onEvent);
  onEvent({ type: "done", message });
  return message;
}
