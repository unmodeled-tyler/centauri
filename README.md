
# Centauri

<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/452673df-b0a2-4f18-9960-5fc8eeb3070e" />

<img width="1484" height="1004" alt="centauri-1" src="https://github.com/user-attachments/assets/bd9cf9c7-edf0-4326-a56f-ed17443770b5" />


Centauri is a local-first Git workbench for people who want a focused desktop UI for day-to-day repository work without leaving the normal Git and GitHub tooling they already use.

It runs on your machine, talks to your repositories through the system `git` executable, and gives you a clean interface for reviewing changes, committing, switching branches, checking history, and working with remotes.

I initially built this project for myself as a companion to AI coding tools such as OpenCode or Codex which don't natively support git source control like IDEs such as VS Code or Zed. 

Centauri follows the same lightweight, low-fuss philosophy employed by CLI coding tools. 

## What it does

Centauri is built around a few common Git workflows:

- inspect working tree changes and staged files
- review diffs before committing
- stage, unstage, discard, and ignore files
- create commits and push them upstream
- switch, create, and delete branches
- inspect commit history
- explore files, blame, search, tags, TODOs, and compare refs
- visualize repo structure in an interactive dependency graph
- manage stashes and guided rebases
- review repository stats and local setup health
- fetch, pull, and push remotes
- verify local Git and GitHub readiness with a pre-flight checklist before opening a repo

The app is intended to complement normal CLI-based development, not replace it. It uses your existing local Git configuration, credentials, and remote setup.

## How it works

Centauri is not a hosted service and it does not proxy your repositories through a cloud backend.

- repositories stay on your machine
- Git operations are executed through the local `git` binary
- GitHub access uses your normal local credentials
- the app reads your environment and Git config rather than inventing its own auth system

If you already work with `git`, `gh`, SSH remotes, or HTTPS remotes locally, Centauri is designed to fit into that setup.

## Features

### Repository opener

- open a repo by path
- browse directories to find a repository
- reuse recent repositories
- adjust startup defaults before opening a repo

### Changes and diff review

- view modified, staged, untracked, renamed, and conflicted files
- see addition and deletion counts per file
- inspect diffs in the main workspace
- stage and unstage individual files
- discard changes
- add files or patterns to `.gitignore`

### Commits and remotes

- write commit messages and create commits from the UI
- optionally push immediately after a commit
- fetch, pull, and push using the current repo's remotes
- see ahead/behind status from the current branch

### Branches and history

- list local and remote branches
- switch branches
- create new branches
- delete branches
- inspect recent commit history

### Explorer workspace

- browse the repository file tree
- open files with blame and file history side panels
- search code with grep-style results
- run pickaxe searches to find when content was added or removed
- compare two refs and inspect changed files
- scan TODO-style comments across the repo
- view, create, and delete tags

### Neural graph visualizer

- render an interactive deep-space dependency graph for the current repo
- inspect file and symbol nodes with hover labels and a sidebar inspector
- filter graph nodes by name or group
- tune layout physics for charge, link distance, and simulation iterations
- right-click graph nodes to open their backing file in the Explorer
- use GitNexus data when available, with a local import-scan fallback for dependency edges

### Stashes and rebase

- view and apply local stashes
- pop stashes back into the working tree
- drop stashes you no longer need
- build an interactive rebase plan from recent commits
- reorder, squash, fix up, reword, or drop commits before starting the rebase

### Repository stats

- review the last 12 months of commit activity for your configured Git identity
- use the stats view as a quick personal activity snapshot for the current repo

### AI commit messages

- optionally generate commit messages from the current diff
- configure an OpenAI-compatible endpoint
- set the model name and API key through local settings
- test model availability from the settings screen
- keep the feature disabled when you want a fully manual commit flow

### Pre-flight checklist

Before opening a repo, the app can check:

- whether `git` is installed
- whether GitHub CLI is installed
- whether GitHub CLI is authenticated
- whether your Git identity is configured

That checklist stays useful after initial setup because it gives you a quick sanity check that your local environment is ready before you start working.

## Requirements

- Node.js 20+
- `git`
- `curl` and `tar` for the hosted installer

Optional but recommended:

- `gh` for the smoothest GitHub authentication flow

## Install

Install from GitHub with:

```bash
curl -fsSL https://raw.githubusercontent.com/unmodeled-tyler/centauri/main/scripts/install.sh | bash
```

The installer:

- downloads the app into `~/.local/share/centauri`
- installs dependencies
- builds the production frontend and backend
- creates a launcher at `~/.local/bin/centauri`

If `~/.local/bin` is not already on your `PATH`, add it to your shell profile:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Then start the app with:

```bash
centauri
```

## GitHub setup

Centauri does not create or store a separate GitHub auth model. It uses the same local credentials your Git tools already use.

The simplest GitHub setup is:

```bash
gh auth login
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

If you prefer SSH or HTTPS remotes without GitHub CLI, that works too. The app's pre-flight checklist will tell you what is available on the current machine.

## Usage

Typical flow:

1. Launch `centauri`
2. Check the pre-flight panel
3. Open a local repository
4. Review changes and diffs
5. Commit, branch, fetch, pull, or push as needed

The app is especially useful when you want a faster visual pass over repository state while still keeping your normal terminal-based workflow.

## Development

Install dependencies:

```bash
npm install
```

Run the standard dev servers:

```bash
npm run dev
```

Run the production build locally:

```bash
npm run build
npm start
```

Run the compiled production launcher:

```bash
npm run start:cli
```

Run the repo-local desktop dev launcher:

```bash
npm run dev:cli
```

That launcher starts the local API server and Vite client, then opens Centauri in a minimal Electron window for testing.

## Notes

- Centauri is currently centered on local repository operations, not GitHub PR review or hosted account management.
- The app depends on your system Git installation being available in `PATH`.
- GitHub CLI is optional, but it improves first-run GitHub connectivity for most users.
- This is really just a side project for me - I update it when I can/feel the inspo. I'm open to suggestions/PRs/etc.

## License

[MIT](./LICENSE)
