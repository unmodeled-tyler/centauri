import { execFile } from "child_process";
import { existsSync, statSync } from "fs";
import { Server } from "http";
import { promisify } from "util";
import express from "express";
import { RawData, WebSocket, WebSocketServer } from "ws";
import * as pty from "node-pty";

const execFileAsync = promisify(execFile);

export interface AgentTool {
  id: string;
  label: string;
  command: string;
  description: string;
}

interface DetectedAgentTool extends AgentTool {
  available: boolean;
  path?: string;
}

const AGENT_TOOLS: AgentTool[] = [
  { id: "claude", label: "Claude Code", command: "claude", description: "Anthropic's Claude coding CLI" },
  { id: "codex", label: "Codex", command: "codex", description: "OpenAI Codex CLI" },
  { id: "pi", label: "pi", command: "pi", description: "pi coding agent" },
  { id: "opencode", label: "OpenCode", command: "opencode", description: "OpenCode terminal coding agent" },
  { id: "aider", label: "Aider", command: "aider", description: "Aider pair-programming CLI" },
  { id: "gemini", label: "Gemini CLI", command: "gemini", description: "Google Gemini CLI" },
  { id: "cursor-agent", label: "Cursor Agent", command: "cursor-agent", description: "Cursor's command-line coding agent" },
  { id: "amp", label: "Amp", command: "amp", description: "Sourcegraph Amp coding agent" },
];

function resolveTool(id: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.id === id);
}

async function commandPath(command: string): Promise<string | undefined> {
  const lookup = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(lookup, [command], { timeout: 2_000 });
    const first = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return first;
  } catch {
    return undefined;
  }
}

async function detectAgentTools(): Promise<DetectedAgentTool[]> {
  return Promise.all(
    AGENT_TOOLS.map(async (tool) => {
      const path = await commandPath(tool.command);
      return { ...tool, available: Boolean(path), ...(path ? { path } : {}) };
    }),
  );
}

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export const agentRoutes = express.Router();

agentRoutes.get("/tools", async (_req, res, next) => {
  try {
    res.json(await detectAgentTools());
  } catch (err) {
    next(err);
  }
});

export function setupAgentTerminal(server: Server, authToken: string) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const host = request.headers.host ?? "127.0.0.1";
    const url = new URL(request.url ?? "", `http://${host}`);
    if (url.pathname !== "/api/agents/terminal") return;

    if (url.searchParams.get("token") !== authToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, url);
    });
  });

  wss.on("connection", async (ws: WebSocket, _request: unknown, url: URL) => {
    const toolId = url.searchParams.get("tool") ?? "";
    const repo = url.searchParams.get("repo") ?? "";
    const tool = resolveTool(toolId);

    if (!tool) {
      send(ws, { type: "error", message: "Unknown agent tool" });
      ws.close();
      return;
    }

    if (!repo || !isDirectory(repo)) {
      send(ws, { type: "error", message: "Invalid repository path" });
      ws.close();
      return;
    }

    const path = await commandPath(tool.command);
    if (!path) {
      send(ws, { type: "error", message: `${tool.label} is not available on PATH` });
      ws.close();
      return;
    }

    const shell = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "bash");
    const command = process.platform === "win32" ? tool.command : `exec ${tool.command}`;
    const args = process.platform === "win32" ? ["-NoLogo", "-Command", tool.command] : ["-lc", command];

    const term = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: 100,
      rows: 30,
      cwd: repo,
      env: { ...process.env, TERM: "xterm-256color" },
    });

    send(ws, { type: "ready", tool: tool.id, cwd: repo });

    term.onData((data) => send(ws, { type: "output", data }));
    term.onExit(({ exitCode, signal }) => {
      send(ws, { type: "exit", exitCode, signal });
      ws.close();
    });

    ws.on("message", (raw: RawData) => {
      try {
        const message = JSON.parse(String(raw)) as { type?: string; data?: string; cols?: number; rows?: number };
        if (message.type === "input" && typeof message.data === "string") {
          term.write(message.data);
        }
        if (message.type === "resize" && Number.isFinite(message.cols) && Number.isFinite(message.rows)) {
          term.resize(Math.max(20, Math.floor(message.cols!)), Math.max(5, Math.floor(message.rows!)));
        }
      } catch {
        // Ignore malformed terminal messages.
      }
    });

    ws.on("close", () => {
      try {
        term.kill();
      } catch {
        // ignored
      }
    });
  });
}
