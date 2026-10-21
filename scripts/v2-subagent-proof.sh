#!/usr/bin/env bash
#
# v2-subagent-proof.sh — pipe-port-m3 Program 3 (Oracle condition 7).
#
# Proves the sisyphus-gates gate enforces INSIDE a native subagent session —
# the topology the pipeline port introduced (task-spawned child sessions with
# their own session identity). Same discipline as v2-enforcement-proof.sh and
# the same deterministic canary methodology (fm/canary-harden): the verdict
# never depends on a free model complying with an instruction.
#
# Method, all deterministic (zero model spend):
#   1. fresh scratch HOME/XDG sandbox; config tree staged from `git archive
#      HEAD` of THIS checkout (commit-first) via the harness staging area;
#      workflow.yaml present, state.json deliberately ABSENT (fail-closed).
#   2. a REAL opencode server on a private port in the sandbox env.
#   3. two REAL sessions created through the host's public API: a parent and
#      a child (parentID linkage — the session shape the task tool produces;
#      the agent param is passed and its acceptance recorded, not assumed).
#   4. the canary imports the generation's own entry (plugins/sisyphus-gates.js
#      setup(ctx)) from the sandbox copy, then fires against the CHILD
#      session's real sessionID:
#        event A: ONE gated command — tool=bash with a Layer-1 catastrophic
#                 command -> must be BLOCKED by the gate's verdict path;
#        event B: ONE gated write — tool=write under fail-closed state ->
#                 must be BLOCKED with the fail-closed reason.
#      asserts exactly one metric event per attempt recorded under the child
#      sessionID, and no canary artifact.
#
# Usage:   scripts/v2-subagent-proof.sh
# Env:     PIPE_PORT_SCRATCH=<dir>  scratch root (default ~/.cache/pipe-port-m3)
# Exit:    0 = enforcement PROVEN inside the subagent topology
#          1 = NOT proven (details printed; sandbox kept for inspection)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="${PIPE_PORT_SCRATCH:-$HOME/.cache/pipe-port-m3}"
STAGING="$SCRATCH/staging"
SB="$SCRATCH/runs/subagent-proof"
KEEP=0

BIN="${OPENCODE_BIN:-$HOME/.local/share/mise/installs/opencode/2.1.0/node_modules/.bin/opencode}"
if [ ! -x "$BIN" ]; then
  echo "FAIL: opencode binary not found at $BIN" >&2
  exit 1
fi

# commit-first staging (shared with the harness)
TREE_HASH="$(git -C "$REPO_ROOT" rev-parse HEAD)"
if [ ! -f "$STAGING/.tree-hash" ] || [ "$(cat "$STAGING/.tree-hash")" != "$TREE_HASH" ]; then
  python3 "$REPO_ROOT/scripts/pipe-port-validate.py" self-test >/dev/null || {
    echo "FAIL: harness self-test failed; refusing to stage" >&2; exit 1; }
  # staging is built lazily by the harness on first sandbox; force it:
  python3 - "$STAGING" "$REPO_ROOT" <<'PY'
import sys
sys.path.insert(0, sys.argv[2] + "/scripts")
import importlib.util
spec = importlib.util.spec_from_file_location("ppv", sys.argv[2] + "/scripts/pipe-port-validate.py")
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
mod.ensure_staging()
PY
fi

