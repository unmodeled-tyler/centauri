import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, join, resolve } from "path";
import { homedir } from "os";
import type { AgentSlashCommand } from "./agentTools.js";

interface SkillMetadata {
  name: string;
  description: string;
  path: string;
}

const MAX_SKILL_FILES = 200;
const MAX_SCAN_DEPTH = 7;

function skillRootsForTool(toolId: string) {
  const home = homedir();
  if (toolId === "codex") {
    return [
      resolve(home, ".codex", "skills"),
      resolve(home, ".codex", "plugins", "cache"),
    ];
  }
  if (toolId === "claude") {
    return [
      resolve(home, ".claude", "skills"),
    ];
  }
  return [];
}

function parseFrontMatter(text: string): Record<string, string> {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end === -1) return {};
  const frontMatter = text.slice(3, end).trim();
  const entries: Record<string, string> = {};

  for (const line of frontMatter.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key) continue;
    entries[key] = (rawValue ?? "").trim().replace(/^["']|["']$/g, "");
  }

  return entries;
}

function parseSkillFile(path: string): SkillMetadata | null {
  try {
    const text = readFileSync(path, "utf-8");
    const metadata = parseFrontMatter(text);
    const name = metadata.name || basename(resolve(path, ".."));
    const description = metadata.description || "Use this harness skill.";
    return { name, description, path };
  } catch {
    return null;
  }
}

function findSkillFiles(root: string, depth = 0, found: string[] = []) {
  if (found.length >= MAX_SKILL_FILES || depth > MAX_SCAN_DEPTH || !existsSync(root)) return found;

  let stat;
  try {
    stat = statSync(root);
  } catch {
    return found;
  }
  if (!stat.isDirectory()) return found;

  const skillPath = join(root, "SKILL.md");
  if (existsSync(skillPath)) {
    found.push(skillPath);
    return found;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (found.length >= MAX_SKILL_FILES) break;
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    findSkillFiles(join(root, entry.name), depth + 1, found);
  }

  return found;
}

function uniqueSkills(skills: SkillMetadata[]) {
  const byName = new Map<string, SkillMetadata>();
  for (const skill of skills) {
    if (!byName.has(skill.name)) {
      byName.set(skill.name, skill);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function discoverSkillSlashCommands(toolId: string): AgentSlashCommand[] {
  const skills = uniqueSkills(
    skillRootsForTool(toolId).flatMap((root) =>
      findSkillFiles(root).flatMap((skillPath) => parseSkillFile(skillPath) ?? []),
    ),
  );

  return skills.map((skill) => ({
    command: `/skill/${skill.name}`,
    insertText: `/skill/${skill.name} `,
    description: skill.description,
    argumentHint: "<request>",
    source: "skill",
  }));
}

export function formatSkillSlashPrompt(prompt: string) {
  const match = /^\/skill\/([^\s]+)\s*(.*)$/s.exec(prompt.trim());
  if (!match) return prompt;
  const [, skillName, request] = match;
  return [
    `Use the ${skillName} skill for this request.`,
    request ? "" : "Ask the user what they want to do with this skill if the request is missing.",
    request,
  ].filter(Boolean).join("\n");
}
