#!/usr/bin/env bash
# Detects drift between skills/plugins and the actual workflow contract.
# Exits 1 on any forbidden pattern. Exits 0 when clean.
set -euo pipefail

# Resolve repo root (parent of scripts/)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
failures=0

# Pattern 1: orchestration category references (outside of THIS script and COMPLETE-CODEBASE.md, which documents history)
if grep -rn --include='SKILL.md' --include='*.js' -l '\borchestration\b' \
   "$REPO_ROOT/skills/" "$REPO_ROOT/plugins/sisyphus-gates/src/" 2>/dev/null \
   | grep -v -e 'system-reference/SKILL.md' -e 'frontend-ui-ux/SKILL.md' -e 'fullstack-dev/SKILL.md' > /tmp/contract-drift-files; then
  if [ -s /tmp/contract-drift-files ]; then
    echo "FAIL: 'orchestration' category references found in:"
    cat /tmp/contract-drift-files
    failures=$((failures + 1))
  fi
fi

# Pattern 2: Relative .sisyphus/state/ paths (NOT the canonical ~/.sisyphus/state.json form)
if grep -rn --include='SKILL.md' --include='*.sh' --include='*.js' '\.sisyphus/state/[a-z]' \
   "$REPO_ROOT/skills/" "$REPO_ROOT/scripts/" "$REPO_ROOT/plugins/" 2>/dev/null \
   | grep -v '~/\.sisyphus/state.json' > /tmp/contract-drift-paths; then
  if [ -s /tmp/contract-drift-paths ]; then
    echo "FAIL: relative '.sisyphus/state/{slug}' paths found (use canonical form):"
    cat /tmp/contract-drift-paths
    failures=$((failures + 1))
  fi
fi

if [ "$failures" -gt 0 ]; then
  echo "Contract drift detected: $failures category/categories"
  exit 1
fi

echo "Contract drift check: PASS"
exit 0
