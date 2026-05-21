import { Router } from "express";
import { gitInRepo, git } from "../services/gitExecutor.js";
import { validateGitRepo, assertSafeRef, createHttpError } from "../utils/validation.js";
import { withRepoLock } from "../utils/gitRouteHelpers.js";
import { invalidateCache } from "../utils/simpleCache.js";

const router = Router();



router.post("/apply-hunk", async (req, res, next) => {
  try {
    const { repo, file, oldFile, newFile, newMode, deletedMode, hunk, reverse } = req.body;
    if (!repo || !file || !hunk) {
      return res.status(400).json({ error: "repo, file, and hunk required" });
    }
    if (typeof file !== "string" || file.includes("\0") || file.includes("..")) {
      throw createHttpError(400, "invalid file path");
    }
    if (oldFile != null && (typeof oldFile !== "string" || oldFile.includes("\0") || oldFile.includes(".."))) {
      throw createHttpError(400, "invalid oldFile path");
    }
    if (newFile != null && (typeof newFile !== "string" || newFile.includes("\0") || newFile.includes(".."))) {
      throw createHttpError(400, "invalid newFile path");
    }
    if (newMode != null && !/^[0-7]{6}$/.test(String(newMode))) {
      throw createHttpError(400, "invalid newMode");
    }
    if (deletedMode != null && !/^[0-7]{6}$/.test(String(deletedMode))) {
      throw createHttpError(400, "invalid deletedMode");
    }
    if (typeof hunk.header !== "string" || !hunk.header.startsWith("@@")) {
      throw createHttpError(400, "invalid hunk header");
    }
    if (!Array.isArray(hunk.lines)) {
      throw createHttpError(400, "hunk.lines must be an array");
    }
    for (const line of hunk.lines) {
      if (!line || typeof line !== "object") throw createHttpError(400, "invalid hunk line");
      if (line.type !== "add" && line.type !== "delete" && line.type !== "context") {
        throw createHttpError(400, `invalid hunk line type: ${line.type}`);
      }
      if (typeof line.content !== "string") throw createHttpError(400, "invalid hunk line content");
    }
    const resolvedRepo = await validateGitRepo(repo);

    const headerLines: string[] = [];
    headerLines.push(`diff --git a/${oldFile ?? file} b/${newFile ?? file}`);
    if (deletedMode) {
      headerLines.push(`deleted file mode ${deletedMode}`);
    }
    if (newMode) {
      headerLines.push(`new file mode ${newMode}`);
    }
    headerLines.push(`index 0000000..0000000`);
    headerLines.push(`--- a/${oldFile ?? file}`);
    headerLines.push(`+++ b/${newFile ?? file}`);
    headerLines.push(hunk.header);
    for (const line of hunk.lines) {
      const prefix = line.type === "add" ? "+" : line.type === "delete" ? "-" : " ";
      headerLines.push(`${prefix}${line.content}`);
    }
    headerLines.push("");

    const patch = headerLines.join("\n");

    const args = reverse ? ["apply", "-R", "--cached"] : ["apply", "--cached"];
    const result = await withRepoLock(resolvedRepo, () => git(args, { cwd: resolvedRepo, input: patch }));

    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    invalidateCache(resolvedRepo);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/stashes", async (req, res, next) => {
  try {
    const repo = req.query.repo as string;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    const result = await gitInRepo(resolvedRepo, ["stash", "list", "--format=%gd|%H|%h|%ci|%gs"]);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const stashes = result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|");
        const name = parts[0] ?? "";
        const hash = parts[1] ?? "";
        const shortHash = parts[2] ?? "";
        const date = parts[3] ?? "";
        const rest = parts.slice(4).join("|");
        const branchMatch = rest.match(/^WIP on (.+?):|On (.+?):/);
        const branch = branchMatch ? (branchMatch[1] ?? branchMatch[2] ?? "") : "";
        const msg = rest.replace(/^WIP on .+?: /, "").replace(/^On .+?: /, "");
        const index = parseInt(name.replace("stash@{", "").replace("}", ""), 10);
        return { index: isNaN(index) ? -1 : index, name, hash, shortHash, date, message: msg, branch };
      });

    res.json(stashes);
  } catch (err) {
    next(err);
  }
});

router.post("/stash-apply", async (req, res, next) => {
  try {
    const { repo, name } = req.body;
    if (!repo || !name) return res.status(400).json({ error: "repo and stash name required" });
    assertSafeRef(name, "stash name");
    const resolvedRepo = await validateGitRepo(repo);

    const result = await withRepoLock(resolvedRepo, () => gitInRepo(resolvedRepo, ["stash", "apply", "--", name]));
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    invalidateCache(resolvedRepo);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/stash-pop", async (req, res, next) => {
  try {
    const { repo, name } = req.body;
    if (!repo || !name) return res.status(400).json({ error: "repo and stash name required" });
    assertSafeRef(name, "stash name");
    const resolvedRepo = await validateGitRepo(repo);

    const result = await withRepoLock(resolvedRepo, () => gitInRepo(resolvedRepo, ["stash", "pop", "--", name]));
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    invalidateCache(resolvedRepo);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/stash-drop", async (req, res, next) => {
  try {
    const { repo, name } = req.body;
    if (!repo || !name) return res.status(400).json({ error: "repo and stash name required" });
    assertSafeRef(name, "stash name");
    const resolvedRepo = await validateGitRepo(repo);

    const result = await withRepoLock(resolvedRepo, () => gitInRepo(resolvedRepo, ["stash", "drop", "--", name]));
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    invalidateCache(resolvedRepo);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
export const featureRoutes = router;
