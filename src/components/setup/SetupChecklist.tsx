import {
  CheckCircle2,
  CircleAlert,
  Github,
  KeyRound,
  RefreshCw,
  Settings,
  TerminalSquare,
  UserRound,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import type { SystemStatus } from "../../types/system";

function StatusIcon({
  ready,
  icon,
}: {
  ready: boolean;
  icon: ReactNode;
}) {
  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
        ready
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-200"
      }`}
    >
      {icon}
    </div>
  );
}

function SetupCard({
  title,
  description,
  ready,
  icon,
  command,
  note,
  actions,
}: {
  title: string;
  description: string;
  ready: boolean;
  icon: ReactNode;
  command?: string;
  note?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="flex items-start gap-3">
        <StatusIcon ready={ready} icon={icon} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
            {ready ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-amber-200">
                <CircleAlert className="h-3.5 w-3.5" />
                Needs setup
              </span>
            )}
            {actions && <div className="ml-auto">{actions}</div>}
          </div>
          <p className="mt-1 text-sm text-zinc-400">{description}</p>
          {command && (
            <pre className="mt-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200">
              <code>{command}</code>
            </pre>
          )}
          {note && <p className="mt-2 text-xs text-zinc-500">{note}</p>}
        </div>
      </div>
    </div>
  );
}

export function SetupChecklist({
  status,
  loading,
  onOpenSettings,
  onRefresh,
}: {
  status: SystemStatus | null;
  loading: boolean;
  onOpenSettings?: () => void;
  onRefresh?: () => void;
}) {
  if (loading && !status) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Wrench className="h-4 w-4 animate-pulse" />
          Checking local Git, GitHub, and app readiness...
        </div>
      </section>
    );
  }

  if (!status) {
    return null;
  }

  const githubReady = status.github.installed && status.github.authenticated;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Wrench className="h-4 w-4 text-emerald-300" />
            Pre-Flight Checklist
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            )}
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </button>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          Run a quick readiness check before opening a repo. Centauri uses
          your local Git and GitHub setup, while app defaults live in Settings.
        </p>
      </div>

      <div className="space-y-3">
        <SetupCard
          title="Git"
          description={
            status.git.installed
              ? `Installed: ${status.git.version ?? "available"}`
              : "Git is required for repository status, commits, branches, and remotes."
          }
          ready={status.git.installed}
          icon={<TerminalSquare className="h-4 w-4" />}
          note={
            status.git.installed
              ? undefined
              : "Install Git, then reopen Centauri."
          }
        />

        <SetupCard
          title="GitHub CLI"
          description={
            status.github.installed
              ? `Installed: ${status.github.version ?? "available"}`
              : "Optional but recommended. It gives users a straightforward GitHub login path."
          }
          ready={status.github.installed}
          icon={<Github className="h-4 w-4" />}
          note={
            status.github.installed
              ? "You can still use SSH or HTTPS remotes without `gh`, but onboarding is smoother with it."
              : "Install `gh` if you want a guided GitHub sign-in flow."
          }
        />

        <SetupCard
          title="GitHub Auth"
          description={
            githubReady
              ? `Connected as @${status.github.user ?? "github-user"}.`
              : "Authenticate once and GitHub remotes will work with your existing local Git setup."
          }
          ready={githubReady}
          icon={<KeyRound className="h-4 w-4" />}
          command={!githubReady && status.github.installed ? "gh auth login" : undefined}
          note={!githubReady ? status.github.error : undefined}
        />

        <SetupCard
          title="Git Identity"
          description={
            status.gitIdentity.configured
              ? `${status.gitIdentity.name} <${status.gitIdentity.email}>`
              : "Set a global author name and email so commits are attributed correctly."
          }
          ready={status.gitIdentity.configured}
          icon={<UserRound className="h-4 w-4" />}
          command={
            status.gitIdentity.configured
              ? undefined
              : [
                  'git config --global user.name "Your Name"',
                  'git config --global user.email "you@example.com"',
                ].join("\n")
          }
          actions={
            onOpenSettings ? (
              <button
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
              >
                <Settings className="h-3.5 w-3.5" />
                Edit defaults
              </button>
            ) : undefined
          }
          note={
            onOpenSettings
              ? "App-level author defaults and startup preferences can be adjusted in Settings."
              : undefined
          }
        />
      </div>
    </section>
  );
}
