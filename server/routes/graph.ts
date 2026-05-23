import { Router } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, readdir } from "fs/promises";
import { resolve, basename, dirname, relative, extname } from "path";
import { validateGitRepo } from "../utils/validation.js";
import type { GraphNode, GraphEdge, GraphData } from "../../src/types/graph.js";

const execFileAsync = promisify(execFile);

const GITNEXUS_BIN = "npx";
const GITNEXUS_ARGS = ["gitnexus"];

// ── GitNexus alias resolution ──

async function resolveGitNexusAlias(repoPath: string): Promise<string | null> {
  // Try basename first
  const alias = basename(repoPath);
  try {
    const { stdout } = await execFileAsync(GITNEXUS_BIN, [...GITNEXUS_ARGS, "cypher", "-r", alias, "MATCH (n) RETURN count(n) LIMIT 1"]);
    const parsed = JSON.parse(stdout);
    if (!parsed.error) return alias;
  } catch {
    // ignore
  }

  // Fallback: scan gitnexus list for path match
  try {
    const { stdout } = await execFileAsync(GITNEXUS_BIN, [...GITNEXUS_ARGS, "list"]);
    const lines = stdout.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.includes(repoPath)) {
        // Previous non-empty line usually contains the alias
        for (let j = i - 1; j >= 0; j--) {
          const prevLine = lines[j];
          if (!prevLine) continue;
          const prev = prevLine.trim();
          if (prev && !prev.startsWith("Path:") && !prev.startsWith("Indexed:") && !prev.startsWith("Commit:") && !prev.startsWith("Stats:") && !prev.startsWith("Clusters:") && !prev.startsWith("Processes:")) {
            return prev.split("  ")[0]?.trim() || null;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

// ── Markdown table parser for gitnexus cypher output ──

function parseMarkdownTable(markdown: string): Record<string, string>[] {
  const lines = markdown.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 3) return [];
  const headers = lines[0]!
    .split("|")
    .map((h) => h.trim())
    .filter(Boolean);
  const rows: Record<string, string>[] = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i]!
      .split("|")
      .map((c) => c.trim())
      .filter((_, idx) => idx > 0 && idx <= headers.length); // skip first empty cell from leading |
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function normalizeLabel(label: string | undefined): string {
  return (label || "unknown")
    .replaceAll("[", "")
    .replaceAll("]", "")
    .replaceAll("\"", "")
    .replaceAll("'", "")
    .split(",")[0] || "unknown";
}

async function runCypher(alias: string, query: string): Promise<Record<string, string>[]> {
  if (!/^[a-zA-Z0-9._-]+$/.test(alias)) {
    throw new Error("Invalid alias");
  }
  const { stdout } = await execFileAsync(GITNEXUS_BIN, [...GITNEXUS_ARGS, "cypher", "-r", alias, query]);
  const parsed = JSON.parse(stdout);
  if (parsed.error) throw new Error(parsed.error);
  return parseMarkdownTable(parsed.markdown || "");
}

// ── Manual import scanner (fallback) ──

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

async function scanSourceFiles(dir: string, base: string): Promise<{ path: string; content: string }[]> {
  const results: { path: string; content: string }[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await scanSourceFiles(fullPath, base);
      results.push(...nested);
    } else if (SOURCE_EXTS.has(extname(entry.name))) {
      try {
        const content = await readFile(fullPath, "utf-8");
        const relPath = relative(base, fullPath);
        results.push({ path: relPath, content });
      } catch {
        // ignore unreadable files
      }
    }
  }
  return results;
}

function extractImports(content: string, filePath: string, repoPath: string): { source: string; target: string }[] {
  const imports: { source: string; target: string }[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    // Match: import ... from "..." or import "..."
    const match = line.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/);
    if (!match) continue;
    const modulePath = match[1] || match[2];
    if (!modulePath) continue;
    // Only relative imports point to local files
    if (!modulePath.startsWith(".")) continue;

    const dir = dirname(filePath);
    const resolvedPath = relative(repoPath, resolve(repoPath, dir, modulePath));
    imports.push({ source: filePath, target: resolvedPath });
  }
  return imports;
}

async function buildFallbackGraph(repoPath: string): Promise<GraphData> {
  const files = await scanSourceFiles(resolve(repoPath, "src"), repoPath);
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const groups = new Set<string>();

  // Create file nodes
  for (const f of files) {
    const group = dirname(f.path).split("/")[0] || "root";
    groups.add(group);
    nodes.set(f.path, {
      id: f.path,
      name: basename(f.path),
      type: "file",
      filePath: f.path,
      group,
      importance: 1,
    });
  }

  // Extract imports
  for (const f of files) {
    const imports = extractImports(f.content, f.path, repoPath);
    for (const imp of imports) {
      // Normalize target
      const targetBase = imp.target;
      const possibleTargets = [targetBase, targetBase + ".ts", targetBase + ".tsx", targetBase + ".js", targetBase + "/index.ts", targetBase + "/index.tsx"];
      let resolvedTarget: string | null = null;
      for (const pt of possibleTargets) {
        if (nodes.has(pt)) {
          resolvedTarget = pt;
          break;
        }
      }
      if (!resolvedTarget) continue;

      const edgeId = `${imp.source}->${resolvedTarget}`;
      if (!edges.some((e) => e.id === edgeId)) {
        edges.push({ id: edgeId, source: imp.source, target: resolvedTarget, type: "imports", weight: 1 });
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    groups: Array.from(groups),
  };
}

// ── GitNexus graph builder ──

async function buildGitNexusGraph(alias: string): Promise<GraphData> {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const groups = new Set<string>();

  // 1. Fetch all File nodes and their relationships
  const fileRows = await runCypher(
    alias,
    `MATCH (f:File) RETURN f.name as name, f.filePath as filePath`,
  );

  for (const row of fileRows) {
    const filePath = row.filePath || row.name || "";
    const name = row.name || basename(filePath);
    const group = dirname(filePath).split("/")[0] || "root";
    groups.add(group);
    nodes.set(filePath, {
      id: filePath,
      name,
      type: "file",
      filePath,
      group,
      importance: 1,
    });
  }

  // 2. Fetch IMPORTS relationships between files
  const importRows = await runCypher(
    alias,
    `MATCH (a:File)-[r:CodeRelation]->(b:File) WHERE r.type = 'IMPORTS' RETURN a.filePath as source, b.filePath as target`,
  );

  for (const row of importRows) {
    const source = row.source;
    const target = row.target;
    if (!source || !target) continue;
    const edgeId = `${source}->${target}`;
    if (!edges.some((e) => e.id === edgeId)) {
      edges.push({ id: edgeId, source, target, type: "imports", weight: 1 });
    }
  }

  // 3. Fetch symbol nodes (Function, Class, Method, Const, Interface, Route)
  const SYMBOL_LABELS = ["Function", "Class", "Method", "Const", "Interface", "Route"];
  const symbolQueries = SYMBOL_LABELS.map(
    (label) =>
      `MATCH (s:${label}) RETURN s.name as name, s.filePath as filePath, labels(s) as label, s.startLine as startLine, s.description as description LIMIT 200`,
  );
  let symbolRows: Record<string, string>[] = [];
  for (const query of symbolQueries) {
    try {
      const rows = await runCypher(alias, query);
      symbolRows = symbolRows.concat(rows);
    } catch {
      // ignore labels that don't exist in the graph
    }
  }

  for (const row of symbolRows) {
    const filePath = row.filePath || "";
    const name = row.name || "unknown";
    const label = normalizeLabel(row.label);
    const group = dirname(filePath).split("/")[0] || "root";
    groups.add(group);

    const typeMap: Record<string, GraphNode["type"]> = {
      Function: "function",
      Class: "class",
      Method: "method",
      Const: "const",
      Interface: "interface",
      Route: "route",
    };

    const symbolId = `${filePath}::${name}`;
    nodes.set(symbolId, {
      id: symbolId,
      name,
      type: typeMap[label] || "unknown",
      filePath,
      group,
      importance: 0.7,
      description: row.description || undefined,
    });

    // Link symbol to its file
    if (nodes.has(filePath)) {
      const containsEdgeId = `${filePath}::contains::${symbolId}`;
      if (!edges.some((e) => e.id === containsEdgeId)) {
        edges.push({ id: containsEdgeId, source: filePath, target: symbolId, type: "contains", weight: 0.5 });
      }
    }
  }

  // 4. Fetch symbol-to-symbol relationships
  const symbolRelRows = await runCypher(
    alias,
    `MATCH (a)-[r:CodeRelation]->(b) RETURN labels(a) as aLabel, a.filePath as aPath, a.name as aName, labels(b) as bLabel, b.filePath as bPath, b.name as bName, r.type as relType LIMIT 300`,
  );

  const symbolLabelSet = new Set(SYMBOL_LABELS);
  for (const row of symbolRelRows) {
    const aLabel = normalizeLabel(row.aLabel);
    const bLabel = normalizeLabel(row.bLabel);
    if (!symbolLabelSet.has(aLabel) || !symbolLabelSet.has(bLabel)) continue;
    const source = `${row.aPath}::${row.aName}`;
    const target = `${row.bPath}::${row.bName}`;
    if (!nodes.has(source) || !nodes.has(target)) continue;
    const edgeId = `${source}->${target}`;
    if (!edges.some((e) => e.id === edgeId)) {
      edges.push({ id: edgeId, source, target, type: (row.relType || "related").toLowerCase(), weight: 0.8 });
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    groups: Array.from(groups),
  };
}

// ── Express router ──

const router = Router();

router.get("/dependencies", async (req, res, next) => {
  try {
    const repoPath = req.query.repo as string;
    if (!repoPath) return res.status(400).json({ error: "repo path required" });
    await validateGitRepo(repoPath);

    const alias = await resolveGitNexusAlias(repoPath);
    let data: GraphData;
    if (alias) {
      data = await buildGitNexusGraph(alias);
    } else {
      data = await buildFallbackGraph(repoPath);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get("/symbols", async (req, res, next) => {
  try {
    const repoPath = req.query.repo as string;
    if (!repoPath) return res.status(400).json({ error: "repo path required" });
    await validateGitRepo(repoPath);

    const alias = await resolveGitNexusAlias(repoPath);
    let data: GraphData;
    if (alias) {
      data = await buildGitNexusGraph(alias);
    } else {
      data = { nodes: [], edges: [], groups: [] };
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
