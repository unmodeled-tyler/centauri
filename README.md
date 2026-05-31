# Centauri

<img width="1484" height="1004" alt="centauri" src="https://github.com/user-attachments/assets/aeaa423b-89c7-498b-b815-058a6c3f34be" />
<img width="1920" height="1080" alt="Screenshot From 2026-05-22 20-57-14" src="https://github.com/user-attachments/assets/2ef80fa5-3921-4bfb-bd45-af510be1449b" />


**Centauri** is a local-first **Agent Development Environment (ADE)** that pairs conversational coding agents with a focused Git source-control workspace.

It gives you a clean side-by-side flow:

- run your preferred CLI coding agent in either a streamlined chat interface or an embedded terminal
- watch repository changes appear in the Changes panel
- generate a best-practice commit message
- commit and push without leaving the app

Centauri is designed to complement tools like Claude Code, Codex, Droid, pi, Mistral Vibe, OpenCode, Aider, Gemini CLI, and other terminal-first agents. It does not replace Git, your terminal, or your existing credentials — it wraps the local tools you already use in a tighter building loop.

## Current status

Centauri is early and moving fast. The core local ADE loop is in place, but expect sharp edges while the product direction settles.

## Features

### Streamline agent chat

Streamline mode gives CLI coding agents a regular chat-style interface while still running the underlying harness on your machine in the opened repository.

- use chat-capable CLI harnesses through the same clean conversation UI
- switch between supported tools such as Claude Code, Codex, Droid, pi, and Mistral Vibe
- stream agent responses into the chat instead of waiting for the final transcript
- show tool activity inline with readable summaries
- stop an in-progress agent response from the send button
- render agent messages as Markdown
- keep the terminal-first harness model without exposing the full TUI when you want a calmer interface

You can enable Streamline mode in Settings. The traditional terminal mode remains available for tools or workflows that work best as a raw TUI.

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
- Droid: `droid`
- Mistral Vibe: `vibe`
- OpenCode: `opencode`
- Aider: `aider`
- Gemini CLI: `gemini`
- Cursor Agent: `cursor-agent`
- Amp: `amp`
- Hermes: `hermes`
- OpenClaw: `openclaw`

### Git changes workflow

- inspect modified, staged, untracked, renamed, deleted, and conflicted files
- stage and unstage files
- discard changes with confirmation support
- add files or patterns to `.gitignore`
- review diffs with syntax-highlighted visible file content
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
- Streamline chat talks to the same local CLI harnesses rather than a hosted Centauri agent
- GitHub access uses your existing `git`, SSH, HTTPS, or `gh` credentials
- no hosted Centauri backend is required

## Requirements

- Node.js 20+
- `git`
- at least one supported coding-agent CLI if you want to use the agent terminal or Streamline chat

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

This starts the local API server, Vite frontend, and opens Centauri in its own Electron app window. On Linux, the dev launcher passes Electron `--no-sandbox` so local `node_modules/electron` works without configuring the SUID sandbox helper.

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

## macOS universal build

Centauri can also be packaged as an unsigned universal macOS Electron app for both Apple Silicon and Intel Macs:

```bash
npm run build:mac
```

This writes a universal `.dmg` and `.zip` to `release/`. For a faster local packaging smoke test without creating installer artifacts:

```bash
npm run build:mac:dir
```

The packaged app starts its own local Centauri API server and serves the built UI from the app bundle. Because local builds are unsigned, macOS Gatekeeper may require opening the app from Finder with **Open** the first time.

## Scripts

```bash
npm run dev          # start server + frontend and open Electron app window
npm run dev:web      # start server + frontend only
npm run dev:server   # start API server in watch mode
npm run dev:client   # start Vite frontend
npm run dev:cli      # alias for the desktop dev launcher
npm run build        # build frontend and backend
npm run build:mac    # build unsigned universal macOS dmg + zip
npm run build:mac:dir # build unpacked universal macOS app directory
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

By default the action runs `npm ci`, `npm run typecheck`, and `npm run build` before promotion. If `main` has commits that are not yet in `dev`, the workflow first merges `main` into the promotion candidate, then fast-forwards both `dev` and `main` to the checked commit.

## Debian release

Install or upgrade a downloaded package with:

```bash
sudo apt install ./centauri_<version>_amd64.deb
```

Newer `.deb` releases install directly over older Centauri `.deb` installs because the package name stays `centauri` and the version increases. The package also declares `Conflicts/Replaces: quanta-control` for compatibility with any older Debian package under the previous app name.

## Release workflows

GitHub Actions includes separate manual release builders for Linux `.deb` packages and universal macOS `.dmg`/`.zip` artifacts. Both default to draft prereleases and can use either the `package.json` version or a version/tag provided from the workflow dispatch form.

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
- tighter handoff between selected files/diffs and Streamline prompts
- richer post-agent review flows
- commit/push presets
- installer/package polish
- app icon and release builds

## License

[MIT](./LICENSE)
