import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface AgentLaunchOption {
  id: string;
  label: string;
  terminalArg: string;
  chatArgs: string[];
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
}

export interface DetectedAgentTool extends AgentTool {
  available: boolean;
  path?: string;
}

const AGENT_TOOLS: AgentTool[] = [
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    description: "Anthropic's Claude coding CLI",
    capabilities: { terminal: true, chat: true },
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
    launchOptions: [
      {
        id: "codex-yolo",
        label: "Yolo",
        terminalArg: "--yolo",
        chatArgs: ["--dangerously-bypass-approvals-and-sandbox"],
      },
    ],
  },
  { id: "pi", label: "pi", command: "pi", description: "pi coding agent", capabilities: { terminal: true, chat: false }, launchOptions: [] },
  { id: "opencode", label: "OpenCode", command: "opencode", description: "OpenCode terminal coding agent", capabilities: { terminal: true, chat: false }, launchOptions: [] },
  { id: "aider", label: "Aider", command: "aider", description: "Aider pair-programming CLI", capabilities: { terminal: true, chat: false }, launchOptions: [] },
  { id: "gemini", label: "Gemini CLI", command: "gemini", description: "Google Gemini CLI", capabilities: { terminal: true, chat: false }, launchOptions: [] },
  { id: "cursor-agent", label: "Cursor Agent", command: "cursor-agent", description: "Cursor's command-line coding agent", capabilities: { terminal: true, chat: false }, launchOptions: [] },
  { id: "amp", label: "Amp", command: "amp", description: "Sourcegraph Amp coding agent", capabilities: { terminal: true, chat: false }, launchOptions: [] },
  { id: "droid", label: "Droid", command: "droid", description: "Factory Droid coding agent", capabilities: { terminal: true, chat: false }, launchOptions: [] },
  { id: "hermes", label: "Hermes", command: "hermes", description: "Hermes coding agent", capabilities: { terminal: true, chat: false }, launchOptions: [] },
  { id: "openclaw", label: "OpenClaw", command: "openclaw", description: "OpenClaw coding agent", capabilities: { terminal: true, chat: false }, launchOptions: [] },
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
  return null;
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
