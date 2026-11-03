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

# Resolve the COMMON git dir: in a worktree, $REPO_ROOT/.git is a file (a
# gitdir pointer), and hooks live in the shared common dir — installing to
# .git/hooks/ fails with "Not a directory" (first worktree lane that tried
# to install, 2026-11-03). --path-format=absolute needs git ≥ 2.31; fall
# back to the relative form + manual absolutization.
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"
if [ -z "$COMMON_DIR" ]; then
  COMMON_DIR="$(git rev-parse --git-common-dir)"
  case "$COMMON_DIR" in
    /*) ;;                              # already absolute
    *) COMMON_DIR="$REPO_ROOT/$COMMON_DIR" ;;
  esac
fi
HOOK_DST="$COMMON_DIR/hooks/pre-push"

if [ ! -f "$HOOK_SRC" ]; then
  echo "ERROR: $HOOK_SRC not found"
  exit 1
fi

cp -f "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"

echo "Installed pre-push hook → $HOOK_DST"
echo "Run \`git push --no-verify\` to bypass if needed."
