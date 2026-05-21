let currentSource: EventSource | null = null;
let currentRepo: string | null = null;
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;

const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 500;

function clearTimers() {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
    refreshTimeout = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

function closeCurrent() {
  if (currentSource) {
    currentSource.close();
    currentSource = null;
  }
  currentRepo = null;
  clearTimers();
}

function getReconnectDelay() {
  const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS);
  reconnectAttempt += 1;
  return delay;
}

export async function connectRepoEvents(repo: string, refresh: () => void) {
  if (repo === currentRepo && currentSource) return;

  closeCurrent();
  currentRepo = repo;
  reconnectAttempt = 0;

  await openConnection(repo, refresh);
}

async function openConnection(repo: string, refresh: () => void) {
  // Fetch a short-lived SSE token instead of leaking the auth token in the URL
  let tokenParam = "";
  try {
    const res = await fetch("/api/sse-token");
    const data = await res.json();
    if (data.token) tokenParam = `&sseToken=${encodeURIComponent(data.token)}`;
  } catch {}

  const source = new EventSource(
    `/api/git/events?repo=${encodeURIComponent(repo)}${tokenParam}`,
  );
  currentSource = source;

  source.onmessage = () => {
    reconnectAttempt = 0;
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
      refresh();
    }, 150);
  };

  source.onerror = () => {
    source.close();
    currentSource = null;

    const delay = getReconnectDelay();
    reconnectTimeout = setTimeout(() => {
      if (currentRepo === repo) {
        void openConnection(repo, refresh);
      }
    }, delay);
  };

  source.onopen = () => {
    reconnectAttempt = 0;
  };
}

export function disconnectRepoEvents() {
  closeCurrent();
}
