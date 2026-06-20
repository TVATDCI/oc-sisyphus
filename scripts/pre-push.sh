#!/usr/bin/env bash
# pre-push.sh — local pre-push hook for sisyphus-gates
#
# Runs the same tests that CI's `test` job runs in Tier 1. Fails the push
# if any test fails. Saves a round-trip to CI for common mistakes.
#
# This file is the SOURCE. It is installed to .git/hooks/pre-push by
# `scripts/install-hooks.sh` (or `npm run install:hooks` from the repo root).
#
# If you need to bypass (e.g., pushing a WIP commit), use:
#   git push --no-verify

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
PLUGIN_DIR="$REPO_ROOT/plugins/sisyphus-gates"

echo "==> pre-push: running test suite..."

# 1. Unit tests
echo "    [1/5] unit tests (180 tests, ~400ms)"
(cd "$PLUGIN_DIR" && npm test --silent)

# 2. Plugin compat check
echo "    [2/5] verify-plugin-compat.js"
node "$REPO_ROOT/scripts/verify-plugin-compat.js"

# 3. Self-test (end-to-end)
echo "    [3/5] self-test (20 scenarios, ~50ms)"
(cd "$PLUGIN_DIR" && npm run self-test --silent)

# 4. Doc-claims drift check
echo "    [4/5] doc-claims drift check"
bash "$REPO_ROOT/scripts/check-doc-claims.sh"

# 5. Completion honesty topology gate
echo "    [5/5] completion-honesty topology gate"
bash "$REPO_ROOT/scripts/check-completion-honesty.sh"

echo "==> pre-push: PASS"
