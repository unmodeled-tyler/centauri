import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { promisify } from "util";
import gitRoutes from "./routes/git.js";
import repoRoutes from "./routes/repos.js";
import systemRoutes from "./routes/system.js";
import { featureRoutes } from "./routes/hunksAndStash.js";
import explorerRoutes from "./routes/explorer.js";
import graphRoutes from "./routes/graph.js";
import aiRoutes from "./routes/ai.js";
import { errorHandler } from "./middleware/errorHandler.js";

const here = dirname(fileURLToPath(import.meta.url));

// ── Token Persistence ──────────────────────────────────────────────────────────

const TOKEN_DIR = resolve(homedir(), ".config", "quanta-control");
const TOKEN_FILE = resolve(TOKEN_DIR, "tokens.json");

interface TokenPair {
  authToken: string;
  csrfToken: string;
  createdAt: number;
}

function loadTokens(): TokenPair | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null;
    const raw = readFileSync(TOKEN_FILE, "utf-8");
    const parsed = JSON.parse(raw) as TokenPair;
    if (!parsed.authToken || !parsed.csrfToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistTokens(auth: string, csrf: string): void {
  try {
    mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
    const payload: TokenPair = { authToken: auth, csrfToken: csrf, createdAt: Date.now() };
    writeFileSync(TOKEN_FILE, JSON.stringify(payload), { mode: 0o600, encoding: "utf-8" });
  } catch (err) {
    console.warn("[quanta-control] Failed to persist tokens:", err);
  }
}

// Load persisted tokens or generate new ones
const existingTokens = loadTokens();
export const authToken = existingTokens?.authToken ?? randomBytes(32).toString("hex");
export const csrfToken = existingTokens?.csrfToken ?? randomBytes(32).toString("hex");
if (!existingTokens) persistTokens(authToken, csrfToken);

// ── Structured Logger ─────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:4123",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4123",
];

function findProjectRoot(startDir: string) {
  let current = startDir;

  while (current !== resolve(current, "..")) {
    if (existsSync(resolve(current, "package.json"))) {
      return current;
    }
    current = resolve(current, "..");
  }

  return startDir;
}

const projectRoot = findProjectRoot(here);
const clientDist = resolve(projectRoot, "dist");

const sseTokens = new Map<string, { token: string; expiresAt: number }>();
const SSE_TOKEN_TTL_MS = 60_000;

function cleanExpiredSseTokens(): void {
  const now = Date.now();
  for (const [t, entry] of sseTokens) {
    if (now > entry.expiresAt) sseTokens.delete(t);
  }
}

// ── TTL-based Rate Limit Maps ─────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

function createRateLimitMap(): Map<string, RateLimitEntry> {
  return new Map();
}

const SSE_TOKEN_RATE_LIMITS = createRateLimitMap();
const AI_RATE_LIMITS = createRateLimitMap();

const RATE_LIMIT_MAX_SIZE = 10_000;

function pruneRateLimitMap(map: Map<string, RateLimitEntry>): void {
  const now = Date.now();
  for (const [key, entry] of map) {
    if (now > entry.resetAt) map.delete(key);
  }
  // Hard cap to prevent unbounded growth from rotating IPs
  if (map.size > RATE_LIMIT_MAX_SIZE) {
    const keys = [...map.keys()];
    for (let i = 0; i < keys.length - RATE_LIMIT_MAX_SIZE; i++) {
      map.delete(keys[i]!);
    }
  }
}

// Periodic cleanup to prevent unbounded map growth even without traffic
const CLEANUP_INTERVAL_MS = 60_000;
setInterval(() => {
  cleanExpiredSseTokens();
  pruneRateLimitMap(SSE_TOKEN_RATE_LIMITS);
  pruneRateLimitMap(AI_RATE_LIMITS);
}, CLEANUP_INTERVAL_MS).unref();

function checkRateLimit(
  map: Map<string, RateLimitEntry>,
  key: string,
  windowMs: number,
  max: number,
): boolean {
  pruneRateLimitMap(map);
  const now = Date.now();
  const current = map.get(key);
  if (!current || now > current.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= max) return false;
  current.count++;
  return true;
}

// ── Metrics ────────────────────────────────────────────────────────────────────

const requestCounts = new Map<string, number>();
const errorCounts = new Map<string, number>();

// Ring buffer for latency metrics — avoids O(n) splice operations
const LATENCY_RING_SIZE = 1000;
const latencyRing = new Float64Array(LATENCY_RING_SIZE);
let latencyRingHead = 0;
let latencyRingCount = 0;

const startTime = Date.now();

