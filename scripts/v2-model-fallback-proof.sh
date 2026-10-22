#!/usr/bin/env bash
#
# v2-model-fallback-proof.sh — P2-b (fm/backlog-impl, 2026-10-22),
# captain ruling: adopt a V2-native fallback, BUILT not documented.
#
# Proves the model-fallback plugin end-to-end on a REAL opencode server:
#   1. commit-first staging: the plugin (plugins/model-fallback.js +
#      plugins/model-fallback/) is staged from `git archive HEAD` of THIS
#      checkout into a scratch config root — the exact code that ships.
#   2. a sandbox HOME/XDG config declares two loopback stub providers:
#      stubfail (HTTP 429 on every request — the RateLimit class) and
#      stubok (one SSE text turn), plus the ladder
#      model_fallback: {"stubfail/fail": ["stubok/ok"]}.
#   3. a real server (2.1.0, the proven harness binary) auto-discovers the
#      staged plugin; the canary creates a session pinned to stubfail/fail
#      and drives a real turn: primary attempt -> 429 -> session.retry hook
#      -> plugin switchModel(stubok/ok) -> context-refresh re-resolve ->
#      the rung SERVES the turn.
#   4. verdict from the SESSION MESSAGE (never self-report): an assistant
#      message whose model.providerID === stubok, plus at least one request
#      seen by the fail stub (the primary was genuinely tried first), plus
#      the plugin's served-model report line in the server log.
#
# Usage:   scripts/v2-model-fallback-proof.sh
# Env:     FALLBACK_PROOF_SCRATCH=<dir> scratch root (default ~/.cache/fallback-proof)
#          METACHAR-style KEEP=1 keeps the sandbox on failure for inspection
# Exit:    0 = fallback chain proven live; 1 = not (details printed)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="${FALLBACK_PROOF_SCRATCH:-$HOME/.cache/fallback-proof}"
STAGING="$SCRATCH/staging"
SB="$SCRATCH/runs/fallback-proof"
KEEP="${FALLBACK_KEEP:-0}"

BIN="${OPENCODE_BIN:-$HOME/.local/share/mise/installs/opencode/2.1.0/node_modules/.bin/opencode}"
if [ ! -x "$BIN" ]; then
  echo "FAIL: opencode binary not found at $BIN" >&2
  exit 1
fi

# commit-first staging (the plugin must be at HEAD — proving shipped code)
TREE_HASH="$(git -C "$REPO_ROOT" rev-parse HEAD)"
if [ ! -d "$STAGING" ] || [ ! -f "$STAGING/.tree-hash" ] || [ "$(cat "$STAGING/.tree-hash")" != "$TREE_HASH" ]; then
  rm -rf "$STAGING" 2>/dev/null
  mkdir -p "$STAGING"
  git -C "$REPO_ROOT" archive HEAD | tar -x -C "$STAGING"
  echo "$TREE_HASH" > "$STAGING/.tree-hash"
fi
if [ ! -f "$STAGING/plugins/model-fallback.js" ]; then
  echo "FAIL: plugins/model-fallback.js not at HEAD — commit the plugin first (commit-first staging)" >&2
  exit 1
fi

rm -rf "$SB" 2>/dev/null
mkdir -p "$SB/home/.config/opencode/plugins" "$SB/project" "$SB/scratch"

# the plugin, staged into the sandbox config root (auto-discovery route)
cp -f "$STAGING/plugins/model-fallback.js" "$SB/home/.config/opencode/plugins/model-fallback.js"
cp -rf "$STAGING/plugins/model-fallback" "$SB/home/.config/opencode/plugins/model-fallback"

# sandbox config: two loopback stub providers + the fallback ladder
PORT=""
STUB_FAIL_PORT=""
STUB_OK_PORT=""
for CAND in 41000 41001 41002 41003 41004 41005; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$CAND") 2>/dev/null; then
    exec 3<&- 3>&- || true
  else
    if [ -z "$PORT" ]; then PORT="$CAND"; else
      if [ -z "$STUB_FAIL_PORT" ]; then STUB_FAIL_PORT="$CAND"; else STUB_OK_PORT="$CAND"; break; fi
    fi
  fi
done
[ -n "$PORT" ] && [ -n "$STUB_OK_PORT" ] || { echo "FAIL: no free ports" >&2; exit 1; }

cat > "$SB/home/.config/opencode/opencode.json" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "providers": {
    "stubfail": {
      "name": "Fallback Canary Fail Stub",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "http://127.0.0.1:${STUB_FAIL_PORT}/v1", "apiKey": "canary" },
      "models": { "fail": { "name": "fail-stub" } }
    },
    "stubok": {
      "name": "Fallback Canary Ok Stub",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "http://127.0.0.1:${STUB_OK_PORT}/v1", "apiKey": "canary" },
      "models": { "ok": { "name": "ok-stub" } }
    }
  },
  "model_fallback": {
    "stubfail/fail": ["stubok/ok"]
  }
}
EOF

echo '{"$schema": "https://opencode.ai/config.json"}' > "$SB/project/opencode.json"

# ── real server in the sandbox env ─────────────────────────────────────────
export HOME="$SB/home"
export XDG_CONFIG_HOME="$SB/home/.config"
export XDG_DATA_HOME="$SB/home/.local/share"
export XDG_STATE_HOME="$SB/home/.local/state"
export XDG_CACHE_HOME="$SB/scratch/cache"
mkdir -p "$XDG_CACHE_HOME"

(
  cd "$SB/project" || exit 1
  exec "$BIN" serve --port "$PORT" --hostname 127.0.0.1
) > "$SB/serve.out" 2>&1 &
SRV_PID=$!

cleanup() {
  kill "$SRV_PID" 2>/dev/null
  wait "$SRV_PID" 2>/dev/null
  if [ "$KEEP" = "1" ]; then
    echo "sandbox kept for inspection: $SB"
  else
    rm -rf "$SB" 2>/dev/null
  fi
}
trap cleanup EXIT

PW=""
for _ in $(seq 1 60); do
  sleep 0.5
  PW="$(sed -n 's/^server password //p' "$SB/serve.out" | head -1)"
  [ -n "$PW" ] && break
done
[ -n "$PW" ] || { echo "FAIL: server password never appeared"; KEEP=1; exit 1; }

"$BIN" api --server "http://127.0.0.1:$PORT" config.get >/dev/null 2>&1 || {
  echo "FAIL: server not ready"; KEEP=1; exit 1; }

grep -q "model-fallback" "$SB/serve.out" \
  && echo "server log: model-fallback plugin load marker present" \
  || echo "server log: no model-fallback marker (may load lazily — canary decides)"

export FALLBACK_STUB_LOG="$SB/stub-requests.jsonl"
node "$REPO_ROOT/scripts/v2-model-fallback-canary.mjs" \
  --server "http://127.0.0.1:$PORT" \
  --password "$PW" \
  --fail-port "$STUB_FAIL_PORT" \
  --ok-port "$STUB_OK_PORT" \
  > "$SB/canary.out" 2>&1
CANARY_RC=$?

echo "=== canary output ==="
cat "$SB/canary.out"
echo "=== plugin report lines (server log) ==="
grep -i "model-fallback" "$SB/serve.out" | tail -4 || echo "(none found in serve.out)"

if [ "$CANARY_RC" -ne 0 ]; then
  echo "=== verdict: FAIL — the fallback chain did not serve the next rung ==="
  KEEP=1
  exit 1
fi

echo "=== verdict: PASS — primary 429 -> ladder rung served the turn (session-message evidence) ==="
exit 0
