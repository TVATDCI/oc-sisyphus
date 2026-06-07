#!/usr/bin/env bash
#
# Regression Gate — sisyphus-gates plugin for the validation phase.
# Called by workflow.yaml. Runs skill/agent structural validation
# before allowing the workflow to advance.
#
# Usage:
#   ./regression-gate.sh [project-dir]
#
# Returns: 0 (pass), non-zero (fail — blocks workflow)

set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALL_PASS=0

echo "[regression-gate] Checking $PROJECT_DIR..."

# — Validation 1: Skill and agent structure —
VALIDATOR="${SCRIPT_DIR}/validate-skills.sh"
if [ -f "$VALIDATOR" ]; then
  echo "[regression-gate] Running validate-skills.sh..."
  if bash "$VALIDATOR" --all; then
    echo "[regression-gate] validate-skills.sh PASS"
  else
    echo "[regression-gate] validate-skills.sh FAIL — see output above"
    ALL_PASS=1
  fi
else
  echo "[regression-gate] WARNING: validate-skills.sh not found at $VALIDATOR"
fi

# — Validation 2: Existing test suites (placeholder) —
# TODO: Add test runner integration when test suites exist
# e.g., pytest, jest, or workflow-specific regression tests

# — Summary —
if [ "$ALL_PASS" -eq 0 ]; then
  echo "[regression-gate] ALL CHECKS PASS"
else
  echo "[regression-gate] SOME CHECKS FAILED — see output above"
fi

exit $ALL_PASS
