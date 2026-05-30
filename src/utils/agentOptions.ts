const OPTION_STORAGE_KEYS: Record<string, string> = {
  "codex-yolo": "centauri-agent-codex-yolo",
  "claude-skip-permissions": "centauri-agent-claude-skip-permissions",
};

export function agentOptionStorageKey(optionId: string) {
  return OPTION_STORAGE_KEYS[optionId] ?? `centauri-agent-option-${optionId}`;
}

export function loadStoredAgentOption(optionId: string) {
  try {
    return localStorage.getItem(agentOptionStorageKey(optionId)) === "true";
  } catch {
    return false;
  }
}

export function storeAgentOption(optionId: string, enabled: boolean) {
  try {
    localStorage.setItem(agentOptionStorageKey(optionId), String(enabled));
  } catch {}
}
