import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import gitRoutes from "./routes/git.js";
import repoRoutes from "./routes/repos.js";
import systemRoutes from "./routes/system.js";
import { featureRoutes } from "./routes/hunksAndStash.js";
import explorerRoutes from "./routes/explorer.js";
import graphRoutes from "./routes/graph.js";
import aiRoutes from "./routes/ai.js";
import { errorHandler } from "./middleware/errorHandler.js";

const here = dirname(fileURLToPath(import.meta.url));

export const authToken = randomBytes(32).toString("hex");
export const csrfToken = randomBytes(32).toString("hex");

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

export function createApp() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false, // needed for Electron/web compatibility
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
  app.use(express.json({ limit: "1mb" }));

  // Global rate limiting for all API routes
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });
  app.use("/api", apiLimiter);

  // Token-based auth: reject requests missing the secret header or query param
  app.use("/api", (req, _res, next) => {
    // Health, token, csrf-token and sse-token endpoints are always accessible
    const alwaysOpen = ["/health", "/token", "/csrf-token", "/sse-token"];
    if (alwaysOpen.includes(req.path)) return next();

    const headerToken = req.headers["x-quanta-token"];
    const queryToken = req.query.token;
    if (headerToken === authToken || queryToken === authToken) {
      // For state-changing requests, also require CSRF token
      if (req.method !== "GET" && req.method !== "HEAD") {
        const csrfHeader = req.headers["x-csrf-token"];
        if (csrfHeader !== csrfToken) {
          return next(Object.assign(new Error("Invalid CSRF token"), { status: 403 }));
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
    return next(Object.assign(new Error("Unauthorized"), { status: 401 }));
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
    res.json({ ok: true });
  });

  // Expose CSRF token for state-changing requests
  app.get("/api/csrf-token", (_req, res) => {
    res.json({ csrfToken });
  });

  // Rate limit for SSE token generation
  const SSE_TOKEN_RATE_LIMITS = new Map<string, { count: number; resetAt: number }>();

  app.get("/api/sse-token", (req, res) => {
    if (!isLocalRequest(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const key = req.ip || "unknown";
    const now = Date.now();
    const current = SSE_TOKEN_RATE_LIMITS.get(key);
    if (!current || now > current.resetAt) {
      SSE_TOKEN_RATE_LIMITS.set(key, { count: 1, resetAt: now + 60_000 });
    } else if (current.count >= 10) {
      return res.status(429).json({ error: "Too many SSE token requests, please try again later." });
    } else {
      current.count++;
    }
    res.json({ token: createSseToken() });
  });

  app.use("/api/git", gitRoutes);
  app.use("/api/repos", repoRoutes);
  app.use("/api/system", systemRoutes);
  app.use("/api", featureRoutes);
  app.use("/api/explorer", explorerRoutes);
  app.use("/api/graph", graphRoutes);

// Simple in-memory rate limiter for AI endpoints (scoped tighter than global)
const RATE_LIMITS = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

function aiRateLimit(req: express.Request, _res: express.Response, next: express.NextFunction) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const current = RATE_LIMITS.get(key);
  if (!current || now > current.resetAt) {
    RATE_LIMITS.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }
  if (current.count >= RATE_MAX) {
    return next(Object.assign(new Error("Too many AI requests"), { status: 429 }));
  }
  current.count++;
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

  return app;
}

export function createSseToken(): string {
  const token = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + SSE_TOKEN_TTL_MS;
  sseTokens.set(token, { token, expiresAt });
  // Clean up expired tokens lazily
  for (const [t, entry] of sseTokens) {
    if (Date.now() > entry.expiresAt) {
      sseTokens.delete(t);
    }
  }
  return token;
}

export function consumeSseToken(token: string): boolean {
  const entry = sseTokens.get(token);
  if (!entry) return false;
  sseTokens.delete(token);
  return Date.now() <= entry.expiresAt;
}

export async function startServer(options?: { port?: number; host?: string }) {
  const app = createApp();
  const defaultPort = process.env.NODE_ENV === "production" ? "4123" : "3001";
  const port = options?.port ?? parseInt(process.env.PORT || defaultPort, 10);
  const host = options?.host ?? (process.env.HOST || "127.0.0.1");

  return new Promise<{ server: ReturnType<typeof app.listen>; token: string }>((resolveServer, reject) => {
    const server = app.listen(port, host, () => {
      console.log(`Quanta Control server running on http://${host}:${port}`);
      resolveServer({ server, token: authToken });
    });
    server.on("error", reject);
  });
}

if (process.env.QUANTA_CONTROL_CLI !== "1") {
  void startServer();
}
