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

# Strip the GIT_* vars git injects into hook environments BEFORE running the
# suite. Hooks run with GIT_DIR/GIT_WORK_TREE set (pointing at this repo);
# any suite test that spawns git (fixtures, scratch repos) would otherwise
# inherit them and silently commit into the checkout repo — the 2026-11-03
# incident where the sis-memory standing set's T3 fixture commit landed on
# the pushing branch via exactly this channel. The hook's own git calls
# below work by normal discovery without these vars.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR || true

REPO_ROOT="$(git rev-parse --show-toplevel)"
PLUGIN_DIR="$REPO_ROOT/plugins/sisyphus-gates"

echo "==> pre-push: running test suite..."

# 1. Unit tests
echo "    [1/5] unit tests (677 tests, ~5s)"
(cd "$PLUGIN_DIR" && npm test --silent)

# 2. Plugin compat check
echo "    [2/5] verify-plugin-compat.js"
node "$REPO_ROOT/scripts/verify-plugin-compat.js"

# 3. Self-test (end-to-end)
echo "    [3/5] self-test (22 scenarios, ~50ms)"
(cd "$PLUGIN_DIR" && npm run self-test --silent)

# 4. Doc-claims drift check
echo "    [4/5] doc-claims drift check"
bash "$REPO_ROOT/scripts/check-doc-claims.sh"

# 5. Completion honesty topology gate
echo "    [5/5] completion-honesty topology gate"
bash "$REPO_ROOT/scripts/check-completion-honesty.sh"

# 6. Fleet agent definition validation (parse, posture, live roster,
#    generated-persona drift gate, routing tokens, DAG assertion)
echo "    [6/7] fleet agent definition validation"
python3 "$REPO_ROOT/scripts/validate-agents.py"

# 7. Pipeline persona generator self-test (broken token / drift / DAG catches)
echo "    [7/7] pipeline persona generator self-test"
python3 "$REPO_ROOT/scripts/generate-pipeline-personas.py" --self-test

echo "==> pre-push: PASS"
