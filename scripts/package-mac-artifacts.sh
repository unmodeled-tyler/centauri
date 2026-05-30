#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "macOS artifacts must be packaged on macOS." >&2
  exit 1
fi

APP_NAME="Centauri"
VERSION="$(node -p "require('./package.json').version")"
RELEASE_DIR="release"
APP_DIR="${RELEASE_DIR}/mac-universal/${APP_NAME}.app"
ZIP_PATH="${RELEASE_DIR}/${APP_NAME}-${VERSION}-universal.zip"
DMG_PATH="${RELEASE_DIR}/${APP_NAME}-${VERSION}-universal.dmg"

if [ ! -d "$APP_DIR" ]; then
  echo "Missing ${APP_DIR}. Run npm run build:mac:dir first." >&2
  exit 1
fi

rm -f "$ZIP_PATH" "$DMG_PATH" "${ZIP_PATH}.blockmap" "${DMG_PATH}.blockmap"

ditto -c -k --sequesterRsrc --keepParent "$APP_DIR" "$ZIP_PATH"
hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$APP_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

ls -lh "$ZIP_PATH" "$DMG_PATH"
