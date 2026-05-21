import { Router } from "express";
import { gitInRepo } from "../services/gitExecutor.js";
import { validateGitRepo, assertSafeRef } from "../utils/validation.js";
import { cachedGitCall } from "../utils/simpleCache.js";
import { parseLog, parseDiff } from "../services/gitParser.js";
import type { BlameLine } from "../../src/types/git.js";
import { parseBoundedLimit, parseGitLineMatches } from "../utils/gitRouteHelpers.js";

const LOG_FORMAT = `--format=%H|%h|%an|%ae|%ad|%s|%P|%D`;

const router = Router();

const MAX_BLAME_LINES = 10000;

// ── File tree ──

router.get("/tree", async (req, res, next) => {
  try {
    const repoPath = req.query.repo as string;
    if (!repoPath) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repoPath);

    const ref = (req.query.ref as string) || "HEAD";

    const result = await cachedGitCall(`tree:${resolvedRepo}:${ref}`, () =>
      gitInRepo(resolvedRepo, [
        "ls-tree", "-r", "--name-only", "--", ref,
      ]),
    );

    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const files = result.stdout
      .split("\n")
      .filter(Boolean)
      .sort();

    res.json({ files });
  } catch (err) {
    next(err);
  }
});

// ── Blame ──

router.get("/blame", async (req, res, next) => {
  try {
    const repoPath = req.query.repo as string;
    const file = req.query.file as string;
    if (!repoPath || !file) {
      return res.status(400).json({ error: "repo and file required" });
    }
    const resolvedRepo = await validateGitRepo(repoPath);

    const result = await gitInRepo(resolvedRepo, [
      "blame", "--porcelain", "--", file,
    ]);

    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    let truncated = false;
    const lines: BlameLine[] = [];

    let currentHash = "";
    let currentAuthor = "";
    let currentAuthorEmail = "";
    let currentDate = "";
    let currentSummary = "";
    let lineNumber = 0;

    for (const raw of result.stdout.split("\n")) {
      if (raw.startsWith("\t")) {
        // Content line
        lineNumber += 1;
        if (lineNumber > MAX_BLAME_LINES) {
          truncated = true;
          break;
        }
        lines.push({
          hash: currentHash,
          shortHash: currentHash.slice(0, 7),
          author: currentAuthor,
          authorEmail: currentAuthorEmail,
          date: currentDate,
          line: lineNumber,
          content: raw.slice(1), // strip tab
          summary: currentSummary,
        });
        continue;
      }

      // A new commit block starts with a 40-char hash followed by line numbers
      const spaceIndex = raw.indexOf(" ");
      if (spaceIndex > 0) {
        const firstToken = raw.slice(0, spaceIndex);
        if (/^[0-9a-f]{40}$/.test(firstToken)) {
          currentHash = firstToken;
          continue;
        }
      }

      // Porcelain fields
      if (raw.startsWith("author ")) {
        currentAuthor = raw.slice(7);
      } else if (raw.startsWith("author-mail ")) {
        currentAuthorEmail = raw.slice(12).replace(/^</, "").replace(/>$/, "");
      } else if (raw.startsWith("author-time ")) {
        const unix = Number(raw.slice(12));
        currentDate = unix ? new Date(unix * 1000).toISOString() : "";
      } else if (raw.startsWith("summary ")) {
        currentSummary = raw.slice(8);
      }
    }

    res.json({ lines, truncated });
  } catch (err) {
    next(err);
  }
});

// ── File history ──

router.get("/history", async (req, res, next) => {
  try {
    const repoPath = req.query.repo as string;
    const file = req.query.file as string;
    if (!repoPath || !file) {
      return res.status(400).json({ error: "repo and file required" });
    }
    const resolvedRepo = await validateGitRepo(repoPath);

    const limit = parseBoundedLimit(req.query.limit);

    const result = await gitInRepo(resolvedRepo, [
      "log",
      LOG_FORMAT,
      "--date=iso-strict",
      "--follow",
      `-n`, String(limit),
      "--",
      file,
    ]);

    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const commits = parseLog(result.stdout || "");
    res.json({ commits });
  } catch (err) {
    next(err);
  }
});

// ── Grep (code search) ──

