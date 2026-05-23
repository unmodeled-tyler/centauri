import { useState, useEffect } from "react";
import {
  User,
  RefreshCw,
  Eye,
  SplitSquareHorizontal,
  AlignLeft,
  Shield,
  RotateCcw,
  FolderOpen,
  Bot,
  Palette,
} from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useRepoStore } from "../../stores/repoStore";
import { ConfirmDialog } from "../common/Dialog";
import { THEMES, THEME_ORDER } from "../../themes/themes";
import * as api from "../../services/api";

export function SettingsView() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const resetSettings = useSettingsStore((s) => s.resetSettings);
  const repoPath = useRepoStore((s) => s.repoPath);
  const [gitConfig, setGitConfig] = useState<{ name: string; email: string } | null>(null);
  const [testingAiEndpoint, setTestingAiEndpoint] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [aiEndpointTestResult, setAiEndpointTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!repoPath) return;
    Promise.all([
      api.getGitConfig(repoPath, "user.name"),
      api.getGitConfig(repoPath, "user.email"),
    ])
      .then(([nameRes, emailRes]) => {
        setGitConfig({
          name: nameRes.value,
          email: emailRes.value,
        });
      })
      .catch(() => {});
  }, [repoPath]);

  const handleTestAiEndpoint = async () => {
    const endpoint = settings.aiCommitEndpoint.trim();
    if (!endpoint) {
      setAiEndpointTestResult({ ok: false, message: "Set an endpoint first." });
      return;
    }

    setTestingAiEndpoint(true);
    setAiEndpointTestResult(null);
    try {
      const result = await api.testAiEndpoint({
        endpoint,
        model: settings.aiCommitModel.trim() || undefined,
        apiKey: settings.aiCommitApiKey.trim() || undefined,
      });
      const model = settings.aiCommitModel.trim();
      const modelMessage =
        !model || result.modelFound === null
          ? `${result.modelCount} model${result.modelCount === 1 ? "" : "s"} returned.`
          : result.modelFound
          ? `Model "${model}" found.`
          : `Connected, but "${model}" was not listed.`;
      setAiEndpointTestResult({
        ok: result.success && result.modelFound !== false,
        message: `${modelMessage} Tested ${result.url}`,
      });
    } catch (err) {
      setAiEndpointTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Endpoint test failed.",
      });
    } finally {
      setTestingAiEndpoint(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-xl mx-auto p-6 space-y-8">
        <div>
          <h2 className="text-lg font-semibold mb-1">Settings</h2>
          <p className="text-sm text-zinc-500">Configure your Centauri preferences</p>
        </div>

        <section>
          <SectionHeader icon={<User className="w-4 h-4" />} title="Git Identity" />
          <div className="space-y-3 mt-3">
            {gitConfig && (
              <div className="px-3 py-2 bg-zinc-900/60 border border-zinc-800/60 rounded-md shadow-sm shadow-black/5">
                <div className="text-xs text-zinc-500 mb-1">Detected from git config</div>
                <div className="text-sm text-zinc-300">
                  {gitConfig.name} &lt;{gitConfig.email}&gt;
                </div>
              </div>
            )}
            <TextInput
              label="Default author name"
              value={settings.userName}
              onChange={(v) => updateSetting("userName", v)}
              placeholder="Uses git config if empty"
            />
            <TextInput
              label="Default author email"
              value={settings.userEmail}
              onChange={(v) => updateSetting("userEmail", v)}
              placeholder="Uses git config if empty"
            />
          </div>
        </section>

        <section>
          <SectionHeader icon={<FolderOpen className="w-4 h-4" />} title="Repository" />
          <div className="space-y-3 mt-3">
            <TextInput
              label="Default repo path"
              value={settings.defaultRepoPath}
              onChange={(v) => updateSetting("defaultRepoPath", v)}
              placeholder="~/my-project"
            />
            <TextInput
              label="Default branch name"
              value={settings.defaultBranch}
              onChange={(v) => updateSetting("defaultBranch", v)}
              placeholder="main"
            />
          </div>
        </section>

        <section>
          <SectionHeader icon={<RefreshCw className="w-4 h-4" />} title="Auto Refresh" />
          <div className="space-y-3 mt-3">
            <Toggle
              label="Auto refresh repo"
              description="Watch the working tree and auto-refresh on file changes"
              checked={settings.autoRefresh}
              onChange={(v) => updateSetting("autoRefresh", v)}
            />
            <Toggle
              label="Prune on fetch"
              description="Remove stale remote-tracking references"
              checked={settings.pruneOnFetch}
              onChange={(v) => updateSetting("pruneOnFetch", v)}
            />
          </div>
        </section>

        <section>
          <SectionHeader icon={<Eye className="w-4 h-4" />} title="Display" />
          <div className="space-y-3 mt-3">
            <Toggle
              label="Show hidden files"
              description="Show dotfiles in the file browser"
              checked={settings.showHiddenFiles}
              onChange={(v) => updateSetting("showHiddenFiles", v)}
            />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-zinc-300">Diff view style</div>
                <div className="text-xs text-zinc-600">Default diff display mode</div>
              </div>
              <div className="flex rounded-md border border-zinc-700 overflow-hidden">
                <button
                  onClick={() => updateSetting("diffView", "unified")}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                    settings.diffView === "unified"
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <AlignLeft className="w-3 h-3" />
                  Unified
                </button>
                <button
                  onClick={() => updateSetting("diffView", "split")}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                    settings.diffView === "split"
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <SplitSquareHorizontal className="w-3 h-3" />
                  Split
                </button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader icon={<Palette className="w-4 h-4" />} title="Theme" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {THEME_ORDER.map((id) => {
              const theme = THEMES[id];
              const isActive = settings.theme === id;
              return (
                <button
                  key={id}
                  onClick={() => updateSetting("theme", id)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-all ${
                    isActive
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                      : "border-zinc-700/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                  }`}
                >
                  <span
                    className="block h-3.5 w-3.5 rounded-full border border-zinc-600"
                    style={{ background: theme.terminal.background }}
                  />
                  {theme.label}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <SectionHeader icon={<Shield className="w-4 h-4" />} title="Confirmations" />
          <div className="space-y-3 mt-3">
            <Toggle
              label="Confirm before discarding"
              description="Show confirmation dialog when discarding changes"
              checked={settings.confirmDiscard}
              onChange={(v) => updateSetting("confirmDiscard", v)}
            />
            <Toggle
              label="Confirm before pushing"
              description="Show confirmation dialog when pushing to remote"
              checked={settings.confirmPush}
              onChange={(v) => updateSetting("confirmPush", v)}
            />
          </div>
        </section>

        <section>
          <SectionHeader icon={<Bot className="w-4 h-4" />} title="AI Commit Messages" />
          <div className="space-y-3 mt-3">
            <Toggle
              label="Enable AI commit button"
              description="Show a commit-message generator in the commit panel"
              checked={settings.aiCommitMessagesEnabled}
              onChange={(v) => updateSetting("aiCommitMessagesEnabled", v)}
            />
            <TextInput
              label="OpenAI-compatible endpoint"
              value={settings.aiCommitEndpoint}
              onChange={(v) => updateSetting("aiCommitEndpoint", v)}
              placeholder="https://api.openai.com/v1"
            />
            <TextInput
              label="Model"
              value={settings.aiCommitModel}
              onChange={(v) => updateSetting("aiCommitModel", v)}
              placeholder="gpt-4.1-mini"
            />
            <TextInput
              label="API key"
              value={settings.aiCommitApiKey}
              onChange={(v) => updateSetting("aiCommitApiKey", v)}
              placeholder="Optional for local endpoints"
              type="password"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleTestAiEndpoint}
                disabled={testingAiEndpoint || !settings.aiCommitEndpoint.trim()}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 border border-zinc-700/80 rounded-md text-sm font-medium transition-all duration-150"
              >
                {testingAiEndpoint ? "Testing..." : "Test Endpoint"}
              </button>
              {aiEndpointTestResult && (
                <div
                  className={`min-w-0 flex-1 text-xs ${
                    aiEndpointTestResult.ok ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {aiEndpointTestResult.message}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="pt-4 border-t border-zinc-800/60">
          <button
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-md transition-all duration-150"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>
        </section>

        {confirmReset && (
          <ConfirmDialog
            title="Reset Settings"
            message="Reset all settings to defaults?"
            confirmLabel="Reset"
            danger
            onConfirm={() => {
              setConfirmReset(false);
              resetSettings();
            }}
            onCancel={() => setConfirmReset(false)}
          />
        )}
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
      {icon}
      {title}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-zinc-300">{label}</div>
        {description && <div className="text-xs text-zinc-600">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? "bg-emerald-600" : "bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-sm text-zinc-300 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 bg-zinc-900/60 border border-zinc-700/80 rounded-md text-sm focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/20 placeholder-zinc-600 transition-all duration-150"
      />
    </div>
  );
}
