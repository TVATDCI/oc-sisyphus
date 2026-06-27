/**
 * sandbox-policy.js — Layer 3.7 sandbox allowlist policy.
 *
 * Wave 1 / Slice A (brain-vi1): config plumbing + validation only.
 * Wave 2 / Slice B (brain-99x): isSandboxPath (realpath-based prefix match).
 *
 * The sandbox relaxation is opt-in via the plugin's opencode.json config block:
 *
 *   [
 *     "./plugins/sisyphus-gates",
 *     {
 *       "verdict_key_command": "cat ~/.local/share/sisyphus-gate-key",
 *       "sandbox_paths": ["/tmp/"],
 *       "sandbox_allowed_commands": ["npm install", "npm test", ...]
 *     }
 *   ]
 *
 * Validation rules (PRD Decision D6):
 *   - Missing sandbox_paths key   → feature disabled (returns empty config)
 *   - Empty sandbox_paths array   → feature disabled (returns empty config)
 *   - Any entry without trailing "/" → reject the ENTIRE config (returns null).
 *   - sandbox_allowed_commands missing → treated as empty array.
 *   - Any malformed (non-array, non-string element) → reject entire config.
 */

import { _internal } from "./trust-root-paths.js";

// Reused canonicalize (realpath-based, same defense as Layer 0 HOLE 1b/c).
// trust-root-paths.js exports _internal with canonicalize already.
const { canonicalize } = _internal;

// ─── Slice A: Config plumbing ─────────────────────────────────────────────

/**
 * Validate and normalize a single sandbox_paths entry.
 * Returns the entry unchanged if valid; throws if invalid (caller turns into null).
 */
function validatePathEntry(entry, index) {
  if (typeof entry !== "string") {
    throw new Error(
      `sandbox_paths[${index}] must be a string, got ${typeof entry}`
    );
  }
  if (entry.length === 0) {
    // Empty string is a special case of "no trailing slash".
    throw new Error(
      `sandbox_paths[${index}] is empty — must end with "/" (e.g. "/tmp/")`
    );
  }
  if (!entry.endsWith("/")) {
    throw new Error(
      `sandbox_paths[${index}] = ${JSON.stringify(entry)} must end with "/" ` +
        `(prevents prefix overmatch like "/tmp" matching "/tmpfoo")`
    );
  }
  return entry;
}

/**
 * Validate and normalize a single sandbox_allowed_commands entry.
 * Returns the entry unchanged if valid; throws if invalid.
 */
function validateCommandEntry(entry, index) {
  if (typeof entry !== "string") {
    throw new Error(
      `sandbox_allowed_commands[${index}] must be a string, got ${typeof entry}`
    );
  }
  // Empty string is allowed (will be trimmed to "" by the matcher later,
  // but we don't reject here — operators might use it as a placeholder).
  return entry;
}

/**
 * Load + validate sandbox config from the plugin's _options block.
 *
 * @param {object|undefined|null} options - the plugin config object from
 *   opencode.json's plugin[i] tuple. May be undefined if no config block.
 * @returns {{sandboxPaths: string[], sandboxAllowedCommands: string[]} | null}
 *   - Object with (possibly empty) arrays if config is valid or absent.
 *   - null if config is present but malformed (any validation failure).
 *
 * Acceptance criteria covered:
 *   - AC-3.7: empty sandbox_paths → {sandboxPaths: [], ...}
 *   - AC-3.8: missing sandbox_paths key → same as empty
 *   - AC-3.9: entry without trailing slash → null
 */