router.get("/grep", async (req, res, next) => {
  try {
    const repoPath = req.query.repo as string;
    const pattern = req.query.pattern as string;
    if (!repoPath || !pattern) {
      return res.status(400).json({ error: "repo and pattern required" });
    }
    const resolvedRepo = await validateGitRepo(repoPath);

    const caseInsensitive = req.query.ignoreCase !== "false";

    const args = ["grep", "-n", "-E"];
    if (caseInsensitive) args.push("-i");
    args.push(pattern);

    const result = await gitInRepo(resolvedRepo, args);

    if (result.exitCode === 1) {
      // git grep exits 1 when no matches found — that's not an error
      return res.json({ matches: [] });
    }

    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const maxMatches = parseBoundedLimit(req.query.limit, 500, 1000);
    const matches = parseGitLineMatches(result.stdout).slice(0, maxMatches);

    res.json({ matches, truncated: matches.length === maxMatches });
  } catch (err) {
    next(err);
  }
});

// ── Pickaxe search ──

router.get("/pickaxe", async (req, res, next) => {
  try {
    const repoPath = req.query.repo as string;
    const query = req.query.query as string;
    const rawMode = req.query.mode as string;
    if (rawMode !== "G" && rawMode !== "S") {
      return res.status(400).json({ error: "mode must be 'G' or 'S'" });
    }
    const mode = rawMode;
    if (!repoPath || !query) {
      return res.status(400).json({ error: "repo and query required" });
    }
    if (query.startsWith("-")) {
      return res.status(400).json({ error: "query must not start with dash" });
    }
    const resolvedRepo = await validateGitRepo(repoPath);

    const limit = parseBoundedLimit(req.query.limit);
    const flag = mode === "G" ? "-G" : "-S";

    const result = await gitInRepo(resolvedRepo, [
      "log",
      LOG_FORMAT,
      "--date=iso-strict",
      flag, query,
      `-n`, String(limit),
    ]);

    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const commits = parseLog(result.stdout || "");
    res.json({ commits });
  } catch (err) {
    next(err);
  }
});

// ── Compare refs ──

router.get("/compare", async (req, res, next) => {
  try {
    const repoPath = req.query.repo as string;
    const from = req.query.from as string;
    const to = req.query.to as string;
    if (!repoPath || !from || !to) {
      return res.status(400).json({ error: "repo, from, and to required" });
    }
    assertSafeRef(from, "from ref");
    assertSafeRef(to, "to ref");
    const resolvedRepo = await validateGitRepo(repoPath);

    const result = await gitInRepo(resolvedRepo, [
      "diff", "--", `${from}..${to}`,
    ]);

    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const diffs = parseDiff(result.stdout);
    res.json({ diffs });
  } catch (err) {
    next(err);
  }
});

// ── Line history ──

router.get("/line-history", async (req, res, next) => {
  try {
    const repoPath = req.query.repo as string;
    const file = req.query.file as string;
    const start = Number(req.query.start);
    const end = Number(req.query.end);

    if (
      !repoPath ||
      !file ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end < start
    ) {
      return res.status(400).json({ error: "repo, file, and a valid line range required" });
    }
    const resolvedRepo = await validateGitRepo(repoPath);

    const range = `${start},${end}:${file}`;
    const limit = parseBoundedLimit(req.query.limit);

    const result = await gitInRepo(resolvedRepo, [
      "log",
      LOG_FORMAT,
      "--date=iso-strict",
      `-L`, range,
      `-n`, String(limit),
    ]);

    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const commits = parseLog(result.stdout || "");
    res.json({ commits });
  } catch (err) {
    next(err);
  }
});

// ── TODO / FIXME scanner ──

router.get("/todos", async (req, res, next) => {
  try {
    const repoPath = req.query.repo as string;
    if (!repoPath) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repoPath);

    const pattern = "(TODO|FIXME|HACK|XXX|OPTIMIZE|BUG|REVIEW)";

    const result = await gitInRepo(resolvedRepo, [
      "grep", "-n", "-i", "-E", pattern,
    ]);

    if (result.exitCode === 1) {
      return res.json({ items: [] });
    }

    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const maxItems = parseBoundedLimit(req.query.limit, 500, 1000);
    const items = parseGitLineMatches(result.stdout)
      .slice(0, maxItems)
      .map(({ file, line, content }) => ({
        file,
        line,
        content,
        tag: content.match(/\b(FIXME|BUG|TODO|HACK|OPTIMIZE|REVIEW|XXX)\b/i)?.[1]?.toUpperCase() ?? "TODO",
      }));

    res.json({ items, truncated: items.length === maxItems });
  } catch (err) {
    next(err);
  }
});

export default router;
