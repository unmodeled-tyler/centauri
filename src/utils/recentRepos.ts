export interface RecentRepo {
  name: string;
  path: string;
}

const RECENT_REPOS_KEY = "quanta-recent-repos";
const MAX_RECENT_REPOS = 8;

export function loadRecentRepos(): RecentRepo[] {
  try {
    const stored = localStorage.getItem(RECENT_REPOS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function repoDisplayName(path: string): string {
  const cleaned = path.replace(/[\\/]+$/, "");
  const base = cleaned.split(/[\\/]/).pop();
  return base || cleaned || path;
}

export function saveRecentRepo(path: string): RecentRepo[] {
  const parsed = loadRecentRepos();
  const next = [
    { name: repoDisplayName(path), path },
    ...parsed.filter((repo) => repo.path !== path),
  ].slice(0, MAX_RECENT_REPOS);

  localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(next));
  return next;
}
