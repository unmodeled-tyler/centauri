import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
import { resolve, sep } from "path";

const execFileAsync = promisify(execFile);

// ── Retry with backoff ─────────────────────────────────────────────────────────

interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOnExitCode?: number[];
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { retries = 2, baseDelayMs = 100, maxDelayMs = 2000, retryOnExitCode = [] } = options;
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRetryable =
        err instanceof Error &&
        (err.message.includes("file locked") ||
          err.message.includes("Permission denied") ||
          err.message.includes("unable to index") ||
          err.message.includes("objects")) ||
        retryOnExitCode.length > 0;

      if (attempt >= retries || !isRetryable) throw err;

      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      attempt++;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export function expandPath(p: string): string {
  if (p === "~") {
    return homedir();
  }
  if (p.startsWith(`~${sep}`) || p.startsWith("~/")) {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

export interface GitExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  maxBuffer?: number;
  input?: string | Buffer;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const MAX_STDOUT_CHARS = 5 * 1024 * 1024; // Truncate individual command output at 5M chars

function truncateStdout(stdout: string): string {
  if (stdout.length > MAX_STDOUT_CHARS) {
    return stdout.slice(0, MAX_STDOUT_CHARS) + "\n[output truncated due to size]";
  }
  return stdout;
}

export async function git(
  args: string[],
  options: GitExecOptions = {},
): Promise<GitExecResult> {
  const { cwd, env, maxBuffer = 10 * 1024 * 1024, input } = options;

  const resolvedCwd = cwd ? expandPath(cwd) : undefined;

  return withRetry(async () => {
    if (input) {
      return new Promise<GitExecResult>((resolve, reject) => {
        const child = spawn("git", args, {
          cwd: resolvedCwd,
          env: { ...process.env, ...env } as Record<string, string>,
        });

        let stdout = "";
        let stderr = "";

        child.stdout.setEncoding("utf-8");
        child.stderr.setEncoding("utf-8");
        child.stdout.on("data", (data) => { if (stdout.length < MAX_STDOUT_CHARS) stdout += data; });
        child.stderr.on("data", (data) => { stderr += data; });

        child.on("error", (err: unknown) => {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            reject(new Error("git is not installed or not in PATH"));
          } else {
            reject(new Error((err as Error).message || String(err)));
          }
        });

        child.on("close", (code) => {
          resolve({ stdout: truncateStdout(stdout), stderr, exitCode: code ?? 0 });
        });

        child.stdin.end(input);
      });
    }

    try {
      const { stdout, stderr } = await execFileAsync("git", args, {
        cwd: resolvedCwd,
        env: { ...process.env, ...env },
        maxBuffer,
        encoding: "utf-8",
      });
      return { stdout: truncateStdout(stdout || ""), stderr: stderr || "", exitCode: 0 };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error("git is not installed or not in PATH");
      }
      return {
        stdout: truncateStdout((err as { stdout?: string }).stdout || ""),
        stderr: (err as { stderr?: string }).stderr || (err as Error).message || "",
        exitCode: (err as { status?: number }).status ?? 1,
      };
    }
  }, { retries: 2, baseDelayMs: 100 });
}

export async function gitInRepo(
  repoPath: string,
  args: string[],
  env?: Record<string, string>,
): Promise<GitExecResult> {
  return git(args, { cwd: repoPath, env });
}

export async function isGitRepo(path: string): Promise<boolean> {
  const result = await git(["rev-parse", "--is-inside-work-tree"], { cwd: path });
  return result.exitCode === 0 && result.stdout.trim() === "true";
}

export async function getRepoRoot(path: string): Promise<string | null> {
  const result = await git(["rev-parse", "--show-toplevel"], { cwd: path });
  if (result.exitCode !== 0) return null;
  return result.stdout.trim();
}