function recordRequest(path: string, latencyMs: number, isError = false): void {
  requestCounts.set(path, (requestCounts.get(path) ?? 0) + 1);
  if (isError) errorCounts.set(path, (errorCounts.get(path) ?? 0) + 1);
  latencyRing[latencyRingHead] = latencyMs;
  latencyRingHead = (latencyRingHead + 1) % LATENCY_RING_SIZE;
  if (latencyRingCount < LATENCY_RING_SIZE) latencyRingCount++;
}

function getMetrics() {
  const now = Date.now();
  const samples = latencyRingCount < LATENCY_RING_SIZE
    ? Array.from(latencyRing.subarray(0, latencyRingCount))
    : Array.from(latencyRing);
  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  return {
    uptimeMs: now - startTime,
    requests: Object.fromEntries(requestCounts),
    errors: Object.fromEntries(errorCounts),
    latencyMs: { p50, p95, p99, sample: latencyRingCount },
    sseTokensActive: sseTokens.size,
    rateLimitMaps: {
      sseToken: SSE_TOKEN_RATE_LIMITS.size,
      ai: AI_RATE_LIMITS.size,
    },
  };
}

const CSP_NONCE_BYTES = 16;

function generateNonce(): string {
  return randomBytes(CSP_NONCE_BYTES).toString("base64");
}

