/**
 * mcp-classifier.js — MCP tool classification for sisyphus-gates.
 *
 * P0a (G7, Patch ε): MCP tools in opencode are named `{serverName}_{toolName}`
 * (e.g., `myfiles_read_file`, `semble_search`), NOT `mcp__{server}__{tool}`.
 * The `mcp__` prefix does NOT exist in actual dispatch (confirmed by NV-1).
 *
 * This module loads MCP server names from opencode.json at startup and
 * classifies tools by prefix matching + verb heuristic.
 *
 * HEURISTIC LIMITATION (reviewer minor refinement #1): the verb-prefix
 * classifier is a heuristic, not a security boundary. A tool named
 * `myfiles_read_and_index` would classify as "read" but could write to an
 * index file. The trust-root path-denylist (trust-root-paths.js, Layer 0)
 * is the PRIMARY defense — it catches writes to trust-root paths regardless
 * of MCP classification. During fail-closed, a misclassified read-prefixed
 * tool COULD write to non-trust-root paths. This is defense-in-depth; the
 * path-denylist is the boundary.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Verb classification (heuristic) ────────────────────────────────────────

const MCP_READ_VERBS = /^(read|get|list|stat|info|head|search|query|find|exists|is_)/;
const MCP_WRITE_VERBS = /^(write|create|update|delete|remove|move|rename|edit|put|patch|set|save|upload|copy|mkdir|rmdir|append)/;

// ─── MCP prefix set (loaded from opencode.json at startup) ──────────────────

let MCP_PREFIXES = new Set();

/**
 * Load MCP server names from opencode.json and build prefix set.
 * Called once at plugin server() startup.
 *
 * @param {string} configDirectory - the opencode config directory
 */
export function loadMcpPrefixes(configDirectory) {
  MCP_PREFIXES = new Set();
  const home = process.env.HOME || "~";
  const candidatePaths = [
    configDirectory ? join(configDirectory, "opencode.json") : null,
    join(home, ".config", "opencode", "opencode.json"),
  ].filter(Boolean);

  for (const configPath of candidatePaths) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      const cfg = JSON.parse(raw);
      if (cfg.mcp && typeof cfg.mcp === "object") {
        for (const serverName of Object.keys(cfg.mcp)) {
          MCP_PREFIXES.add(serverName.toLowerCase() + "_");
        }
      }
    } catch {
      // Config not found or invalid — skip
    }
  }
}

/**
 * Classify a tool name as MCP or non-MCP.
 *
 * @param {string} tool - the tool name from tool.execute.before
 * @returns {{ type: "mcp", classification: "read"|"write"|"unknown", server: string } | null}
 *   - Returns null if the tool is NOT an MCP tool (built-in like write/edit/bash/read/grep)
 *   - Returns { type: "mcp", classification: "read" } for read-verb MCP tools
 *   - Returns { type: "mcp", classification: "write" } for write-verb MCP tools
 *   - Returns { type: "mcp", classification: "unknown" } for unrecognized verbs (deny by default)
 */
export function getMcpClassification(tool) {
  if (typeof tool !== "string" || tool.length === 0) return null;
  const lower = tool.toLowerCase();

  for (const prefix of MCP_PREFIXES) {
    if (lower.startsWith(prefix)) {
      const toolName = lower.slice(prefix.length);
      const server = prefix.slice(0, -1); // remove trailing _
      if (MCP_READ_VERBS.test(toolName)) {
        return { type: "mcp", classification: "read", server };
      }
      if (MCP_WRITE_VERBS.test(toolName)) {
        return { type: "mcp", classification: "write", server };
      }
      return { type: "mcp", classification: "unknown", server };
    }
  }

  return null; // not an MCP tool
}

/**
 * Check if MCP prefixes have been loaded.
 */
export function isInitialized() {
  return MCP_PREFIXES.size > 0;
}

// ─── Exports for testing ────────────────────────────────────────────────────

export const _internal = {
  MCP_READ_VERBS,
  MCP_WRITE_VERBS,
  getPrefixes: () => MCP_PREFIXES,
  setPrefixes: (arr) => { MCP_PREFIXES = new Set(arr); },
  resetPrefixes: () => { MCP_PREFIXES = new Set(); },
};
