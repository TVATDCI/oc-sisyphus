#!/usr/bin/env bash
#
# v2-default-path-proof.sh — metachar-p0-b (2026-10-22), captain-ruled P0.
#
# Proves (or disproves) that the sisyphus-gates compound-command metachar
# defense holds on the DEFAULT configuration and the LIVE steady state:
# codemode ENABLED (no permission deny anywhere) and state.json at
# phase=discovery with gates PASS + approval approved — the exact shape of
# the captain's fresh-window window where `echo ok && rm -rf /tmp/...`
# executed unblocked (evidence fresh-window-drill-2026-10-22.md part 1b).
#
# The metachar-p0 canary (scripts/v2-live-metachar-proof.sh) closes the
# V2 tool-name wiring gap but stages phase=execution; shouldBlockTool's
# Layer 6 short-circuits discovery/prd-writing to allow-all BEFORE the
# destructive-via-metachar screen runs, so a green execution-phase canary
# coexists with a live red in discovery. This proof pins THAT state.
#
# Method (same discipline as the proof family, zero free-model spend):
#   1. fresh scratch HOME/XDG sandbox; config tree staged from `git archive
#      HEAD` of THIS checkout (commit-first) via the harness staging area;
#      workflow.yaml present; sandbox gate key + SIGNED prd/plan PASS
#      verdicts + state.json at phase=discovery approval=approved — the
#      live steady-state between builds.
#   2. a REAL opencode server (the installed pinned version) on a private
#      port in the sandbox env, auto-discovering plugins/sisyphus-gates.js
#      exactly like the live host (log line asserted).
#   3. a scripted stub model (OpenAI-compatible SSE server, loopback only)
#      declared as a config provider; the canary agent has NO permission
#      deny, so codemode stays ENABLED — the canary asserts the served
#      roster includes the codemode `execute` tool (D0) and then drives
#      REAL `shell` tool calls through the normal execution path, the
#      exact shape of the captain's window (session DB part name "shell").
#   4. steps (see v2-default-path-canary.mjs):
#        D0 codemode `execute` in roster -> must be PRESENT (default path)
#        D1 benign single           -> must RUN   (path sanity)
#        D2 echo ok && rm -rf ...   -> must BLOCK (the bypass class)
#        D3 echo ok;  rm -rf ...    -> must BLOCK (the ; form)
#        D4 git status && git log   -> must RUN   (Layer 4.5 allow-path)
#        D5 sentinel file SURVIVES  -> rm segments never executed
#
# Usage:   scripts/v2-default-path-proof.sh
# Env:     PIPE_PORT_SCRATCH=<dir>  scratch root (default ~/.cache/pipe-port-m3)
#          OPENCODE_BIN=<path>      opencode binary (default: the pinned 2.1.4
#                                   install — battery-green 2026-10-23; the pin
#                                   flip itself stays captain's, the default here
#                                   tracks the battery-proven generation)
# Exit:    0 = metachar defense LIVE-ENFORCED on the default path (discovery state)
#          1 = NOT enforced live (details printed; sandbox kept)
#
# Failing-first contract: run this BEFORE the fix — it must exit 1 (red)
# reproducing the captain's result; run it AFTER the fix — it must exit 0.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="${PIPE_PORT_SCRATCH:-$HOME/.cache/pipe-port-m3}"
STAGING="$SCRATCH/staging"
SB="$SCRATCH/runs/default-path-proof"
KEEP="${METACHAR_KEEP:-0}"

BIN="${OPENCODE_BIN:-$HOME/.local/share/mise/installs/opencode/2.1.4/node_modules/.bin/opencode}"
if [ ! -x "$BIN" ]; then
  echo "FAIL: opencode binary not found at $BIN" >&2
  exit 1
fi

# commit-first staging (shared with the harness)
TREE_HASH="$(git -C "$REPO_ROOT" rev-parse HEAD)"
if [ ! -f "$STAGING/.tree-hash" ] || [ "$(cat "$STAGING/.tree-hash")" != "$TREE_HASH" ]; then
  python3 "$REPO_ROOT/scripts/pipe-port-validate.py" self-test >/dev/null || {
    echo "FAIL: harness self-test failed; refusing to stage" >&2; exit 1; }
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

# ── sandbox build ───────────────────────────────────────────────────────────
rm -rf "$SB" 2>/dev/null || true
mkdir -p "$SB/home/.config" "$SB/home/.sisyphus/metrics" "$SB/home/.sisyphus/evidence" \
         "$SB/home/.local/share" "$SB/project"
cp -r --reflink=auto "$STAGING" "$SB/home/.config/opencode"

cat > "$SB/home/.sisyphus/workflow.yaml" <<'YAML'
workflow:
  name: default-path-proof
  version: "1.0.0"
  description: "Minimal valid workflow for the default-path metachar enforcement proof"
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

# sandbox gate key + signed PASS verdicts + discovery-approved state:
# the LIVE steady-state shape between builds — gates PASS, approval
# approved, phase DISCOVERY. This is where HEAD must go red: Layer 6
# short-circuits discovery to allow-all before the metachar screen.
KEYFILE="$SB/home/.local/share/sisyphus-gate-key"
mkdir -p "$(dirname "$KEYFILE")"
head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$KEYFILE"

export HOME="$SB/home"
export XDG_CONFIG_HOME="$SB/home/.config"
export XDG_DATA_HOME="$SB/home/.local/share"
export XDG_STATE_HOME="$SB/home/.local/state"
export XDG_CACHE_HOME="$SCRATCH/cache"
mkdir -p "$XDG_CACHE_HOME"

