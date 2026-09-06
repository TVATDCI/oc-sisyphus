#!/usr/bin/env bash
# install-codegraph.sh — provision the codegraph CLI (semantic code search; MCP `codegraph`)
# Canonical, reproducible, user-level provisioning for desks in the umbrella stack.
#
# WHY THIS EXISTS: opencode.json registers the codegraph MCP server as the bare
# command ["codegraph","serve","--mcp"], which requires `codegraph` to resolve on
# PATH. The 2026-09-05 adoption (commit 17e4a9f) relied on an oh-my-openagent
# auto-provisioned binary under ~/.omo/codegraph/bin — which (a) never had a PATH
# export anywhere and (b) did not survive the desk restore (the restore-list
# deliberately skipped ~/.omo as rebuildable cache). Result: every opencode start
# logged "server unavailable key=codegraph status=failed".
#
# SOURCE OF TRUTH: the upstream the omo pin already uses — npm
# @colbymchenry/codegraph (github.com/colbymchenry/codegraph).
# oh-my-openagent 4.19.4 pins CODEGRAPH_PINNED_VERSION=1.5.0. Bump PIN here when
# the plugin pin moves (check: node_modules/oh-my-openagent/packages/omo-codex/
# plugin/components/codegraph/package.json optionalDependencies).
#
# Install method: mise (user-level, no sudo, survives re-login via
# `mise activate zsh` in ~/.zshrc; shims dir is on PATH). npm -g fallback for
# desks without mise (requires a user-writable npm prefix).
#
# Usage:   bash scripts/install-codegraph.sh     (from the oc-sisyphus repo root)
# Idempotent: safe to re-run; mise reinstalls only when missing.

set -euo pipefail

PIN="${CODEGRAPH_PIN:-1.5.0}"
TOOL="npm:@colbymchenry/codegraph@${PIN}"

if command -v mise >/dev/null 2>&1; then
  mise install "${TOOL}"
  mise use -g "${TOOL}"
else
  echo "mise not found — falling back to npm -g (needs user-writable npm prefix)"
  npm install -g "@colbymchenry/codegraph@${PIN}"
fi

BIN="$(command -v codegraph)"
echo "codegraph resolved at: ${BIN}"
"${BIN}" --version

echo ""
echo "MCP handshake smoke (expects JSON-RPC result with serverInfo.name=codegraph):"
echo "  printf '%s' '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"smoke\",\"version\":\"1.0\"}}}' | codegraph serve --mcp"
echo ""
echo "Done. opencode's bare 'codegraph' MCP entry now resolves on PATH."
echo "Verify at next opencode start: no 'server unavailable key=codegraph' warnings in"
echo "~/.local/share/opencode/log/opencode.log."
