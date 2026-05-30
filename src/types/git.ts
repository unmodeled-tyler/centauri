export type FileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted";

export type StagedStatus = "unstaged" | "staged" | "partially_staged";

export interface GitFile {
  path: string;
  oldPath?: string;
  status: FileStatus;
  stagedStatus: StagedStatus;
  additions: number;
  deletions: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "add" | "delete" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  isBinary: boolean;
  oldFile?: string;
  newFile?: string;
  newMode?: string;
  deletedMode?: string;
}

export interface StashEntry {
  index: number;
  name: string;
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  branch: string;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  refs: string[];
  parents: string[];
}

export interface CommitActivityDay {
  date: string;
  count: number;
}

export interface CommitActivitySummary {
  totalCommits: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  busiestDay: CommitActivityDay | null;
  lastWeekCommits: number;
}

export interface CommitActivity {
  author: {
    name: string;
    email: string;
  };
  days: CommitActivityDay[];
  summary: CommitActivitySummary;
}

export interface Branch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  tracking?: string;
  ahead?: number;
  behind?: number;
}

export interface Remote {
  name: string;
  url: string;
  type: "fetch" | "push";
}

export interface StatusResult {
  branch: string;
  files: GitFile[];
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
}

export type RebaseAction = "pick" | "reword" | "squash" | "fixup" | "drop";

export interface RebaseTodoEntry {
  action: RebaseAction;
  hash: string;
  shortHash: string;
  message: string;
  originalAction: RebaseAction;
  originalIndex: number;
}

export interface RebaseRequest {
  repo: string;
  baseCommit: string;
  todos: RebaseTodoEntry[];
  rewordMessages?: Record<string, string>;
}

export interface RebaseResult {
  success: boolean;
  output: string;
  conflicts?: string[];
}

// ── Explorer types ──

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export interface BlameLine {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: string;
  line: number;
  content: string;
  summary: string;
}

export type FileNodeType = "file" | "directory";

export interface FileTreeNode {
  name: string;
  path: string;
  type: FileNodeType;
  children?: FileTreeNode[];
}

export type PickaxeMode = "S" | "G";

export interface TodoItem {
  file: string;
  line: number;
  content: string;
  tag: string;
}

export interface Tag {
  name: string;
  hash: string;
  shortHash: string;
  message: string;
  isAnnotated: boolean;
}
