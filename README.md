# Centauri

<img width="1484" height="1004" alt="centauri" src="https://github.com/user-attachments/assets/aeaa423b-89c7-498b-b815-058a6c3f34be" />


Centauri is a local-first **Agent Development Environment (ADE)** that pairs conversational coding agents with a focused Git source-control workspace.

It gives you a clean side-by-side flow:

- run your preferred CLI coding agent in an embedded terminal
- watch repository changes appear in the Changes panel
- generate a best-practice commit message
- commit and push without leaving the app

Centauri is designed to complement tools like Claude Code, Codex, pi, OpenCode, Aider, Gemini CLI, and other terminal-first agents. It does not replace Git, your terminal, or your existing credentials — it wraps the local tools you already use in a tighter building loop.

## Current status

Centauri is early and moving fast. The core local ADE loop is in place, but expect sharp edges while the product direction settles.

## Features

### Agent terminal

- embedded pseudo-terminal powered by `node-pty` and `xterm.js`
- runs selected agent CLIs inside the currently opened repository
- auto-detects supported coding CLIs from your `PATH`
- only shows detected tools that are ready to launch
- resizable right-side agent panel
- preserves terminal padding and refits the TUI as the panel size changes

Supported detection targets currently include:

- Claude Code: `claude`
- Codex: `codex`
- pi: `pi`
- OpenCode: `opencode`
- Aider: `aider`
- Gemini CLI: `gemini`
- Cursor Agent: `cursor-agent`
- Amp: `amp`

### Git changes workflow

- inspect modified, staged, untracked, renamed, deleted, and conflicted files
- stage and unstage files
- discard changes with confirmation support
- add files or patterns to `.gitignore`
- review diffs when needed
- write commit messages from the Changes panel
- generate AI commit messages from uncommitted changes
- commit all/staged changes
- push current branch

### Git workbench

Centauri also includes the original Git workbench capabilities:

- branch list, checkout, create, and delete
- commit history
- remotes: fetch, pull, push
- stashes
- guided interactive rebase planning
- file explorer, blame, file history, grep, pickaxe search, tags, and compare refs
- dependency graph visualization
- repo stats
- setup/pre-flight checks for local Git/GitHub readiness

## Local-first design

Centauri runs on your machine and talks to local tools:

- repositories stay on your filesystem
- Git operations use your system `git` executable
- agent sessions run through your installed CLI tools
- GitHub access uses your existing `git`, SSH, HTTPS, or `gh` credentials
- no hosted Centauri backend is required

## Requirements

- Node.js 20+
- `git`
- at least one supported coding-agent CLI if you want to use the agent terminal

Optional:

- `gh` for a smoother GitHub authentication/setup flow

## Install from source

Clone the repo and install dependencies:

```bash
git clone https://github.com/unmodeled-tyler/centauri.git
cd centauri
npm install
```

Run the app in development mode:

```bash
npm run dev
```

This starts the local API server, Vite frontend, and opens Centauri in its own Electron app window.

If you only want the API and Vite servers without launching the desktop window:

```bash
npm run dev:web
```

## Production build

```bash
npm run build
npm start
```

Or use the CLI launcher after building:

```bash
npm run start:cli
```

## Scripts

```bash
npm run dev          # start server + frontend and open Electron app window
npm run dev:web      # start server + frontend only
npm run dev:server   # start API server in watch mode
npm run dev:client   # start Vite frontend
npm run dev:cli      # alias for the desktop dev launcher
npm run build        # build frontend and backend
npm start            # run built server
npm run start:cli    # run built app through CLI launcher
npm run typecheck    # TypeScript checks for client and server
npm run lint         # ESLint
```

## Branch workflow

The intended repo flow is:

- `dev` receives active work and nightly changes
- `main` stays as the promoted/stable branch
- the **Promote dev to main** GitHub Action can be run manually from the Actions tab

To promote `dev`, open GitHub Actions, choose **Promote dev to main**, run the workflow, and type:

```txt
promote dev
```

By default the action runs `npm ci`, `npm run typecheck`, and `npm run build` before pushing `dev` to `main`.

## Debian release workflow

The **Build deb release** GitHub Action can be run manually from the Actions tab. It:

- installs dependencies with `npm ci`
- runs typecheck and production build
- assembles an `amd64` Debian package
- creates or updates a GitHub release
- uploads `centauri_<version>_amd64.deb` as a release asset

The workflow accepts optional `version` and `tag` inputs. If omitted, it uses the version from `package.json` and creates a `v<version>` tag.

Install or upgrade a downloaded package with:

```bash
sudo apt install ./centauri_<version>_amd64.deb
```

Newer `.deb` releases install directly over older Centauri `.deb` installs because the package name stays `centauri` and the version increases. The package also declares `Conflicts/Replaces: quanta-control` for compatibility with any older Debian package under the previous app name.

## AI commit messages

Centauri can generate commit messages from the current Git diff using an OpenAI-compatible endpoint configured in Settings.

The prompt is tuned for concise, professional Conventional Commit-style messages and treats diffs/filenames as data, not instructions.

## Security notes

Centauri is intentionally local-first, but it still launches real local processes:

- agent CLIs run with your local user permissions
- commands execute in the selected repository directory
- only launch tools you trust
- AI commit-message generation sends summarized diff context to the endpoint you configure
- obvious secret patterns are scrubbed before AI commit-message requests, but review generated context/settings carefully if working with sensitive repos

## GitHub setup

Centauri uses your existing Git/GitHub setup. A common first-time setup is:

```bash
gh auth login
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

SSH and HTTPS remotes work too as long as your local Git environment can use them.

## Roadmap ideas

- multiple named agent sessions per repo
- session persistence/history
- tighter handoff between selected files/diffs and agent prompts
- richer post-agent review flows
- commit/push presets
- installer/package polish
- app icon and release builds

## License

[MIT](./LICENSE)