cleanup() {
  if [ "$KEEP" = 1 ]; then
    echo "sandbox kept for inspection: $SB"
  else
    rm -rf "$SB" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# build the sandbox (fail-closed: no state.json)
rm -rf "$SB" 2>/dev/null || true
mkdir -p "$SB/home/.config" "$SB/home/.sisyphus/metrics" "$SB/home/.sisyphus/evidence" \
         "$SB/home/.local/share/opencode" "$SB/project"
cp -r --reflink=auto "$STAGING" "$SB/home/.config/opencode"
cat > "$SB/home/.sisyphus/workflow.yaml" <<'YAML'
workflow:
  name: subagent-proof
  version: "1.0.0"
  description: "Minimal valid workflow for the subagent enforcement proof"
  state_file: "~/.sisyphus/state.json"
  phases:
    - id: discovery
      description: "Explore the problem space freely."
      next_action: "Write the PRD."
    - id: execution
      description: "Full tool access."
      next_action: "Run verification."
  auto_advance: []
  state:
    version: "3.0.0"
    persistent_fields: []
  blocking:
    global_rules: []
YAML
rm -f "$SB/home/.sisyphus/state.json"

export HOME="$SB/home"
export XDG_CONFIG_HOME="$SB/home/.config"
export XDG_DATA_HOME="$SB/home/.local/share"
export XDG_STATE_HOME="$SB/home/.local/state"
export XDG_CACHE_HOME="$SCRATCH/cache"
mkdir -p "$XDG_CACHE_HOME"

# private server on a free port
PORT=""
for _ in 1 2 3 4 5; do
  CANDIDATE=$((20000 + RANDOM % 20000))
  if ! ss -tln 2>/dev/null | awk '{print $4}' | grep -qE ":$CANDIDATE$"; then
    PORT="$CANDIDATE"; break
  fi
done
[ -n "$PORT" ] || { echo "FAIL: no free port" >&2; exit 1; }

(
  cd "$SB/project" || exit 1
  exec "$BIN" serve --port "$PORT" --hostname 127.0.0.1
) > "$SB/serve.out" 2>&1 &
SRV_PID=$!

PW=""
for _ in $(seq 1 60); do
  sleep 0.5
  PW="$(sed -n 's/^server password //p' "$SB/serve.out" | head -1)"
  [ -n "$PW" ] && break
done
[ -n "$PW" ] || { echo "FAIL: server password never appeared"; KEEP=1; kill "$SRV_PID" 2>/dev/null; exit 1; }
export OPENCODE_PASSWORD="$PW"

# readiness probe (Basic auth via the api CLI)
"$BIN" api --server "http://127.0.0.1:$PORT" config.get >/dev/null 2>&1 || {
  echo "FAIL: server not ready"; KEEP=1; kill "$SRV_PID" 2>/dev/null; exit 1;
}

echo "=== create native subagent topology (parent + parentID child) ==="
PARENT_JSON="$("$BIN" api --server "http://127.0.0.1:$PORT" session.create -d '{"title":"proof-parent"}' 2>&1)" || {
  echo "FAIL: parent session create failed: $PARENT_JSON"; KEEP=1; kill "$SRV_PID" 2>/dev/null; exit 1; }
PARENT_ID="$(printf '%s' "$PARENT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["id"])')"
CHILD_JSON="$("$BIN" api --server "http://127.0.0.1:$PORT" session.create -d "{\"title\":\"proof-child\",\"parentID\":\"$PARENT_ID\",\"agent\":\"momus-prd-reviewer\"}" 2>&1)" || {
  echo "FAIL: child session create failed: $CHILD_JSON"; KEEP=1; kill "$SRV_PID" 2>/dev/null; exit 1; }
CHILD_ID="$(printf '%s' "$CHILD_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["id"])')"
CHILD_PARENT="$(printf '%s' "$CHILD_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"].get("parentID"))')"
CHILD_AGENT="$(printf '%s' "$CHILD_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"].get("agentID"))')"
echo "parent=$PARENT_ID child=$CHILD_ID child.parentID=$CHILD_PARENT child.agentID=$CHILD_AGENT"

echo "=== canary: gated command + gated write inside the subagent session ==="
# NOTE: HOME/XDG still point at the sandbox; the canary must see them.
node "$REPO_ROOT/scripts/v2-subagent-canary.mjs" \
  --config-dir "$SB/home/.config/opencode" \
  --project "$SB/project" \
  --home "$SB/home" \
  --session "$CHILD_ID" > "$SB/canary.out" 2>&1
CANARY_RC=$?
cat "$SB/canary.out"

kill "$SRV_PID" 2>/dev/null
wait "$SRV_PID" 2>/dev/null

echo "=== verdict inputs ==="
echo "child session parent-linked : $([ "$CHILD_PARENT" = "$PARENT_ID" ] && echo yes || echo no)"
echo "child agent param accepted  : $([ "$CHILD_AGENT" = "momus-prd-reviewer" ] && echo yes || echo "no ($CHILD_AGENT)")"
echo "deterministic canary exit   : $CANARY_RC (0 required)"

VERDICT=FAIL
if [ "$CANARY_RC" -eq 0 ]; then
  VERDICT=PASS
fi
echo "=== verdict: $VERDICT (subagent-session enforcement, opencode 2.1.0, sisyphus-gates) ==="
[ "$VERDICT" = PASS ] && exit 0 || { KEEP=1; exit 1; }
