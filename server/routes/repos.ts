import { Router } from "express";
import { readdir, stat } from "fs/promises";
import { realpath as fsRealpath } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { isGitRepo, expandPath } from "../services/gitExecutor.js";

const router = Router();

router.get("/validate", async (req, res, next) => {
  try {
    const rawPath = req.query.path as string;
    if (!rawPath) return res.status(400).json({ error: "path required" });

    const resolved = expandPath(rawPath);
    const valid = await isGitRepo(resolved);
    res.json({ valid, resolvedPath: resolved });
  } catch (err) {
    next(err);
  }
});

router.get("/browse", async (req, res, next) => {
  try {
    const rawPath = (req.query.path as string) || "~";
    if (rawPath.split(/[\\/]+/).some((s) => s === "..")) {
      return res.status(400).json({ error: "Invalid path" });
    }
    const dir = expandPath(rawPath);
    const home = homedir();

    // Restrict browsing to the user's home directory
    const realDir = await fsRealpath(dir).catch(() => dir);
    const realHome = await fsRealpath(home).catch(() => home);
    if (!realDir.startsWith(realHome)) {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const s = await stat(dir);
      if (!s.isDirectory()) {
        return res.json({ path: dir, isGitRepo: false, children: [] });
      }
    } catch {
      return res.status(404).json({ error: "Directory not found" });
    }

    const isRepo = await isGitRepo(dir);
    const entries = await readdir(dir);
    const children: Array<{
      name: string;
      path: string;
      isDirectory: boolean;
      isGitRepo: boolean;
    }> = [];

    const hidden = req.query.hidden === "true";

    const filtered = entries.filter((entry) => hidden || !entry.startsWith(".") || entry === ".git");

    const results = await Promise.all(
      filtered.map(async (entry) => {
        const fullPath = join(dir, entry);
        try {
          const s = await stat(fullPath);
          if (s.isDirectory()) {
            const childIsRepo = await isGitRepo(fullPath);
            return { name: entry, path: fullPath, isDirectory: true, isGitRepo: childIsRepo };
          }
        } catch {}
        return null;
      }),
    );

    for (const r of results) {
      if (r) children.push(r);
    }

    children.sort((a, b) => {
      if (a.isGitRepo !== b.isGitRepo) return a.isGitRepo ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ path: dir, isGitRepo: isRepo, children });
  } catch (err) {
    next(err);
  }
});

router.get("/recent", async (_req, res, next) => {
  try {
    const home = homedir();

    const candidates = [
    join(home, "projects"),
    join(home, "repos"),
    join(home, "code"),
    join(home, "src"),
    join(home, "Developer"),
    join(home, "workspace"),
    join(home, "work"),
    home,
  ];

  const repos: Array<{ name: string; path: string }> = [];

  const checks = await Promise.all(
    candidates.map(async (dir) => {
      const found: Array<{ name: string; path: string }> = [];
      try {
        const entries = (await readdir(dir)).slice(0, 50);
        const results = await Promise.all(
          entries.map(async (entry) => {
            const fullPath = join(dir, entry);
            try {
              const s = await stat(fullPath);
              if (s.isDirectory() && await isGitRepo(fullPath)) {
                return { name: entry, path: fullPath };
              }
            } catch {}
            return null;
          }),
        );
        for (const r of results) if (r) found.push(r);
      } catch {}
      return found;
    }),
  );

  for (const batch of checks) repos.push(...batch);

    res.json(repos);
  } catch (err) {
    next(err);
  }
});

export default router;
