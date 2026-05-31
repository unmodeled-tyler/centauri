import { spawn } from "child_process";
import type { AgentTool } from "./agentTools.js";
import { chatArgsForTool, streamingChatArgsForTool } from "./agentTools.js";
import { formatSkillSlashPrompt } from "./agentSkills.js";

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
  | { type: "activity"; title: string; detail?: string; callId?: string; status?: "running" | "done" | "error" }
  | { type: "error"; message: string }
  | { type: "done"; message: string };

export function buildChatPrompt(history: AgentChatMessage[], prompt: string) {
  const trimmedPrompt = prompt.trim();
  const skillPrompt = formatSkillSlashPrompt(trimmedPrompt);
  if (skillPrompt !== trimmedPrompt) {
    return skillPrompt;
  }

  if (trimmedPrompt.startsWith("/")) {
    return trimmedPrompt;
  }

  const turns = history
    .filter((message) => message.content.trim())
    .slice(-12)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}:\n${message.content.trim()}`);

  return [
    "You are being used through Centauri's streamlined chat interface.",
    "Respond naturally to the user's latest message while working in the current repository.",
    turns.length ? ["Conversation so far:", ...turns].join("\n\n") : "",
    "Latest user message:",
    trimmedPrompt,
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

function nestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isToolActivityName(value: string) {
  const normalized = value.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return /(^|[._:\-\s])(tool|function|command|exec|bash|patch|edit|read|write|grep|find|ls)($|[._:\-\s])/i.test(normalized);
}

function findToolPayload(event: Record<string, unknown>): Record<string, unknown> | null {
  const type = eventString(event.type || event.kind || event.event);
  if (isToolActivityName(type)) return event;

  for (const key of ["item", "message", "tool_call", "function_call", "call"]) {
    const nested = nestedRecord(event[key]);
    if (!nested) continue;
    const found = findToolPayload(nested);
    if (found) return found;
  }

  const content = event.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      const found = nestedRecord(part) ? findToolPayload(part as Record<string, unknown>) : null;
      if (found) return found;
    }
  }

  return null;
}

function toolInput(event: Record<string, unknown>, item: Record<string, unknown> | null, payload: Record<string, unknown> | null) {
  const structuredInput = (
    payload?.input ??
    payload?.arguments ??
    payload?.args ??
    payload?.params ??
    payload?.parameters ??
    event.input ??
    event.arguments ??
    event.args ??
    event.params ??
    event.parameters ??
    item?.input ??
    item?.arguments ??
    item?.args ??
    item?.parameters
  );
  if (structuredInput) return structuredInput;

  return directToolInput(
    payload,
    event,
    item,
    nestedRecord(event.payload),
    nestedRecord(event.data),
    nestedRecord(event.details),
  );
}

function toolName(event: Record<string, unknown>, item: Record<string, unknown> | null, payload: Record<string, unknown> | null) {
  return eventString(
    payload?.tool_name ||
    payload?.toolName ||
    payload?.tool_id ||
    payload?.toolId ||
    payload?.tool ||
    payload?.name ||
    payload?.function_name ||
    event.tool_name ||
    event.toolName ||
    event.tool_id ||
    event.toolId ||
    event.tool ||
    event.name ||
    event.function_name ||
    item?.tool_name ||
    item?.toolName ||
    item?.tool_id ||
    item?.toolId ||
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

function directToolInput(...records: Array<Record<string, unknown> | null>) {
  const input: Record<string, unknown> = {};
  const fields = [
    "command",
    "cmd",
    "script",
    "cwd",
    "working_directory",
    "workingDirectory",
    "path",
    "file_path",
    "filePath",
    "filename",
    "file",
    "directory_path",
    "directoryPath",
    "pattern",
    "query",
    "regex",
  ];

  for (const record of records) {
    if (!record) continue;
    for (const field of fields) {
      if (input[field] != null || record[field] == null) continue;
      input[field] = record[field];
    }
  }

  return Object.keys(input).length > 0 ? input : undefined;
}

function shorten(value: string, max = 96) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function displayPathTarget(path: string) {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return path;
  return trimmed.split(/[\\/]/).pop() || trimmed;
}

function isDisplayPathKey(key: string) {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/-/g, "_").toLowerCase();
  return /(^|_)(path|file|filename|directory|dir)(_|$)/.test(normalized);
}

function sanitizeToolDetail(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (!isDisplayPathKey(key)) return value;
    return displayPathTarget(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeToolDetail(item, key));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeToolDetail(entryValue, entryKey),
    ]),
  );
}

function unquoteShellArgument(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const quote = trimmed[0];
  if ((quote !== "'" && quote !== "\"") || trimmed[trimmed.length - 1] !== quote) return trimmed;
  return trimmed.slice(1, -1);
}

function displayCommand(command: string) {
  const trimmed = command.trim();
  const shellMatch = trimmed.match(/^(?:\/[^\s]+\/)?(?:zsh|bash|sh)\s+-lc\s+(.+)$/);
  if (shellMatch?.[1]) return unquoteShellArgument(shellMatch[1]);
  return trimmed;
}

function commandTarget(command: string) {
  const trimmed = command.trim();
  const listMatch = trimmed.match(/^ls(?:\s+(?:-[A-Za-z0-9]+\s+)*)?(.+)?$/);
  if (listMatch) return listMatch[1]?.trim() || ".";

  const readMatch = trimmed.match(/^(?:cat|head|tail|nl|wc|sed)(?:\s+[^|;&]*)?\s+([^\s|;&]+)\s*$/);
  if (readMatch?.[1]) return readMatch[1].trim();

  const searchMatch = trimmed.match(/^(?:rg|grep)(?:\s+[^|;&]*)?\s+([^\s|;&]+)\s*$/);
  if (searchMatch?.[1]) return searchMatch[1].trim();

  return "";
}

function summarizeToolCall(name: string, input: unknown) {
  const lower = name.toLowerCase();
  const args = inputObject(input);
  const rawCommand = eventString(args.command || args.cmd || args.script);
  const command = rawCommand ? displayCommand(rawCommand) : "";
  const commandPath = command ? commandTarget(command) : "";
  const path = eventString(
    args.path ||
    args.file_path ||
    args.filePath ||
    args.filename ||
    args.file ||
    args.directory_path ||
    args.directoryPath ||
    commandPath ||
    args.cwd ||
    args.working_directory ||
    args.workingDirectory,
  );
  const displayPath = path ? displayPathTarget(path) : "";
  const pattern = eventString(args.pattern || args.query || args.regex);

  if (/command_execution/.test(lower) && /^ls(?:\s|$)/.test(command)) return `List ${displayPath || "."}`;
  if (/command_execution/.test(lower) && /^(?:cat|head|tail|nl|wc|sed)(?:\s|$)/.test(command) && displayPath) return `Read ${displayPath}`;
  if (/command_execution/.test(lower) && /^(?:rg|grep)(?:\s|$)/.test(command) && pattern) return `Search ${shorten(pattern, 64)}`;
  if (/bash|shell|exec|command|terminal/.test(lower) && command) return `Run ${shorten(command)}`;
  if (/read|open|view/.test(lower) && displayPath) return `Read ${displayPath}`;
  if (/write|create/.test(lower) && displayPath) return `Write ${displayPath}`;
  if (/edit|patch|update|replace/.test(lower) && displayPath) return `Edit ${displayPath}`;
  if (/grep|search|find/.test(lower) && pattern) return `Search ${shorten(pattern, 64)}`;
  if (/list|ls/.test(lower) && displayPath) return `List ${displayPath}`;

  const compact = compactJson(sanitizeToolDetail(input));
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
  const payload = findToolPayload(event);
  const payloadType = payload ? eventString(payload.type || payload.kind || payload.event) : "";
  const name = toolName(event, item, payload);
  const input = toolInput(event, item, payload);
  const callId = eventString(payload?.id || payload?.call_id || payload?.callId || event.id || event.call_id || event.callId);
  const label = summarizeToolCall(name || subtype || itemType || type, input);
  const detailSource = input ?? event.value ?? payload?.value ?? item?.value;
  const detail = shorten(compactJson(sanitizeToolDetail(detailSource)), 180);

  if ([type, subtype, itemType, payloadType].some(isToolActivityName)) {
    return {
      type: "activity",
      title: label || "Tool activity",
      detail: detail || undefined,
      callId: callId || undefined,
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
    if (message) return { type: "done", message };
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
