import { create } from "zustand";
import { getStoredTheme, storeTheme } from "../themes/useTheme";
import type { ThemeId } from "../themes/themes";

export interface AppSettings {
  defaultRepoPath: string;
  userName: string;
  userEmail: string;
  defaultBranch: string;
  pruneOnFetch: boolean;
  autoRefresh: boolean;
  showHiddenFiles: boolean;
  diffView: "unified" | "split";
  confirmDiscard: boolean;
  confirmPush: boolean;
  autoPushOnCommit: boolean;
  aiCommitMessagesEnabled: boolean;
  aiCommitEndpoint: string;
  aiCommitModel: string;
  aiCommitApiKey: string;
  theme: ThemeId;
  defaultAgent: string;
}

const DEFAULTS: AppSettings = {
  defaultRepoPath: "",
  userName: "",
  userEmail: "",
  defaultBranch: "main",
  pruneOnFetch: false,
  autoRefresh: true,
  showHiddenFiles: false,
  diffView: "unified",
  confirmDiscard: true,
  confirmPush: true,
  autoPushOnCommit: false,
  aiCommitMessagesEnabled: false,
  aiCommitEndpoint: "https://api.openai.com/v1",
  aiCommitModel: "gpt-4.1-mini",
  aiCommitApiKey: "",
  theme: getStoredTheme(),
  defaultAgent: "",
};

const SETTINGS_KEY = "quanta-settings";
const API_KEY_KEY = "quanta-ai-api-key";

const hasElectronAPI = typeof window !== "undefined" && !!window.electronAPI;

async function loadApiKey(): Promise<string> {
  if (hasElectronAPI) {
    try {
      return await window.electronAPI!.loadApiKey();
    } catch {
      return "";
    }
  }
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(API_KEY_KEY) ?? "";
  }
  return "";
}

async function storeApiKey(key: string): Promise<void> {
  if (hasElectronAPI) {
    try {
      await window.electronAPI!.storeApiKey(key);
    } catch {
      // ignored
    }
  }
}

async function clearApiKey(): Promise<void> {
  if (hasElectronAPI) {
    try {
      await window.electronAPI!.clearApiKey();
    } catch {
      // ignored
    }
  }
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    const base = stored ? { ...DEFAULTS, ...JSON.parse(stored) } : { ...DEFAULTS };
    const apiKey = await loadApiKey();
    if (apiKey) base.aiCommitApiKey = apiKey;
    return base;
  } catch {}
  return { ...DEFAULTS };
}

async function saveSettings(settings: AppSettings): Promise<void> {
  const { aiCommitApiKey, ...rest } = settings;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
  if (aiCommitApiKey) {
    await storeApiKey(aiCommitApiKey);
  } else {
    await clearApiKey();
  }
}

interface SettingsStore {
  settings: AppSettings;
  settingsLoaded: boolean;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: { ...DEFAULTS },
  settingsLoaded: false,

  updateSetting: (key, value) =>
    set((state) => {
      const next = { ...state.settings, [key]: value };
      void saveSettings(next);
      if (key === "theme") {
        storeTheme(value as ThemeId);
      }
      return { settings: next };
    }),

  resetSettings: () =>
    set(() => {
      void saveSettings({ ...DEFAULTS });
      return { settings: { ...DEFAULTS } };
    }),
}));

// Initialize settings asynchronously
void loadSettings().then((loaded) => {
  useSettingsStore.setState({ settings: loaded, settingsLoaded: true });
});
