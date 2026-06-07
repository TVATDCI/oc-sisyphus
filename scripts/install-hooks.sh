#!/usr/bin/env bash
# install-hooks.sh — install git hooks from this repo into .git/hooks/
#
# Copies scripts/pre-push.sh to .git/hooks/pre-push. Idempotent.
# Run after every fresh clone: `npm run install:hooks`

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$REPO_ROOT" ]; then
  echo "ERROR: not inside a git repository. Run from a clone of the repo."
  exit 1
fi

HOOK_SRC="$REPO_ROOT/scripts/pre-push.sh"
HOOK_DST="$REPO_ROOT/.git/hooks/pre-push"

if [ ! -f "$HOOK_SRC" ]; then
  echo "ERROR: $HOOK_SRC not found"
  exit 1
fi

cp -f "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"

echo "Installed pre-push hook → $HOOK_DST"
echo "Run \`git push --no-verify\` to bypass if needed."
