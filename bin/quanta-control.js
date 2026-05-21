#!/usr/bin/env node

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { existsSync } from "fs";

const here = dirname(fileURLToPath(import.meta.url));

function resolveServerEntry() {
  const candidates = [
    resolve(here, "../build/server/server/index.js"),
    resolve(here, "../build/server/index.js"),
  ];

  const entry = candidates.find((candidate) => existsSync(candidate));
  if (!entry) {
    console.error("Quanta Control is not built yet. Run `npm run build` first.");
    process.exit(1);
  }

  return entry;
}

const serverEntry = resolveServerEntry();

const repoRoot = resolve(here, "..");

function printHelp() {
  console.log(`Quanta Control

Usage:
  quanta-control [--port <port>] [--host <host>] [--browser] [--no-open]
  quanta-control --help

Options:
  --port <port>   Port to bind the local server to. Default: 4123
  --host <host>   Host interface to bind. Default: 127.0.0.1
  --browser       Force browser tab mode (skip Electron window)
  --no-open       Do not open the UI automatically
  --help          Show this help text
`);
}

function launchElectron(url) {
  const mainJs = resolve(repoRoot, "electron", "main.js");
  const candidates = [
    resolve(repoRoot, "node_modules", ".bin", "electron"),
    resolve(repoRoot, "node_modules", ".bin", "electron.cmd"),
  ];
  const electronBin = candidates.find((c) => existsSync(c));
  if (!electronBin || !existsSync(mainJs)) {
    return false;
  }

  const child = spawn(electronBin, [mainJs, `--url=${url}`], {
    cwd: repoRoot,
    stdio: "inherit",
    detached: false,
  });

  child.on("error", (err) => {
    console.error("Failed to start Electron:", err.message);
    openBrowser(url);
  });

  return true;
}

function openBrowser(url) {
  const platform = process.platform;
  const command =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args =
    platform === "win32"
      ? ["/c", "start", "", url]
      : [url];

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });

  child.on("error", () => {
    console.log(`Open ${url} in your browser.`);
  });

  child.unref();
}

const args = process.argv.slice(2);
let port = process.env.PORT || "4123";
let host = process.env.HOST || "127.0.0.1";
let useBrowser = false;
let shouldOpen = true;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(0);
  }

  if (arg === "--browser") {
    useBrowser = true;
    continue;
  }

  if (arg === "--no-open") {
    shouldOpen = false;
    continue;
  }

  if (arg === "--port") {
    const value = args[index + 1];
    if (!value) {
      console.error("Missing value for --port");
      process.exit(1);
    }
    port = value;
    index += 1;
    continue;
  }

  if (arg === "--host") {
    const value = args[index + 1];
    if (!value) {
      console.error("Missing value for --host");
      process.exit(1);
    }
    host = value;
    index += 1;
    continue;
  }

  console.error(`Unknown argument: ${arg}`);
  printHelp();
  process.exit(1);
}

process.env.PORT = port;
process.env.HOST = host;
process.env.QUANTA_CONTROL_CLI = "1";

const { startServer } = await import(serverEntry);
const { server } = await startServer({
  port: Number.parseInt(port, 10),
  host,
});

const address = server.address();
const resolvedPort =
  address && typeof address === "object" ? address.port : port;
const url = `http://${host}:${resolvedPort}`;

console.log(`Quanta Control is running at ${url}`);

if (shouldOpen) {
  const electronLaunched = !useBrowser && launchElectron(url);
  if (!electronLaunched) {
    openBrowser(url);
  }
}
