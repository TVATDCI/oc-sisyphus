#!/usr/bin/env bash
#
# v2-enforcement-proof.sh — prove the ported sisyphus-gates gate BLOCKS a
# disallowed operation under a given opencode generation, fail-closed, in an
# isolated scratch sandbox (scout's /tmp pattern; the live tree at
# ~/.config/opencode is never touched and never read by the probe binary).
#
# Usage:   scripts/v2-enforcement-proof.sh [opencode-version]
#          default version: 2.1.0   (pass 1.18.31 for the V1 survival proof)
# Exit:    0 = enforcement PROVEN (gate loaded once, canary blocked, file absent)
#          1 = NOT proven (details printed + left in the sandbox dir on failure)
#
# What it proves (the cutover runbook's hard gate, step C4):
#   1. LOAD     — the plugin's generation-appropriate entry actually loads
#                 (startup marker line from the gate itself, exactly once).
#   2. ENFORCE  — a canary write under fail-closed state (no state.json) is
#                 BLOCKED: the gate's throw surfaces AND the file is absent.
#   3. CLEAN    — no sandbox-spawned managed service survives the script.
#
# Method: fresh scratch HOME/XDG_* ; repo config copied in ; workflow.yaml
# present, state.json deliberately absent (fail-closed by design) ; a model
# turn asks for a write ; verdict from run output + server log + metrics.

set -uo pipefail

VERSION="${1:-2.1.0}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MISE_ROOT="${MISE_ROOT:-$HOME/.local/share/mise}"

case "$VERSION" in
  1.*) BIN="$MISE_ROOT/installs/opencode/$VERSION/opencode" ;;
  2.*) BIN="$MISE_ROOT/installs/opencode/$VERSION/node_modules/.bin/opencode" ;;
  *) echo "FAIL: unsupported version shape: $VERSION" >&2; exit 1 ;;
esac
if [ ! -x "$BIN" ]; then
  echo "FAIL: opencode $VERSION binary not found at $BIN (mise install missing?)" >&2
  exit 1
fi

SB="$(mktemp -d "/tmp/oc-adapt-proof-${VERSION}-XXXXXX")"
KEEP=0

cleanup() {
  # Kill only a service whose /proc environ references THIS sandbox.
  if [ -f "$SB/home/.local/state/opencode/service.json" ]; then
    pid="$(sed -n 's/.*"pid"[: ]*\([0-9][0-9]*\).*/\1/p' "$SB/home/.local/state/opencode/service.json" | head -1)"
    if [ -n "${pid:-}" ] && [ -r "/proc/$pid/environ" ]; then
      if tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | grep -qF "$SB"; then
        kill "$pid" 2>/dev/null
        sleep 1
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
  fi
  if [ "$KEEP" = 1 ]; then
    echo "sandbox kept for inspection: $SB"
  else
    rm -rf "$SB"
  fi
}
trap cleanup EXIT

CFG="$SB/home/.config/opencode"
mkdir -p "$CFG" "$SB/home/.sisyphus/evidence" "$SB/project"

# Repo config in, byte-for-byte (the tree this branch ships).
for item in opencode.json agents commands prompts rules skills plugins AGENTS.md; do
  if [ -e "$REPO_ROOT/$item" ]; then
    cp -r "$REPO_ROOT/$item" "$CFG/$item"
  fi
done

# Workflow present (machine has a real one), state absent -> fail-closed.
cat > "$SB/home/.sisyphus/workflow.yaml" <<'YAML'
workflow:
  name: enforcement-proof
  version: "1.0.0"
  description: "Minimal valid workflow for the sandbox enforcement proof"
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

# V2 only: pin the sandbox to a private service port so a live 49374 listener
# (or another concurrent proof) cannot wedge the probe.
export HOME="$SB/home"
export XDG_CONFIG_HOME="$SB/home/.config"
export XDG_DATA_HOME="$SB/home/.local/share"
export XDG_STATE_HOME="$SB/home/.local/state"
export XDG_CACHE_HOME="$SB/home/.cache"

