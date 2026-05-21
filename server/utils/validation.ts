import { realpath } from "fs/promises";
import { homedir } from "os";
import { isGitRepo, expandPath } from "../services/gitExecutor.js";

export function createHttpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

export async function validateGitRepo(repoPath: string): Promise<string> {
  const resolved = expandPath(repoPath);
  const realResolved = await realpath(resolved).catch(() => resolved);
  const home = homedir();
  const realHome = await realpath(home).catch(() => home);

  // Ensure resolved path stays within the user's home directory
  if (!realResolved.startsWith(realHome)) {
    throw createHttpError(403, "Access denied");
  }

  const valid = await isGitRepo(realResolved);
  if (!valid) {
    throw createHttpError(400, "Not a valid git repository");
  }
  return realResolved;
}

export function assertSafeRef(value: string, label: string) {
  if (value.startsWith("-")) {
    throw createHttpError(400, `${label} must not start with "-"`);
  }
  // Allowlist approach: only alphanumeric, /, ., _, -, @, and space
  if (!/^[a-zA-Z0-9/_.@ -]+$/.test(value)) {
    throw createHttpError(400, `${label} contains invalid characters`);
  }
  if (value.length > 256) {
    throw createHttpError(400, `${label} is too long (max 256 characters)`);
  }
}

export function assertSafeArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw createHttpError(400, `${label} must be an array`);
  }
  for (const item of value) {
    if (typeof item !== "string") {
      throw createHttpError(400, `${label} must contain only strings`);
    }
  }
  return value;
}
