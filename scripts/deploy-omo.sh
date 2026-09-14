#!/usr/bin/env bash
# deploy-omo.sh — deploy the correct omo variant to ~/.omo/omo.jsonc (guarded; refuses when live differs)
# Lives in oc-sisyphus/scripts/. v1.1 2026-09-05 (doctor hint repointed to the cache-bin path; staged Phase 0).
# v1.2 2026-09-14 (BUILD #14 patch 0006 — Option A capture-guard, per oracle-verdict-build14-v0.1 §3):
#   live ≠ variant → REFUSE by default (deploying a stale variant over a live-ahead runtime = the F1
#   regression class); --capture → snapshot live -> variant instead of deploying (commit it after);
#   live identical/absent → deploy exactly as before (bootstrap-safe).
set -euo pipefail
MODE="deploy"
case "${1:-}" in
  "")         MODE="deploy" ;;
  --capture)  MODE="capture" ;;
  *)          echo "ERROR: unknown argument '$1' (only --capture is supported)"; exit 1 ;;
esac
HOST="$(hostname | tr 'A-Z' 'a-z')"
case "$HOST" in
  tnt)          VARIANT=omo.tnt.jsonc ;;
  dropdeaddev)  VARIANT=omo.ddd.jsonc ;;
  *) echo "ERROR: unknown hostname '$HOST' — add a case before deploying"; exit 1 ;;
esac
SRC="$(cd "$(dirname "$0")/.." && pwd)/$VARIANT"
[ -f "$SRC" ] || { echo "ERROR: variant $VARIANT not found at $SRC"; exit 1; }
mkdir -p "$HOME/.omo"

if [ -f "$HOME/.omo/omo.jsonc" ] && ! cmp -s "$SRC" "$HOME/.omo/omo.jsonc"; then
  if [ "$MODE" = "capture" ]; then
    cp "$HOME/.omo/omo.jsonc" "$SRC"
    echo "CAPTURED live -> $VARIANT (live untouched; repo variant now differs from HEAD — commit it)"
    echo "MANDATORY next: omo doctor   (fallback: node ~/.cache/opencode/packages/oh-my-openagent@<ver>/node_modules/oh-my-openagent/bin/oh-my-opencode.js doctor)"
    exit 0
  fi
  echo "REFUSED: live ~/.omo/omo.jsonc differs from $VARIANT — deploying would overwrite live (regression risk, BUILD #14 F1)."
  echo "  inspect first:  diff $SRC ~/.omo/omo.jsonc"
  echo "  refresh variant from live:  $0 --capture   (then commit the variant)"
  exit 1
fi

if [ "$MODE" = "capture" ]; then
  echo "nothing to capture — live absent or identical to $VARIANT"
  exit 0
fi

cp "$SRC" "$HOME/.omo/omo.jsonc"
echo "deployed $VARIANT -> ~/.omo/omo.jsonc (host: $HOST; live was absent or identical — no regression path)"
echo "MANDATORY next: omo doctor   (fallback: node ~/.cache/opencode/packages/oh-my-openagent@<ver>/node_modules/oh-my-openagent/bin/oh-my-opencode.js doctor)"
