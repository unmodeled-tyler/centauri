import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface AgentLaunchOption {
  id: string;
  label: string;
  terminalArg: string;
  chatArgs: string[];
}

export interface AgentSlashCommand {
  command: string;
  description: string;
  argumentHint?: string;
  source: "native" | "centauri";
}

export interface AgentTool {
  id: string;
  label: string;
  command: string;
  description: string;
  capabilities: {
    terminal: boolean;
    chat: boolean;
  };
  launchOptions: AgentLaunchOption[];
  slashCommands: AgentSlashCommand[];
}

export interface DetectedAgentTool extends AgentTool {
  available: boolean;
  path?: string;
}

const GENERIC_SLASH_COMMANDS: AgentSlashCommand[] = [
  {
    command: "/help",
    description: "Ask the native CLI harness for its in-session command help.",
    source: "native",
  },
];

const CODEX_SLASH_COMMANDS: AgentSlashCommand[] = [
  ...GENERIC_SLASH_COMMANDS,
  {
    command: "/init",
    description: "Ask Codex to inspect the repo and create/update project instructions.",
    source: "native",
  },
  {
    command: "/model",
    description: "Ask Codex to show or change the active model.",
    argumentHint: "<model>",
    source: "native",
  },
  {
    command: "/status",
    description: "Ask Codex for current session, config, and environment status.",
    source: "native",
  },
  {
    command: "/compact",
    description: "Ask Codex to compact the conversation context.",
    source: "native",
  },
  {
    command: "/review",
    description: "Ask Codex to review the current working tree.",
    source: "native",
  },
];

const CLAUDE_SLASH_COMMANDS: AgentSlashCommand[] = [
  ...GENERIC_SLASH_COMMANDS,
  {
    command: "/init",
    description: "Ask Claude Code to inspect the repo and create/update project memory.",
    source: "native",
  },
  {
    command: "/model",
    description: "Ask Claude Code to show or change the active model.",
    argumentHint: "<model>",
    source: "native",
  },
  {
    command: "/status",
    description: "Ask Claude Code for current session, config, and environment status.",
    source: "native",
  },
  {
    command: "/compact",
    description: "Ask Claude Code to compact the conversation context.",
    source: "native",
  },
];

const AGENT_TOOLS: AgentTool[] = [
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    description: "Anthropic's Claude coding CLI",
    capabilities: { terminal: true, chat: true },
    slashCommands: CLAUDE_SLASH_COMMANDS,
    launchOptions: [
      {
        id: "claude-skip-permissions",
        label: "Skip Permissions",
        terminalArg: "--dangerously-skip-permissions",
        chatArgs: ["--dangerously-skip-permissions"],
      },
    ],
  },
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    description: "OpenAI Codex CLI",
    capabilities: { terminal: true, chat: true },
    slashCommands: CODEX_SLASH_COMMANDS,
    launchOptions: [
      {
        id: "codex-yolo",
        label: "Yolo",
        terminalArg: "--yolo",
        chatArgs: ["--dangerously-bypass-approvals-and-sandbox"],
      },
    ],
  },
  { id: "pi", label: "pi", command: "pi", description: "pi coding agent", capabilities: { terminal: true, chat: true }, launchOptions: [], slashCommands: GENERIC_SLASH_COMMANDS },
  { id: "opencode", label: "OpenCode", command: "opencode", description: "OpenCode terminal coding agent", capabilities: { terminal: true, chat: false }, launchOptions: [], slashCommands: GENERIC_SLASH_COMMANDS },
  { id: "aider", label: "Aider", command: "aider", description: "Aider pair-programming CLI", capabilities: { terminal: true, chat: false }, launchOptions: [], slashCommands: GENERIC_SLASH_COMMANDS },
  { id: "gemini", label: "Gemini CLI", command: "gemini", description: "Google Gemini CLI", capabilities: { terminal: true, chat: false }, launchOptions: [], slashCommands: GENERIC_SLASH_COMMANDS },
  { id: "cursor-agent", label: "Cursor Agent", command: "cursor-agent", description: "Cursor's command-line coding agent", capabilities: { terminal: true, chat: false }, launchOptions: [], slashCommands: GENERIC_SLASH_COMMANDS },
  { id: "amp", label: "Amp", command: "amp", description: "Sourcegraph Amp coding agent", capabilities: { terminal: true, chat: false }, launchOptions: [], slashCommands: GENERIC_SLASH_COMMANDS },
  { id: "droid", label: "Droid", command: "droid", description: "Factory Droid coding agent", capabilities: { terminal: true, chat: true }, launchOptions: [], slashCommands: GENERIC_SLASH_COMMANDS },
  { id: "vibe", label: "Mistral Vibe", command: "vibe", description: "Mistral Vibe coding agent", capabilities: { terminal: true, chat: true }, launchOptions: [], slashCommands: GENERIC_SLASH_COMMANDS },
  { id: "hermes", label: "Hermes", command: "hermes", description: "Hermes coding agent", capabilities: { terminal: true, chat: false }, launchOptions: [], slashCommands: GENERIC_SLASH_COMMANDS },
  { id: "openclaw", label: "OpenClaw", command: "openclaw", description: "OpenClaw coding agent", capabilities: { terminal: true, chat: false }, launchOptions: [], slashCommands: GENERIC_SLASH_COMMANDS },
];

export function resolveAgentTool(id: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.id === id);
}

export function terminalArgsForTool(tool: AgentTool, requested: string[]) {
  const allowed = new Set(tool.launchOptions.map((option) => option.terminalArg));
  return requested.filter((arg) => allowed.has(arg));
}

export function chatArgsForTool(tool: AgentTool, requested: string[]) {
  if (!tool.capabilities.chat) return null;
  const requestedOptions = tool.launchOptions.filter((option) => requested.includes(option.terminalArg));
  const optionArgs = requestedOptions.flatMap((option) => option.chatArgs);

  if (tool.id === "codex") return ["exec", "--color", "never", ...optionArgs, "-"];
  if (tool.id === "claude") return ["-p", "--output-format", "text", ...optionArgs];
  if (tool.id === "droid") return ["exec", "--output-format", "text", ...optionArgs];
  if (tool.id === "pi") return ["--print", "--mode", "text", ...optionArgs];
  if (tool.id === "vibe") return ["--prompt", "--output", "text", "--trust", ...optionArgs];
  return null;
}

export function streamingChatArgsForTool(tool: AgentTool, requested: string[]) {
  if (!tool.capabilities.chat) return null;
  const requestedOptions = tool.launchOptions.filter((option) => requested.includes(option.terminalArg));
  const optionArgs = requestedOptions.flatMap((option) => option.chatArgs);

  if (tool.id === "codex") return ["exec", "--color", "never", "--json", ...optionArgs, "-"];
  if (tool.id === "claude") {
    return [
      "-p",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--include-hook-events",
      ...optionArgs,
    ];
  }
  if (tool.id === "droid") return ["exec", "--output-format", "stream-json", ...optionArgs];
  return chatArgsForTool(tool, requested);
}

export async function commandPath(command: string): Promise<string | undefined> {
  const lookup = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(lookup, [command], { timeout: 2_000 });
    return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  } catch {
    return undefined;
  }
}

export async function detectAgentTools(): Promise<DetectedAgentTool[]> {
  return Promise.all(
    AGENT_TOOLS.map(async (tool) => {
      const path = await commandPath(tool.command);
      return { ...tool, available: Boolean(path), ...(path ? { path } : {}) };
    }),
  );
}
