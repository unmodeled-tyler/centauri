#!/usr/bin/env bash
set -euo pipefail

APP_NAME="centauri"
REPO_SLUG="${CENTAURI_REPO:-unmodeled-tyler/centauri}"
REF="${CENTAURI_REF:-main}"
INSTALL_DIR="${CENTAURI_HOME:-$HOME/.local/share/centauri}"
BIN_DIR="${CENTAURI_BIN_DIR:-$HOME/.local/bin}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$(mktemp -d)"
ARCHIVE_URL="${CENTAURI_ARCHIVE_URL:-https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/heads/${REF}}"

cleanup() {
  rm -rf "$TMP_DIR"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

check_node_version() {
  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if [ "$major" -lt 20 ]; then
    echo "Node.js 20 or newer is required." >&2
    exit 1
  fi
}

copy_local_checkout() {
  mkdir -p "$INSTALL_DIR"
  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  tar \
    --exclude="./node_modules" \
    --exclude="./dist" \
    --exclude="./build" \
    --exclude="./.git" \
    --exclude="./.venv" \
    -C "$LOCAL_SOURCE_DIR" \
    -cf - . | tar -C "$INSTALL_DIR" -xf -
}

download_archive() {
  echo "Downloading ${APP_NAME} from ${ARCHIVE_URL}"
  curl -fsSL "$ARCHIVE_URL" -o "$TMP_DIR/$APP_NAME.tar.gz"

  mkdir -p "$INSTALL_DIR"
  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  tar -xzf "$TMP_DIR/$APP_NAME.tar.gz" --strip-components=1 -C "$INSTALL_DIR"
}

install_app() {
  cd "$INSTALL_DIR"
  npm ci
  npm run build
  npm prune --omit=dev
}

install_launcher() {
  mkdir -p "$BIN_DIR"
  ln -sf "$INSTALL_DIR/bin/centauri.js" "$BIN_DIR/centauri"
}

print_success() {
  cat <<EOF

Installed ${APP_NAME} to ${INSTALL_DIR}
Launcher: ${BIN_DIR}/centauri

If ${BIN_DIR} is not already on your PATH, add this line to your shell profile:
  export PATH="${BIN_DIR}:\$PATH"

First-run GitHub setup:
  gh auth login
  git config --global user.name "Your Name"
  git config --global user.email "you@example.com"

Launch:
  centauri
EOF
}

trap cleanup EXIT

require_cmd curl
require_cmd tar
require_cmd node
require_cmd npm
check_node_version

if [ -f "$LOCAL_SOURCE_DIR/package.json" ] && [ -f "$LOCAL_SOURCE_DIR/bin/centauri.js" ]; then
  echo "Installing ${APP_NAME} from local checkout"
  copy_local_checkout
else
  download_archive
fi

install_app
install_launcher
print_success
