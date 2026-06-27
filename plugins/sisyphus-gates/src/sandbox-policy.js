/**
 * sandbox-policy.js — Layer 3.7 sandbox allowlist policy.
 *
 * Wave 1 / Slice A (brain-vi1): config plumbing + validation.
 * Wave 2 / Slice B (brain-99x): isSandboxPath (realpath prefix match).
 * Wave 3 / Slice C (brain-ph1): isSandboxCommand (regex prefix matcher).
 */

import { _internal } from "./trust-root-paths.js";
import { _internal as _commandPolicyInternal, hasShellMetachar } from "./command-policy.js";

const { canonicalize } = _internal;
const { normalize, stripLeadingEnvExport } = _commandPolicyInternal;

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
  if (options == null || typeof options !== "object") {
    return { sandboxPaths: [], sandboxAllowedCommands: [] };
  }

  const rawPaths = options.sandbox_paths;
  const rawCommands = options.sandbox_allowed_commands;

  if (rawPaths === undefined || rawPaths === null) {
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

  let sandboxPaths;
  try {
    sandboxPaths = validatePathArray(rawPaths);
  } catch {
    return null;
  }

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
 * that Layer 0 uses for its HOLE 1b/c symlink-escape defense.
 *
 * @param {string} cwd - the agent's current working directory
 * @param {string[]} sandboxPaths - validated sandbox path prefixes (each ending in "/")
 * @returns {{matchedSandboxPath: string} | null}
 */
export function isSandboxPath(cwd, sandboxPaths) {
  if (typeof cwd !== "string" || cwd.length === 0) return null;
  if (!Array.isArray(sandboxPaths) || sandboxPaths.length === 0) return null;

  const canonical = canonicalize(cwd);
  if (!canonical || canonical.length === 0) return null;

  const canonicalWithSlash = canonical.endsWith("/") ? canonical : canonical + "/";

  for (const sandboxPath of sandboxPaths) {
    if (typeof sandboxPath !== "string" || sandboxPath.length === 0) continue;
    if (canonicalWithSlash.startsWith(sandboxPath)) {
      return { matchedSandboxPath: sandboxPath };
    }
  }
  return null;
}

// ─── Slice C: Command matching (regex prefix matcher) ─────────────────────

/**
 * Escape regex metacharacters in a string so it can be used as a literal
 * pattern in a RegExp.
 *
 * Escapes: . * + ? ^ $ { } ( ) | [ ] \
 *
 * @param {string} str - the string to escape
 * @returns {string} the escaped string (safe for RegExp construction)
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a regex from an allowlist entry that matches commands starting with
 * that entry's token stream.
 *
 * Algorithm (PRD Decision D3):
 *   1. Trim leading/trailing whitespace from the entry (trailing spaces are
 *      stylistic, not semantic — the lookahead provides the token boundary).
 *   2. Escape regex metacharacters via escapeRegExp (AC-3.18).
 *   3. Replace space runs with \s+ for whitespace tolerance (AC-3.14 tab,
 *      double-space, etc. all match).
 *   4. Anchor with ^ and append (?=\s|$) lookahead for word boundary
 *      (AC-3.10: "npm installx" does NOT match "npm install").
 *
 * @param {string} entry - the allowlist entry (e.g. "npm install")
 * @returns {RegExp|null} the compiled regex, or null if entry is empty
 */
function buildCommandRegex(entry) {
  const trimmed = entry.trim();
  if (trimmed.length === 0) return null;

  const escaped = escapeRegExp(trimmed);
  const withWhitespace = escaped.replace(/ +/g, "\\s+");

  return new RegExp("^" + withWhitespace + "(?=\\s|$)");
}

/**
 * Test whether a bash command matches any of the configured allowlist entries.
 *
 * Defense sequence (PRD Decision D3):
 *   1. If command contains shell metacharacters (chaining, substitution,
 *      redirects) → deny immediately via hasShellMetachar(). Layer 3.7
 *      must NOT bypass Layer 4's metachar protections (AC-3.11, AC-3.12,
 *      AC-3.15).
 *   2. Normalize the command: stripLeadingEnvExport (peels "export K=V;"
 *      opencode prefixes) + normalize (strips leading whitespace + leading
 *      env-var assignments). Same normalization as Layer 4 — so
 *      "FOO=bar npm install" matches "npm install" (AC-3.13).
 *   3. For each allowlist entry, build a regex via buildCommandRegex() and
 *      test. First match wins.
 *
 * @param {string} command - the bash command string
 * @param {string[]} allowedCommands - the allowlist entries
 * @returns {{matchedPattern: string} | null}
 */
export function isSandboxCommand(command, allowedCommands) {
  if (typeof command !== "string" || command.length === 0) return null;
  if (!Array.isArray(allowedCommands) || allowedCommands.length === 0) return null;

  // Defense: deny shell metacharacters before matching.
  if (hasShellMetachar(command)) return null;

  // Normalize using the same helpers as Layer 4 (isSafeReadOnlyCommand).
  const normalized = normalize(stripLeadingEnvExport(command));
  if (!normalized || normalized.length === 0) return null;

  for (const entry of allowedCommands) {
    if (typeof entry !== "string" || entry.length === 0) continue;
    const regex = buildCommandRegex(entry);
    if (regex && regex.test(normalized)) {
      return { matchedPattern: entry };
    }
  }
  return null;
}

// ─── Slice D: Orchestrator (combines path + command matching) ────────────

/**
 * Orchestrator: combine isSandboxPath + isSandboxCommand into a single
 * decision. Called by gates.js Layer 3.7 for bash tool calls only.
 *
 * @param {{cwd: string, command: string, sandboxConfig: object}} params
 * @returns {{cwd: string, realpathCwd: string, command: string,
 *            matchedPattern: string, matchedSandboxPath: string} | null}
 *   Full audit metadata on match, null on no match.
 */
export function isSandboxAllowed({ cwd, command, sandboxConfig }) {
  if (!sandboxConfig || typeof sandboxConfig !== "object") return null;
  if (!Array.isArray(sandboxConfig.sandboxPaths) || sandboxConfig.sandboxPaths.length === 0) return null;

  const pathResult = isSandboxPath(cwd, sandboxConfig.sandboxPaths);
  if (!pathResult) return null;

  const cmdResult = isSandboxCommand(command, sandboxConfig.sandboxAllowedCommands || []);
  if (!cmdResult) return null;

  return {
    cwd,
    realpathCwd: canonicalize(cwd),
    command,
    matchedPattern: cmdResult.matchedPattern,
    matchedSandboxPath: pathResult.matchedSandboxPath,
  };
}
