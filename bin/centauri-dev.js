#!/usr/bin/env node

import net from "net";
import { existsSync } from "fs";
import { spawn } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const managedChildren = [];

function printHelp() {
  console.log(`Centauri Dev Launcher

Usage:
  centauri [--help]

Behavior:
  Starts this repository's API and Vite dev servers on local ports,
  then opens Centauri in a minimal Electron window.

Notes:
  - This launcher is intended for local development only.
  - It does not open a browser tab.
  - Stop everything with Ctrl-C.
`);
}

function prefixOutput(stream, label) {
  let buffered = "";

  stream.on("data", (chunk) => {
    buffered += chunk.toString();
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";

    for (const line of lines) {
      if (line.length > 0) {
        console.log(`[${label}] ${line}`);
      }
    }
  });

  stream.on("end", () => {
    if (buffered.length > 0) {
      console.log(`[${label}] ${buffered}`);
    }
  });
}

function startManagedProcess(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  managedChildren.push(child);
  prefixOutput(child.stdout, label);
  prefixOutput(child.stderr, label);

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${label}] exited with ${signal}`);
      return;
    }
    if (code && code !== 0) {
      console.log(`[${label}] exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
}

function isPortAvailable(port) {
  return new Promise((resolveAvailability) => {
    const server = net.createServer();

    server.once("error", () => {
      resolveAvailability(false);
    });

    server.once("listening", () => {
      server.close(() => resolveAvailability(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort(startPort) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`Could not find an open port starting at ${startPort}`);
}

async function waitFor(url, label, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function shutdown(code = 0) {
  while (managedChildren.length > 0) {
    const child = managedChildren.pop();
    if (child && !child.killed) {
      child.kill("SIGINT");
    }
  }

  process.exit(code);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (!existsSync(resolve(repoRoot, "package.json"))) {
  console.error(`Could not find package.json in ${repoRoot}`);
  process.exit(1);
}

const baseEnv = {
  ...process.env,
  BROWSER: "none",
  HOST: "127.0.0.1",
  CENTAURI_DEV_CLI: "1",
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const apiPort = await findFreePort(3001);
const clientPort = await findFreePort(5173);
const appUrl = `http://127.0.0.1:${clientPort}`;

console.log(`Starting Centauri from ${repoRoot}`);
console.log(`API server:  http://127.0.0.1:${apiPort}`);
console.log(`App window:  ${appUrl}`);
console.log("Press Ctrl-C to stop.");

startManagedProcess("api", npmCommand, ["run", "dev:server"], {
  ...baseEnv,
  PORT: String(apiPort),
});

startManagedProcess("web", npmCommand, ["run", "dev:client"], {
  ...baseEnv,
  CENTAURI_CLIENT_PORT: String(clientPort),
  CENTAURI_SERVER_PORT: String(apiPort),
});

await waitFor(`http://127.0.0.1:${apiPort}/api/health`, "API server");
await waitFor(appUrl, "web client");

const electronArgs = ["electron"];
if (process.platform === "linux") {
  electronArgs.push("--no-sandbox");
}
electronArgs.push("./electron/main.js", `--url=${appUrl}`);

const electron = spawn(
  npxCommand,
  electronArgs,
  {
    cwd: repoRoot,
    env: baseEnv,
    stdio: "inherit",
  },
);

managedChildren.push(electron);

electron.on("exit", (code, signal) => {
  if (signal) {
    shutdown(0);
    return;
  }

  shutdown(code ?? 0);
});