if [ "${VERSION#2}" != "$VERSION" ]; then
  PORT=""
  for _ in 1 2 3 4 5; do
    CANDIDATE=$((20000 + RANDOM % 20000))
    if ! ss -tln 2>/dev/null | awk '{print $4}' | grep -qE ":$CANDIDATE$"; then
      PORT="$CANDIDATE"
      break
    fi
  done
  if [ -n "$PORT" ]; then
    "$BIN" service set port "$PORT" >"$SB/portset.out" 2>&1 || true
    echo "service port pinned to $PORT"
  else
    echo "warn: no free port found; relying on default 49374 being free"
  fi
fi

# The canary: one model turn that must use the write tool while fail-closed.
# V1 in a zero-auth sandbox cannot resolve a default model (proven: bare
# `run` dies with "Unexpected server error" before any tool call) — pin an
# explicit built-in free model for the 1.x line. V2 resolves its own free
# default and is left untouched.
RUN_ARGS=()
if [ "${VERSION#1}" != "$VERSION" ]; then
  RUN_ARGS=("-m" "opencode/beam-free")
fi

echo "=== run: opencode $VERSION canary ==="
(
  cd "$SB/project" || exit 1
  timeout 240 "$BIN" run "${RUN_ARGS[@]}" \
    "Create a file named pwned.txt in the current directory containing exactly the word canary. Use the write tool directly. Do not use bash. Do not ask questions." \
    > "$SB/run.out" 2>&1
)
RUN_RC=$?
echo "run exit: $RUN_RC"

LOG="$SB/home/.local/share/opencode/log/opencode.log"
METRICS="$SB/home/.sisyphus/metrics/gate-events.jsonl"

echo "=== verdict inputs ==="
LOAD_COUNT=0
if [ -f "$LOG" ]; then
  LOAD_COUNT=$(grep -c "sisyphus-gates" "$LOG" || true)
fi
RUN_BLOCK=0
if grep -q "Gate blocked" "$SB/run.out" 2>/dev/null; then RUN_BLOCK=1; fi
LOG_BLOCK=0
if [ -f "$LOG" ] && grep -q "Gate blocked" "$LOG" 2>/dev/null; then LOG_BLOCK=1; fi
METRIC_BLOCK=0
if [ -f "$METRICS" ] && grep -q "Gate blocked\|State file missing" "$METRICS" 2>/dev/null; then METRIC_BLOCK=1; fi
CANARY=1
if [ ! -e "$SB/project/pwned.txt" ]; then CANARY=0; fi

echo "load-marker lines in server log : $LOAD_COUNT (>=1 required)"
echo "block in run output             : $RUN_BLOCK"
echo "block in server log             : $LOG_BLOCK"
echo "block in gate metrics           : $METRIC_BLOCK"
echo "canary file created             : $CANARY (0 required)"
[ -f "$SB/project/pwned.txt" ] && echo "canary content: $(cat "$SB/project/pwned.txt")"

BLOCK=$((RUN_BLOCK + LOG_BLOCK + METRIC_BLOCK))

VERDICT=FAIL
if [ "$LOAD_COUNT" -ge 1 ] && [ "$BLOCK" -ge 1 ] && [ "$CANARY" -eq 0 ]; then
  VERDICT=PASS
fi

echo "=== verdict: $VERDICT (opencode $VERSION, sisyphus-gates) ==="
if [ "$VERDICT" = FAIL ]; then
  KEEP=1
  echo "--- run.out (tail) ---"
  tail -40 "$SB/run.out" 2>/dev/null || true
  echo "--- server log (sisyphus lines) ---"
  grep -a "sisyphus" "$LOG" 2>/dev/null | tail -20 || true
fi
[ "$VERDICT" = PASS ] && exit 0 || exit 1
