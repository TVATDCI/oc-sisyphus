#!/usr/bin/env bash
# MCP home-server wrapper — resolves $HOME at runtime so opencode.json
# contains no hardcoded user paths (MCP server-filesystem takes literal
# argv, so env expansion must happen here, not in the JSON). Only includes
# dirs that exist on the host — cloners get a smaller working set, that's
# fine. Edit the candidate list below to customize.

set -euo pipefail

paths=()
for candidate in \
  "$HOME/Main-vault" \
  "$HOME/.sisyphus" \
  "$HOME/.config/opencode" \
  "$HOME/developer/Reference/meta" \
  "$HOME/developer/test-artifacts"
do
  if [ -d "$candidate" ]; then
    paths+=("$candidate")
  fi
done

if [ ${#paths[@]} -eq 0 ]; then
  echo "mcp-home-wrapper: no candidate directories exist under $HOME" >&2
  echo "  Edit scripts/mcp-home-wrapper.sh to add your own paths." >&2
  exit 1
fi

exec npx -y @modelcontextprotocol/server-filesystem "${paths[@]}"