export function createApp() {
  const app = express();

  app.use((_req, res, next) => {
    const nonce = generateNonce();
    res.locals.cspNonce = nonce;
    res.setHeader("Content-Security-Policy", [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: blob:`,
      `connect-src 'self'`,
      `font-src 'self'`,
      `object-src 'none'`,
      `frame-ancestors 'none'`,
    ].join("; "));
    next();
  });

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin(origin, callback) {
      // Allow requests with no origin (Electron, curl, same-origin)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
  }));

  // Body parsing with size limits to prevent DoS via oversized payloads
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  // Validate Content-Type on state-changing requests to prevent CSRF via content-type mismatch
  app.use("/api", (req, _res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      const ct = req.headers["content-type"];
      if (req.body && ct && !ct.startsWith("application/json")) {
        return next(Object.assign(new Error("Content-Type must be application/json"), { status: 415 }));
      }
    }
    next();
  });

  // Request ID + timing middleware
  app.use((req, _res, next) => {
    const rawRequestId = req.headers["x-request-id"];
    const requestId = typeof rawRequestId === "string" ? rawRequestId.slice(0, 256) : randomUUID();
    req.headers["x-request-id"] = requestId;
    const start = Date.now();
    _res.on("finish", () => {
      const latencyMs = Date.now() - start;
      const path = req.route?.path ?? req.path;
      recordRequest(path, latencyMs, _res.statusCode >= 400);
      logger.debug("Request completed", {
        requestId,
        method: req.method,
        path: req.path,
        status: _res.statusCode,
        latencyMs,
      });
    });
    next();
  });

  // Global rate limiting for all API routes
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });
  app.use("/api", apiLimiter);

  const ALWAYS_OPEN_PATHS = new Set(["/health", "/token", "/csrf-token", "/sse-token"]);

// Token-based auth: reject requests missing the secret header or query param
  app.use("/api", (req, _res, next) => {
    const requestId = (req.headers["x-request-id"] as string) ?? "unknown";
    if (ALWAYS_OPEN_PATHS.has(req.path)) return next();

    const headerToken = req.headers["x-quanta-token"];
    const queryToken = req.query.token;
    const safeCompare = (candidate: unknown): boolean => {
      if (typeof candidate !== "string") return false;
      const candidateBuf = Buffer.from(candidate);
      const authBuf = Buffer.from(authToken);
      if (candidateBuf.length !== authBuf.length) return false;
      return timingSafeEqual(candidateBuf, authBuf);
    };
    if (safeCompare(headerToken) || safeCompare(queryToken)) {
      // For state-changing requests, also require CSRF token
      if (req.method !== "GET" && req.method !== "HEAD") {
        const csrfHeader = req.headers["x-csrf-token"];
        if (csrfHeader !== csrfToken) {
          return next(Object.assign(new Error("Invalid CSRF token"), { status: 403, requestId }));
        }
      }
      return next();
    }
    // Allow short-lived SSE tokens on the SSE endpoint only
    if (req.path === "/git/events") {
      const sseToken = req.query.sseToken as string;
      if (sseToken && consumeSseToken(sseToken)) {
        return next();
      }
    }
    return next(Object.assign(new Error("Unauthorized"), { status: 401, requestId }));
  });

  function isLocalRequest(req: express.Request): boolean {
    const remote = req.socket.remoteAddress;
    const isLocalIp = !remote || remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
    // Reject if proxy headers are present — means the request passed through a reverse proxy
    const hasProxyHeaders = !!(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.headers["x-forwarded-host"]);
    return isLocalIp && !hasProxyHeaders;
  }

  app.get("/api/token", (req, res) => {
    if (!isLocalRequest(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json({ token: authToken });
  });

  app.get("/api/health", (_req, res) => {
    import("child_process").then(({ execFile }) => {
      const execFileAsync = promisify(execFile);
      execFileAsync("git", ["--version"])
        .then(({ stdout }: { stdout: string }) => {
          res.json({
            ok: true,
            git: "available",
            gitVersion: stdout.trim(),
            timestamp: new Date().toISOString(),
            pid: process.pid,
          });
        })
        .catch(() => {
          res.json({
            ok: true,
            git: "not found",
            timestamp: new Date().toISOString(),
            pid: process.pid,
          });
        });
    });
  });

  app.get("/api/metrics", (req, res) => {
    if (!isLocalRequest(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json(getMetrics());
  });

  // Expose CSRF token for state-changing requests
  app.get("/api/csrf-token", (_req, res) => {
    res.json({ csrfToken });
  });

  app.get("/api/sse-token", (req, res) => {
    if (!isLocalRequest(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const key = req.ip || "unknown";
    if (!checkRateLimit(SSE_TOKEN_RATE_LIMITS, key, 60_000, 10)) {
      return res.status(429).json({ error: "Too many SSE token requests, please try again later." });
    }
    res.json({ token: createSseToken() });
  });

  app.use("/api/git", gitRoutes);
  app.use("/api/repos", repoRoutes);
  app.use("/api/system", systemRoutes);
  app.use("/api", featureRoutes);
  app.use("/api/explorer", explorerRoutes);
  app.use("/api/graph", graphRoutes);

  function aiRateLimit(req: express.Request, _res: express.Response, next: express.NextFunction) {
    const key = req.ip || "unknown";
    if (!checkRateLimit(AI_RATE_LIMITS, key, 60_000, 10)) {
      return next(Object.assign(new Error("Too many AI requests"), { status: 429 }));
    }
    next();
  }
  app.use("/api/ai", aiRateLimit, aiRoutes);

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (req.path.startsWith("/api/")) {
        return next();
      }
      return res.sendFile(resolve(clientDist, "index.html"));
    });
  }

  app.use(errorHandler);

  // ── Graceful Shutdown ─────────────────────────────────────────────────────
  function setupGracefulShutdown(server: ReturnType<typeof app.listen>) {
    const shutdown = async (signal: string) => {
      logger.info("Shutdown signal received", { signal });
      cleanExpiredSseTokens();

      server.close((err) => {
        if (err) {
          logger.error("Server close error", { error: err.message });
        } else {
          logger.info("Server closed", { signal });
        }
        void (async () => {
          try {
            const { shutdownAllWatchers } = await import("./services/repoWatcher.js");
            shutdownAllWatchers();
            logger.info("All watchers stopped");
          } catch (e) {
            logger.warn("Failed to stop watchers", { error: String(e) });
          }
        })();
      });

      setTimeout(() => {
        logger.warn("Forced exit after timeout");
        process.exit(1);
      }, 10_000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("uncaughtException", (err) => {
      logger.error("Uncaught exception", { error: err.message, stack: String(err) });
      shutdown("uncaughtException");
    });
    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled rejection", { reason: String(reason) });
    });
  }

  return { app, setupGracefulShutdown };
}

export function createSseToken(): string {
  const token = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + SSE_TOKEN_TTL_MS;
  sseTokens.set(token, { token, expiresAt });
  cleanExpiredSseTokens();
  return token;
}

export function consumeSseToken(token: string): boolean {
  const entry = sseTokens.get(token);
  if (!entry) return false;
  sseTokens.delete(token);
  return Date.now() <= entry.expiresAt;
}

export async function startServer(options?: { port?: number; host?: string }) {
  const { app, setupGracefulShutdown } = createApp();
  const defaultPort = process.env.NODE_ENV === "production" ? "4123" : "3001";
  const port = options?.port ?? parseInt(process.env.PORT || defaultPort, 10);
  const host = options?.host ?? (process.env.HOST || "127.0.0.1");

  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    logger.warn("Server binding to non-local address — auth tokens will transit in cleartext. Consider using TLS.", { host });
  }

  return new Promise<{ server: ReturnType<typeof app.listen>; token: string }>((resolveServer, reject) => {
    const server = app.listen(port, host, () => {
      logger.info("Quanta Control server started", { host, port: String(port) });
      setupGracefulShutdown(server);
      resolveServer({ server, token: authToken });
    });
    server.on("error", reject);
  });
}

if (process.env.QUANTA_CONTROL_CLI !== "1") {
  void startServer();
}
