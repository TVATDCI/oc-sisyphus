#!/usr/bin/env bash
#
# Load project rules — automated rule detection and context injection.
# Called by wave-executor Step 0 during execution setup.
#
# Usage:
#   ./load-rules.sh [project-dir]
#
# Reads rule files matching detected project type and outputs them
# for injection into agent context. Exit 0 always (best-effort load).
#
# shellcheck disable=SC2312

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES_DIR="${SCRIPT_DIR}/../rules"
TARGET_DIR="${1:-$(pwd)}"

cd "$TARGET_DIR"

RULES_LOADED=0

load_if_exists() {
  local rule="$1"
  local full_path="${RULES_DIR}/${rule}"
  if [ -f "$full_path" ]; then
    echo "=== $rule ==="
    cat "$full_path"
    echo ""
    RULES_LOADED=$((RULES_LOADED + 1))
  fi
}

# Always load efficiency rules (universal)
load_if_exists "concerns/efficiency.md"

# Detect project type and load matching rules
[ -f package.json ] && load_if_exists "languages/typescript.md"
[ -f requirements.txt ] || [ -f pyproject.toml ] && load_if_exists "languages/python.md"
[ -f go.mod ] && load_if_exists "languages/go.md"
[ -f Cargo.toml ] && load_if_exists "languages/rust.md"
[ -f flake.nix ] && load_if_exists "languages/nix.md"

# Shell detection: check for .sh files or shell shebangs
if ls *.sh 2>/dev/null | head -1 >/dev/null 2>&1 || \
   grep -rl '#!/bin/bash' --include='*' . 2>/dev/null | head -1 >/dev/null 2>&1; then
  load_if_exists "languages/shell.md"
fi

# Concern-based rules
[ -f jest.config.* ] || [ -f vitest.config.* ] || [ -d tests ] || [ -d __tests__ ] && \
  load_if_exists "concerns/testing.md"

if [ -f .gitignore ] || [ -d .git ]; then
  load_if_exists "concerns/git-workflow.md"
  load_if_exists "concerns/git-identity.md"
fi

[ -f README.md ] && [ -s README.md ] && load_if_exists "concerns/documentation.md"

# Directory structure check for large projects
DIR_COUNT=$(find . -maxdepth 2 -type d 2>/dev/null | wc -l)
[ "$DIR_COUNT" -gt 10 ] && load_if_exists "concerns/project-structure.md"

# Load style and naming rules by default
load_if_exists "concerns/coding-style.md"
load_if_exists "concerns/naming.md"

# TDD rule if detected
[ -f jest.config.* ] || [ -f vitest.config.* ] && load_if_exists "concerns/tdd.md"

echo "[load-rules] Loaded $RULES_LOADED rule(s) for $(basename "$TARGET_DIR")"
exit 0