export function loadSandboxConfig(options) {
  // No config block at all → feature disabled, empty config.
  if (options == null || typeof options !== "object") {
    return { sandboxPaths: [], sandboxAllowedCommands: [] };
  }

  const rawPaths = options.sandbox_paths;
  const rawCommands = options.sandbox_allowed_commands;

  // sandbox_paths missing → feature disabled (treat as empty).
  if (rawPaths === undefined || rawPaths === null) {
    // Still validate sandbox_allowed_commands if it was provided alongside.
    if (rawCommands !== undefined && rawCommands !== null) {
      try {
        const sandboxAllowedCommands = validateCommandArray(rawCommands);
        return { sandboxPaths: [], sandboxAllowedCommands };
      } catch {
        return null;
      }
    }
    return { sandboxPaths: [], sandboxAllowedCommands: [] };
  }

  // sandbox_paths present — must be array of strings each ending in "/".
  let sandboxPaths;
  try {
    sandboxPaths = validatePathArray(rawPaths);
  } catch {
    return null;
  }

  // sandbox_allowed_commands optional — if missing, default to empty.
  let sandboxAllowedCommands = [];
  if (rawCommands !== undefined && rawCommands !== null) {
    try {
      sandboxAllowedCommands = validateCommandArray(rawCommands);
    } catch {
      return null;
    }
  }

  return { sandboxPaths, sandboxAllowedCommands };
}

function validatePathArray(rawPaths) {
  if (!Array.isArray(rawPaths)) {
    throw new Error(`sandbox_paths must be an array, got ${typeof rawPaths}`);
  }
  return rawPaths.map(validatePathEntry);
}

function validateCommandArray(rawCommands) {
  if (!Array.isArray(rawCommands)) {
    throw new Error(
      `sandbox_allowed_commands must be an array, got ${typeof rawCommands}`
    );
  }
  return rawCommands.map(validateCommandEntry);
}

// ─── Slice B: Path matching (realpath canonicalization) ───────────────────

/**
 * Test whether a cwd resolves (via realpath) into any of the configured
 * sandbox path prefixes.
 *
 * Defense (PRD AC-3.6 / Decision D4): reuses the same canonicalize() helper
 * that Layer 0 uses for its HOLE 1b/c symlink-escape defense. realpath()
 * follows symlinks AND resolves path traversal (.., ., //). A sandbox cwd
 * that symlinks to a production location will resolve to the production
 * location, which will NOT match the sandbox prefix — sandbox privileges
 * are denied.
 *
 * Residual risk: TOCTOU on realpath (cwd valid at check, invalid at execute).
 * Inherited from Layer 0 HOLE 1b documentation; plugin cannot control the
 * open() call.
 *
 * @param {string} cwd - the agent's current working directory
 * @param {string[]} sandboxPaths - validated sandbox path prefixes; each
 *   entry must end with "/" (enforced by loadSandboxConfig per D6).
 * @returns {{matchedSandboxPath: string} | null}
 *   - {matchedSandboxPath: <prefix>} on match (first matching prefix wins)
 *   - null on no match (including empty/null sandboxPaths, invalid cwd, etc.)
 *
 * Acceptance criteria covered:
 *   - AC-3.6: symlink escape — /tmp/foo symlinked to /home/user/.config
 *     resolves via realpath to the prod path, which doesn't match /tmp/
 *     → returns null
 */
export function isSandboxPath(cwd, sandboxPaths) {
  if (typeof cwd !== "string" || cwd.length === 0) return null;
  if (!Array.isArray(sandboxPaths) || sandboxPaths.length === 0) return null;

  const canonical = canonicalize(cwd);
  if (!canonical || canonical.length === 0) return null;

  // Ensure canonical ends in "/" before prefix comparison. realpath() does
  // not append trailing slashes, so /tmp/foo stays /tmp/foo. We add "/"
  // to make the startsWith check well-defined: "/tmp/foo/" matches "/tmp/"
  // but "/tmpfoobar/" does NOT (its 5th char is "o" not "/").
  //
  // Edge case: canonical is a directory root like "/" itself. "/" + "/" = "//"
  // which still startsWith "/". Acceptable.
  const canonicalWithSlash = canonical.endsWith("/") ? canonical : canonical + "/";

  for (const sandboxPath of sandboxPaths) {
    if (typeof sandboxPath !== "string" || sandboxPath.length === 0) continue;
    if (canonicalWithSlash.startsWith(sandboxPath)) {
      return { matchedSandboxPath: sandboxPath };
    }
  }
  return null;
}
