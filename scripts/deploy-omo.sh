#!/usr/bin/env bash
# deploy-omo.sh — copy the correct omo variant to ~/.omo/omo.jsonc (idempotent, backs up before overwrite)
# Lives in oc-sisyphus/scripts/. v1.1 2026-09-05 (doctor hint repointed to the cache-bin path; staged Phase 0).
set -euo pipefail
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
  BAK="$HOME/.omo/omo.jsonc.bak.$(date +%Y%m%d-%H%M%S)"
  cp "$HOME/.omo/omo.jsonc" "$BAK"
  echo "backed up existing -> $BAK"
fi
cp "$SRC" "$HOME/.omo/omo.jsonc"
echo "deployed $VARIANT -> ~/.omo/omo.jsonc (host: $HOST)"
echo "MANDATORY next: omo doctor   (fallback: node ~/.cache/opencode/packages/oh-my-openagent@<ver>/node_modules/oh-my-openagent/bin/oh-my-opencode.js doctor)"