CLI="$SB/home/.config/opencode/plugins/sisyphus-gates/cli.js"
node "$CLI" sign-verdict prd default-path-canary PASS --key-command "cat $KEYFILE" >/dev/null || {
  echo "FAIL: prd sign-verdict failed" >&2; KEEP=1; exit 1; }
node "$CLI" sign-verdict plan default-path-canary PASS --key-command "cat $KEYFILE" >/dev/null || {
  echo "FAIL: plan sign-verdict failed" >&2; KEEP=1; exit 1; }

cat > "$SB/home/.sisyphus/state.json" <<'JSON'
{
  "schema_version": "3.0.0",
  "phase": "discovery",
  "approval_status": "approved",
  "prd_id": "default-path-canary",
  "plan_id": "default-path-canary"
}
JSON

# project dir: a real git repo so the D4 safe-compound control works
git -C "$SB/project" init -q
git -C "$SB/project" -c user.email=canary@localhost -c user.name=canary commit -q --allow-empty -m "canary base"
echo "canary project" > "$SB/project/README.canary"
git -C "$SB/project" add README.canary
git -C "$SB/project" -c user.email=canary@localhost -c user.name=canary commit -q -m "canary readme"

# ── ports ───────────────────────────────────────────────────────────────────
PORT=""
STUB_PORT=""
for _ in 1 2 3 4 5; do
  CAND=$((20000 + RANDOM % 20000))
  CAND2=$((20000 + RANDOM % 20000))
  if [ "$CAND" != "$CAND2" ] \
     && ! ss -tln 2>/dev/null | awk '{print $4}' | grep -qE ":$CAND$" \
     && ! ss -tln 2>/dev/null | awk '{print $4}' | grep -qE ":$CAND2$"; then
    PORT="$CAND"; STUB_PORT="$CAND2"; break
  fi
done
[ -n "$PORT" ] || { echo "FAIL: no free ports" >&2; exit 1; }

# ── config injection: stub provider + canary agent (NO deny) ───────────────
# The stub provider points at the loopback scripted model (see the canary);
# the canary agent carries NO permission rules — codemode stays ENABLED,
# the DEFAULT configuration. The canary asserts the codemode `execute`
# tool was actually offered (step D0).
CFG_JSON="$SB/home/.config/opencode/opencode.json"
python3 - "$CFG_JSON" "$STUB_PORT" <<'PY'
import json, sys
path, stub_port = sys.argv[1], sys.argv[2]
cfg = json.load(open(path))
cfg["providers"] = {
    "stub": {
        "name": "Default-Path Canary Stub",
        "package": "@opencode/ai/providers/openai-compatible",
        "settings": {"baseURL": f"http://127.0.0.1:{stub_port}/v1", "apiKey": "canary-stub"},
        "models": {"canary": {"name": "canary-stub"}},
    }
}
cfg["agents"] = {
    "default-path-canary": {
        "model": "stub/canary",
        "description": "default-path metachar-p0-b live canary driver (scripted stub model)",
    }
}
json.dump(cfg, open(path, "w"), indent=2)
PY

# ── real server in the sandbox env ─────────────────────────────────────────
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

"$BIN" api --server "http://127.0.0.1:$PORT" config.get >/dev/null 2>&1 || {
  echo "FAIL: server not ready"; KEEP=1; kill "$SRV_PID" 2>/dev/null; exit 1; }

grep -q "sisyphus-gates" "$SB/serve.out" \
  && echo "server log: sisyphus-gates plugin load marker present (pre-canary)" \
  || echo "server log: pre-canary check: no sisyphus-gates marker yet (may be lazy)"

# ── the live canary ─────────────────────────────────────────────────────────
export CANARY_QUEUE_PATH="$SB/queue.json"
export CANARY_STUB_LOG="$SB/stub-requests.jsonl"
rm -f "$CANARY_STUB_LOG"
node "$REPO_ROOT/scripts/v2-default-path-canary.mjs" \
  --server "http://127.0.0.1:$PORT" \
  --password "$PW" \
  --stub-port "$STUB_PORT" \
  --agent default-path-canary > "$SB/canary.out" 2>&1
CANARY_RC=$?
cat "$SB/canary.out"

kill "$SRV_PID" 2>/dev/null
wait "$SRV_PID" 2>/dev/null

grep -q "sisyphus-gates" "$SB/serve.out" \
  && echo "server log: sisyphus-gates plugin marker present" \
  || echo "server log: WARNING — no sisyphus-gates marker in serve.out"
[ -s "$CANARY_STUB_LOG" ] && {
  echo "--- stub request log (last 10) ---"
  tail -10 "$CANARY_STUB_LOG"
}

echo "=== verdict inputs ==="
echo "opencode binary: $BIN"
echo "live canary exit (verdict source): $CANARY_RC (0 required)"
[ "$CANARY_RC" -ne 0 ] && KEEP=1 && {
  echo "--- serve.out tail ---"
  tail -25 "$SB/serve.out" 2>/dev/null || true
}

if [ "$CANARY_RC" -eq 0 ]; then
  echo "=== verdict: PASS — metachar defense enforced on the DEFAULT path (codemode on, discovery state) ==="
  exit 0
else
  echo "=== verdict: FAIL — metachar defense NOT enforced on the DEFAULT path (discovery state) ==="
  exit 1
fi
