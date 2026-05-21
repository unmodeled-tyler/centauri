import { Router } from "express";
import { appendFile, readFile, writeFile, mkdir, rm, chmod } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { gitInRepo } from "../services/gitExecutor.js";
import { validateGitRepo, assertSafeRef, assertSafeArray } from "../utils/validation.js";
import { cachedGitCall } from "../utils/simpleCache.js";
import { parseStatus, parseDiff, parseLog, parseBranches, parseRemotes, LOG_SEPARATOR } from "../services/gitParser.js";

const router = Router();



router.get("/status", async (req, res, next) => {
  try {
    const repoPath = req.query.repo as string;
    if (!repoPath) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repoPath);

    const result = await cachedGitCall(`status:${resolvedRepo}`, () =>
      gitInRepo(resolvedRepo, ["status", "--porcelain", "--branch"]),
    );
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const status = parseStatus(result.stdout);

    const [numstatUnstaged, numstatStaged] = await Promise.all([
      gitInRepo(resolvedRepo, ["diff", "--no-color", "--numstat"]),
      gitInRepo(resolvedRepo, ["diff", "--cached", "--no-color", "--numstat"]),
    ]);

    const stats = new Map<string, { additions: number; deletions: number }>();
    for (const line of numstatUnstaged.stdout.split("\n").filter(Boolean)) {
      const [add, del, file] = line.split("\t");
      if (file) stats.set(file, { additions: parseInt(add ?? "0", 10) || 0, deletions: parseInt(del ?? "0", 10) || 0 });
    }
    for (const line of numstatStaged.stdout.split("\n").filter(Boolean)) {
      const [add, del, file] = line.split("\t");
      if (file) {
        const existing = stats.get(file);
        if (existing) {
          existing.additions += parseInt(add ?? "0", 10) || 0;
          existing.deletions += parseInt(del ?? "0", 10) || 0;
        } else {
          stats.set(file, { additions: parseInt(add ?? "0", 10) || 0, deletions: parseInt(del ?? "0", 10) || 0 });
        }
      }
    }

    for (const file of status.files) {
      const s = stats.get(file.path);
      if (s) {
        file.additions = s.additions;
        file.deletions = s.deletions;
      }
    }

    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.get("/diff", async (req, res, next) => {
  try {
    const repo = req.query.repo as string;
    const file = req.query.file as string;
    const staged = req.query.staged as string;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    const args = ["diff", "--no-color"];
    if (staged === "true") args.push("--cached");
    if (file) args.push("--", file);

    const result = await gitInRepo(resolvedRepo, args);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const diffs = parseDiff(result.stdout);
    res.json(diffs);
  } catch (err) {
    next(err);
  }
});

router.get("/commit-diff", async (req, res, next) => {
  try {
    const repo = req.query.repo as string;
    const commit = req.query.commit as string;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    if (!commit) return res.status(400).json({ error: "commit hash required" });
    assertSafeRef(commit, "commit hash");
    const resolvedRepo = await validateGitRepo(repo);

    const result = await gitInRepo(resolvedRepo, [
      "show",
      "--format=",
      "--no-color",
      "--",
      commit,
    ]);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const diffs = parseDiff(result.stdout);
    res.json(diffs);
  } catch (err) {
    next(err);
  }
});

router.post("/stage", async (req, res, next) => {
  try {
    const { repo, files } = req.body;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    const filesArg = assertSafeArray(files ?? ["."], "files");
    const result = await gitInRepo(resolvedRepo, ["add", "--", ...(filesArg.length ? filesArg : ["."])]);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/unstage", async (req, res, next) => {
  try {
    const { repo, files } = req.body;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    const filesArg = assertSafeArray(files ?? ["."], "files");
    const result = await gitInRepo(resolvedRepo, ["reset", "HEAD", "--", ...(filesArg.length ? filesArg : ["."])]);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/commit", async (req, res, next) => {
  try {
    const { repo, message, amend } = req.body;
    if (!repo || !message) {
      return res.status(400).json({ error: "repo and message required" });
    }
    const resolvedRepo = await validateGitRepo(repo);

    const args = ["commit", "-m", message];
    if (amend) args.push("--amend", "--no-edit");

    const result = await gitInRepo(resolvedRepo, args);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    res.json({ success: true, output: result.stdout });
  } catch (err) {
    next(err);
  }
});

router.get("/log", async (req, res, next) => {
  try {
    const repo = req.query.repo as string;
    const count = parseInt(req.query.count as string) || 50;
    const branch = req.query.branch as string;

    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    const format = `%H%n%h%n%an%n%ae%n%aI%n%P%n%D%n%s%n${LOG_SEPARATOR}`;
    const args = ["log", `--max-count=${count}`, `--format=${format}`];
    if (branch) { assertSafeRef(branch, "branch name"); args.push("--", branch); }

    const result = await cachedGitCall(`log:${resolvedRepo}:${count}:${branch || ""}`, () =>
      gitInRepo(resolvedRepo, args),
    );
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const commits = parseLog(result.stdout);
    res.json(commits);
  } catch (err) {
    next(err);
  }
});

router.get("/stats", async (req, res, next) => {
  try {
    const repo = req.query.repo as string;
    const days = Math.min(parseInt(req.query.days as string, 10) || 365, 730);

    if (!repo) {
      return res.status(400).json({ error: "repo path required" });
    }
    const resolvedRepo = await validateGitRepo(repo);

    const explicitEmail = String(req.query.email || "").trim();
    const explicitName = String(req.query.name || "").trim();

    const [emailResult, nameResult] = await Promise.all([
      explicitEmail
        ? Promise.resolve({ stdout: explicitEmail, exitCode: 0 })
        : gitInRepo(resolvedRepo, ["config", "--get", "--", "user.email"]),
      explicitName
        ? Promise.resolve({ stdout: explicitName, exitCode: 0 })
        : gitInRepo(resolvedRepo, ["config", "--get", "--", "user.name"]),
    ]);

    const authorEmail = explicitEmail || (emailResult.exitCode === 0 ? emailResult.stdout.trim() : "");
    const authorName = explicitName || (nameResult.exitCode === 0 ? nameResult.stdout.trim() : "");

    if (!authorEmail && !authorName) {
      return res.status(400).json({ error: "No Git identity configured for stats" });
    }

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    const sinceString = since.toISOString().slice(0, 10);

    const format = "%ad|%ae|%an";
    const result = await gitInRepo(resolvedRepo, [
      "log",
      "--all",
      `--since=${sinceString}`,
      "--date=short",
      `--format=${format}`,
    ]);

    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const matchesIdentity = (lineEmail: string, lineName: string) => {
      const emailMatches = authorEmail
        ? lineEmail.trim().toLowerCase() === authorEmail.toLowerCase()
        : false;
      const nameMatches = authorName
        ? lineName.trim().toLowerCase() === authorName.toLowerCase()
        : false;

      if (authorEmail && authorName) {
        return emailMatches || nameMatches;
      }

      return emailMatches || nameMatches;
    };

    const counts = new Map<string, number>();

    for (const line of result.stdout.split("\n").filter(Boolean)) {
      const [date, email, name] = line.split("|");
      if (!date || !email || !name) continue;
      if (!matchesIdentity(email, name)) continue;
      counts.set(date, (counts.get(date) || 0) + 1);
    }

    const dayList: Array<{ date: string; count: number }> = [];
    for (let offset = 0; offset < days; offset += 1) {
      const current = new Date(since);
      current.setDate(since.getDate() + offset);
      const date = current.toISOString().slice(0, 10);
      dayList.push({ date, count: counts.get(date) || 0 });
    }

    const totalCommits = dayList.reduce((sum, day) => sum + day.count, 0);
    const activeDays = dayList.filter((day) => day.count > 0).length;
    const busiestDay = dayList.reduce<{ date: string; count: number } | null>(
      (best, day) => {
        if (day.count === 0) return best;
        if (!best || day.count > best.count) {
          return day;
        }
        return best;
      },
      null,
    );

    let currentStreak = 0;
    for (let index = dayList.length - 1; index >= 0; index -= 1) {
      if (dayList[index]?.count) {
        currentStreak += 1;
      } else {
        break;
      }
    }

    let longestStreak = 0;
    let runningStreak = 0;
    for (const day of dayList) {
      if (day.count > 0) {
        runningStreak += 1;
        longestStreak = Math.max(longestStreak, runningStreak);
      } else {
        runningStreak = 0;
      }
    }

    const lastWeekCommits = dayList.slice(-7).reduce((sum, day) => sum + day.count, 0);

    res.json({
      author: {
        name: authorName,
        email: authorEmail,
      },
      days: dayList,
      summary: {
        totalCommits,
        activeDays,
        currentStreak,
        longestStreak,
        busiestDay,
        lastWeekCommits,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/branches", async (req, res, next) => {
  try {
    const repo = req.query.repo as string;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    const result = await gitInRepo(resolvedRepo, ["branch", "-a", "--no-color"]);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const branches = parseBranches(result.stdout);
    res.json(branches);
  } catch (err) {
    next(err);
  }
});

router.post("/checkout", async (req, res, next) => {
  try {
    const { repo, branch, create: shouldCreate } = req.body;
    if (!repo || !branch) {
      return res.status(400).json({ error: "repo and branch required" });
    }
    assertSafeRef(branch, "branch name");
    const resolvedRepo = await validateGitRepo(repo);

    const args = ["checkout"];
    if (shouldCreate) args.push("-b");
    args.push("--", branch);

    const result = await gitInRepo(resolvedRepo, args);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/delete-branch", async (req, res, next) => {
  try {
    const { repo, branch, force } = req.body;
    if (!repo || !branch) {
      return res.status(400).json({ error: "repo and branch required" });
    }
    assertSafeRef(branch, "branch name");
    const resolvedRepo = await validateGitRepo(repo);

    const flag = force ? "-D" : "-d";
    const result = await gitInRepo(resolvedRepo, ["branch", flag, "--", branch]);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/remotes", async (req, res, next) => {
  try {
    const repo = req.query.repo as string;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    const result = await cachedGitCall(`remotes:${resolvedRepo}`, () =>
      gitInRepo(resolvedRepo, ["remote", "-v"]),
    );
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const remotes = parseRemotes(result.stdout);
    res.json(remotes);
  } catch (err) {
    next(err);
  }
});

router.post("/fetch", async (req, res, next) => {
  try {
    const { repo, remote } = req.body;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    const args = ["fetch"];
    if (remote) args.push("--", remote);

    const result = await gitInRepo(resolvedRepo, args);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    res.json({ success: true, output: result.stdout });
  } catch (err) {
    next(err);
  }
});

router.post("/pull", async (req, res, next) => {
  try {
    const { repo, remote, branch } = req.body;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    const args = ["pull"];
    if (remote) {
      assertSafeRef(remote, "remote name");
      args.push("--", remote);
    }
    if (branch) {
      assertSafeRef(branch, "branch name");
      args.push("--", branch);
    }

    const result = await gitInRepo(resolvedRepo, args);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    res.json({ success: true, output: result.stdout });
  } catch (err) {
    next(err);
  }
});

router.post("/push", async (req, res, next) => {
  try {
    const { repo, remote, branch, force } = req.body;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    const args = ["push"];
    if (force) args.push("--force-with-lease");
    if (remote) {
      assertSafeRef(remote, "remote name");
      args.push("--", remote);
    }
    if (branch) {
      assertSafeRef(branch, "branch name");
      args.push("--", branch);
    }

    const result = await gitInRepo(resolvedRepo, args);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    res.json({ success: true, output: result.stdout });
  } catch (err) {
    next(err);
  }
});

router.post("/stash", async (req, res, next) => {
  try {
    const { repo, message, pop } = req.body;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    const args = pop ? ["stash", "pop"] : ["stash", "push", "--"];
    if (message && !pop) args.push("-m", message);

    const result = await gitInRepo(resolvedRepo, args);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    res.json({ success: true, output: result.stdout });
  } catch (err) {
    next(err);
  }
});

router.post("/discard", async (req, res, next) => {
  try {
    const { repo, files } = req.body;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    if (files?.length) {
      const result = await gitInRepo(resolvedRepo, ["checkout", "--", ...files]);
      if (result.exitCode !== 0) {
        return res.status(500).json({ error: result.stderr });
      }
    } else {
      const result = await gitInRepo(resolvedRepo, ["checkout", "--", "."]);
      if (result.exitCode !== 0) {
        return res.status(500).json({ error: result.stderr });
      }
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/gitignore", async (req, res, next) => {
  try {
    const { repo, patterns } = req.body;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    if (!patterns?.length) return res.status(400).json({ error: "patterns required" });
    const resolvedRepo = await validateGitRepo(repo);

    const gitignorePath = join(resolvedRepo, ".gitignore");

    let content = "";
    try {
      content = await readFile(gitignorePath, "utf-8");
    } catch {}

    const lines = content.split("\n");
    const existing = new Set(lines.map((l: string) => l.trim()));

    const newPatterns = patterns.filter((p: string) => !existing.has(p));
    if (newPatterns.length === 0) {
      return res.json({ success: true, added: [] });
    }

    const addition = (content && !content.endsWith("\n") ? "\n" : "") + newPatterns.join("\n") + "\n";

    await appendFile(gitignorePath, addition, "utf-8");

    await gitInRepo(resolvedRepo, ["rm", "--cached", "--quiet", "--", ...newPatterns.filter((p: string) => !p.endsWith("/"))]).catch((err) => {
      console.warn("[quanta-control] Failed to remove cached patterns:", err);
    });

    res.json({ success: true, added: newPatterns });
  } catch (err) {
    next(err);
  }
});

router.get("/config", async (req, res, next) => {
  try {
    const repo = req.query.repo as string;
    const key = req.query.key as string;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    if (!key) return res.status(400).json({ error: "key required" });
    const resolvedRepo = await validateGitRepo(repo);

    const result = await gitInRepo(resolvedRepo, ["config", "--get", "--", key]);
    if (result.exitCode !== 0) {
      return res.json({ value: "" });
    }
    res.json({ value: result.stdout.trim() });
  } catch (err) {
    next(err);
  }
});

router.get("/events", async (req, res) => {
  try {
    const repo = req.query.repo as string;
    if (!repo) {
      return res.status(400).json({ error: "repo path required" });
    }
    const resolvedRepo = await validateGitRepo(repo);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const { getRepoWatcher } = await import("../services/repoWatcher.js");
    const watcher = getRepoWatcher(resolvedRepo);

    const write = (data: string) => {
      if (!res.writableEnded) {
        res.write(data);
      }
    };

    const remove = watcher.add(write);

    let removed = false;
    const safeRemove = () => {
      if (removed) return;
      removed = true;
      remove();
    };

    req.on("close", safeRemove);
    req.socket.on("end", safeRemove);
    req.socket.on("error", safeRemove);
  } catch {
    if (!res.headersSent) {
      res.status(500).end();
    }
  }
});

router.post("/rebase-interactive", async (req, res, next) => {
  try {
    const { repo, baseCommit, todos, rewordMessages } = req.body;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    if (!baseCommit) return res.status(400).json({ error: "base commit required" });
    if (!todos?.length) return res.status(400).json({ error: "todo list required" });
    assertSafeRef(baseCommit, "base commit");
    const resolvedRepo = await validateGitRepo(repo);

    const workDir = join(tmpdir(), `quanta-rebase-${randomUUID()}`);
    await mkdir(workDir, { recursive: true });

    try {
      const todoLines = todos.map((entry: { action: string; hash: string; message: string }) => {
        const action = entry.action === "drop" ? "drop" : entry.action;
        return `${action} ${entry.hash} ${entry.message}`;
      });
      const todoContent = todoLines.join("\n") + "\n";
      const todoPath = join(workDir, "git-rebase-todo");
      await writeFile(todoPath, todoContent, "utf-8");

      const rewordsToHandle = todos.filter((entry: { action: string; hash: string; message: string }) => entry.action === "reword");
      const env: Record<string, string> = {};
      const safeTodoPath = todoPath.replace(/'/g, "'\\''");
      env.GIT_SEQUENCE_EDITOR = `cp '${safeTodoPath}'`;

      if (rewordsToHandle.length > 0 && rewordMessages) {
        const rewordDir = join(workDir, "rewords");
        await mkdir(rewordDir, { recursive: true });
        for (let i = 0; i < rewordsToHandle.length; i++) {
          const entry = rewordsToHandle[i];
          const msg = rewordMessages[entry.hash] || entry.message;
          await writeFile(join(rewordDir, `${i}.txt`), msg, "utf-8");
        }
        const counterPath = join(workDir, "reword-index");
        await writeFile(counterPath, "0", "utf-8");
        const scriptLines = [
          "#!/bin/bash",
          `COMMIT_MSG_FILE="$1"`,
          `INDEX=$(cat "${counterPath}")`,
          `cat "${rewordDir}/$INDEX.txt" > "$COMMIT_MSG_FILE"`,
          `echo $((INDEX + 1)) > "${counterPath}"`,
        ];
        const editorScriptPath = join(workDir, "editor.sh");
        await writeFile(editorScriptPath, scriptLines.join("\n") + "\n", "utf-8");
        await chmod(editorScriptPath, 0o755);
        env.GIT_EDITOR = editorScriptPath;
      }

      const result = await gitInRepo(resolvedRepo, ["rebase", "--interactive", "--", baseCommit], env);

      if (result.exitCode !== 0) {
        const hasConflicts = result.stderr.includes("CONFLICT") || result.stderr.includes("could not apply");
        await gitInRepo(resolvedRepo, ["rebase", "--abort"]).catch((err) => {
          console.warn("[quanta-control] Failed to abort rebase:", err);
        });

        return res.json({
          success: false,
          output: result.stderr || result.stdout,
          conflicts: hasConflicts ? ["Rebase had conflicts and was aborted"] : undefined,
        });
      }

      res.json({ success: true, output: result.stdout || result.stderr });
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
});

router.post("/rebase-abort", async (req, res, next) => {
  try {
    const { repo } = req.body;
    if (!repo) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repo);

    const result = await gitInRepo(resolvedRepo, ["rebase", "--abort"]);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Tags ──

router.get("/tags", async (req, res, next) => {
  try {
    const repoPath = req.query.repo as string;
    if (!repoPath) return res.status(400).json({ error: "repo path required" });
    const resolvedRepo = await validateGitRepo(repoPath);

    const result = await cachedGitCall(`tags:${resolvedRepo}`, () =>
      gitInRepo(resolvedRepo, [
        "tag", "--list", "--format=%(refname:short)|%(objectname:short)|%(objectname)|%(subject)|%(taggername)",
        "--sort=-creatordate",
      ]),
    );

    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    const tags = result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, shortHash, hash, message, tagger] = line.split("|");
        return {
          name: name ?? "",
          shortHash: shortHash ?? "",
          hash: hash ?? "",
          message: message ?? "",
          isAnnotated: Boolean(tagger),
        };
      });

    res.json({ tags });
  } catch (err) {
    next(err);
  }
});

router.post("/tag-create", async (req, res, next) => {
  try {
    const { repo, name, message, ref } = req.body;
    if (!repo || !name) return res.status(400).json({ error: "repo and name required" });
    assertSafeRef(name, "tag name");
    const resolvedRepo = await validateGitRepo(repo);

    const args = ["tag"];
    if (message) args.push("-a", "-m", message);
    args.push("--", name);
    if (ref) { assertSafeRef(ref, "ref"); args.push("--", ref); }

    const result = await gitInRepo(resolvedRepo, args);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/tag-delete", async (req, res, next) => {
  try {
    const { repo, name } = req.body;
    if (!repo || !name) return res.status(400).json({ error: "repo and name required" });
    assertSafeRef(name, "tag name");
    const resolvedRepo = await validateGitRepo(repo);

    const result = await gitInRepo(resolvedRepo, ["tag", "-d", "--", name]);
    if (result.exitCode !== 0) {
      return res.status(500).json({ error: result.stderr });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Cherry-pick ──

router.post("/cherry-pick", async (req, res, next) => {
  try {
    const { repo, commit } = req.body;
    if (!repo || !commit) return res.status(400).json({ error: "repo and commit required" });
    assertSafeRef(commit, "commit hash");
    const resolvedRepo = await validateGitRepo(repo);

    const result = await gitInRepo(resolvedRepo, ["cherry-pick", "--", commit]);
    if (result.exitCode !== 0) {
      // Auto-abort on conflict so we don't leave the repo in a bad state
      await gitInRepo(resolvedRepo, ["cherry-pick", "--abort"]).catch((err) => {
        console.warn("[quanta-control] Failed to abort cherry-pick:", err);
      });
      return res.status(500).json({ error: result.stderr || "Cherry-pick failed" });
    }

    res.json({ success: true, output: result.stdout || result.stderr });
  } catch (err) {
    next(err);
  }
});

export default router;
