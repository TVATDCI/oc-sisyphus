/**
 * trust-root-paths.js — trust-root path-denylist for sisyphus-gates.
 *
 * P0a (G7): implements the path-based security boundary that prevents ANY tool
 * (write, edit, bash, mcp__*, task) from writing to or reading from trust-root
 * paths. This is the ACTUAL security boundary — the MCP verb classifier is
 * convenience; the path check catches writes to state.json regardless of which
 * tool reaches it.
 *
 * HOLE 1 (all sub-items) defenses:
 *   1a Hard links: denied by destructive-tier pattern in command-policy (ln/cp -l)
 *      + nlink check on state.json reads (caller's responsibility — see state.js).
 *   1b Symlinks: realpath() every path before matching. TOCTOU residual
 *      documented (we don't control the open() call — opencode does).
 *   1c Path traversal: realpath canonicalization catches ~/../../.sisyphus/ etc.
 *   1d Case-insensitive: all matching is case-insensitive (Decision C). Zero
 *      false-positive cost in practice.
 *   1e Bash destinations: Tier 2 pattern match in command-policy (trust-root
 *      regex on bash command string). Variable-expansion bypass documented.
 *   1f Reads: trust-root paths + /proc + plugin source added to READ denylist.
 *
 * Audit log paths (Decision D): outside MCP root at ~/.config/. Added to both
 * read and write denylists so the gated write tool can't touch them either.
 */

import { realpathSync, lstatSync, statSync } from "node:fs";
import { resolve, dirname, basename, isAbsolute } from "node:path";

// ─── Denylist patterns (case-insensitive regex) ─────────────────────────────

/**
 * WRITE denylist — NO tool may write to these paths, regardless of phase or
 * approval status. Unconditional, no override.
 */
const TRUST_ROOT_WRITE_PATTERNS = [
  // Core trust root
  [/\.sisyphus\/state\.json$/i, "state.json"],
  [/\.sisyphus\/workflow\.yaml$/i, "workflow.yaml"],
  [/\.sisyphus\/workflow-prev\.yaml$/i, "workflow-prev.yaml"],
  // Per-project state
  [/\.sisyphus\/projects\/[^/]+\/state\.json$/i, "project state.json"],
  // Verdict files (plugin-written only via /sign-verdict)
  [/\.sisyphus\/notepads\/.*momus-prd-review/i, "PRD verdict file"],
  [/\.sisyphus\/notepads\/.*momus-plan-review/i, "plan verdict file"],
  // Repair briefs
  [/\.sisyphus\/repairs\//i, "repair brief"],
  // Audit logs (Decision D: outside MCP root, but still denied to gated tools)
  [/sisyphus-verdicts\.log$/i, "verdicts audit log"],
  [/sisyphus-approvals\.log$/i, "approvals audit log"],
  // Slice G (brain-2ah): opencode plugin config — protects sandbox_paths
  // itself from agent tampering. Without this, an agent could rewrite
  // opencode.json to widen its own sandbox. Operators edit opencode.json
  // from their terminal (outside opencode), so this does NOT change the
  // existing operator workflow.
  [/opencode\.json$/i, "opencode plugin config"],
];

/**
 * READ denylist — NO tool may read these paths. Catches:
 *   - Agent verifying its own forgery (reading state.json)
 *   - MEMORY_KEY extraction via /proc (HOLE 1f)
 *   - Plugin source study (dist/index.js → craft forgeries)
 *   - Verdict file reading (information leak for crafting attacks)
 */
const TRUST_ROOT_READ_PATTERNS = [
  // All write-denied paths are also read-denied
  ...TRUST_ROOT_WRITE_PATTERNS.map(([re, label]) => [re, label]),
  // /proc — MEMORY_KEY extraction (HOLE 1f)
  [/\/proc\//i, "/proc filesystem"],
  // Plugin source code
  [/sisyphus-gates\/dist\//i, "plugin dist source"],
  [/sisyphus-gates\/src\//i, "plugin src source"],
  [/sisyphus-gates\/threat-model\.md$/i, "plugin threat model"],
];

/**
 * Exceptions — paths under ~/.sisyphus/ that ARE allowed for legitimate
 * workflow needs. Checked AFTER denylist matching.
 */
const TRUST_ROOT_EXCEPTIONS = [
  /\.sisyphus\/evidence\//i,  // evidence writes/reads are legitimate
];

/**
 * Read-only exceptions — patterns that are WRITE-blocked but NOT
 * read-blocked. Checked ONLY in matchTrustRootRead (not matchTrustRootWrite).
 *
 * Slice G (brain-2ah): opencode.json holds the sandbox_paths config that
 * configures Layer 3.7 itself. Writes are blocked (prevent agent tampering
 * with its own sandbox), but reads remain allowed so diagnostic tools and
 * the customize-opencode skill can inspect the config. Operators edit
 * opencode.json from their terminal (outside opencode), unchanged.
 */
const READ_EXCEPTION_PATTERNS = [
  /opencode\.json$/i,  // Slice G: write-protected, read-allowed
];

/**
 * Returns true if a canonical path matches a read-only exception.
 * Used ONLY by matchTrustRootRead — matchTrustRootWrite ignores this.
 */
function isReadException(canonicalPath) {
  return READ_EXCEPTION_PATTERNS.some((re) => re.test(canonicalPath));
}

// ─── Path canonicalization ──────────────────────────────────────────────────

/**
 * Canonicalize a path string:
 *   1. Expand ~ to HOME
 *   2. Resolve to absolute
 *   3. Try realpath() (follows symlinks, resolves .., ., //)
 *   4. If file doesn't exist (write case), resolve parent dir + join basename
 *
 * HOLE 1b/c: realpath catches symlinks and path traversal.
 */
function canonicalize(inputPath) {
  if (typeof inputPath !== "string" || inputPath.length === 0) return "";

  // Expand ~
  let expanded = inputPath;
  const home = process.env.HOME || "~";
  if (expanded.startsWith("~") && (expanded.length === 1 || expanded[1] === "/")) {
    expanded = home + expanded.slice(1);
  }

  // Resolve to absolute
  if (!isAbsolute(expanded)) {
    expanded = resolve(expanded);
  }

  // Try realpath (catches symlinks + traversal — HOLE 1b/c)
  try {
    return realpathSync(expanded);
  } catch {
    // File doesn't exist yet (write case) — canonicalize parent
    const parent = dirname(expanded);
    try {
      const realParent = realpathSync(parent);
      return resolve(realParent, basename(expanded));
    } catch {
      // Parent doesn't exist either — use literal expanded path
      return expanded;
    }
  }
}

// ─── Matching ───────────────────────────────────────────────────────────────

function matchesAny(canonicalPath, patterns) {
  for (const [re] of patterns) {
    if (re.test(canonicalPath)) return true;
  }
  return false;
}

function isException(canonicalPath) {
  return TRUST_ROOT_EXCEPTIONS.some((re) => re.test(canonicalPath));
}

/**
 * Extract path-like values from a tool's args object.
 * Checks common arg names + recursively scans for string values that look like paths.
 */
function extractPathValues(args) {
  const paths = [];
  if (!args || typeof args !== "object") return paths;

  // Common path-like arg names (structured tools)
  const pathKeys = [
    "path", "filePath", "file_path", "filepath",
    "destination", "dest", "target", "to",
    "directory", "dir", "folder",
    "source", "src", "from",
  ];
  for (const key of pathKeys) {
    const val = args[key];
    if (typeof val === "string" && val.length > 0) {
      paths.push(val);
    }
  }

  // Also check for nested paths in arrays (e.g., cp with multiple sources)
  if (Array.isArray(args.paths)) {
    for (const p of args.paths) {
      if (typeof p === "string") paths.push(p);
    }
  }

  return paths;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if a tool's args target a trust-root WRITE path.
 * Returns the matched label (for the block reason) or null.
 *
 * @param {object|string} args - tool args object, or a path string
 * @returns {string|null} - matched path label, or null if safe
 */
export function matchTrustRootWrite(args) {
  const inputPaths = typeof args === "string" ? [args] : extractPathValues(args);
  for (const inputPath of inputPaths) {
    const canonical = canonicalize(inputPath);
    if (matchesAny(canonical, TRUST_ROOT_WRITE_PATTERNS) && !isException(canonical)) {
      return canonical;
    }
  }
  return null;
}

/**
 * Check if a tool's args target a trust-root READ path.
 * Returns the matched canonical path (for the block reason) or null.
 *
 * @param {object|string} args - tool args object, or a path string
 * @returns {string|null} - matched canonical path, or null if safe
 */
export function matchTrustRootRead(args) {
  const inputPaths = typeof args === "string" ? [args] : extractPathValues(args);
  for (const inputPath of inputPaths) {
    const canonical = canonicalize(inputPath);
    // Slice G: isReadException() exempts write-blocked-but-read-allowed
    // patterns (e.g. opencode.json) from read blocking. matchTrustRootWrite
    // does NOT check this — write protection is preserved.
    if (matchesAny(canonical, TRUST_ROOT_READ_PATTERNS) && !isException(canonical) && !isReadException(canonical)) {
      return canonical;
    }
  }
  return null;
}

/**
 * Check if a bash command string writes to or reads from a trust-root path.
 * Tier 2 defense (HOLE 1e): static pattern match on the command string.
 * Known bypass: variable expansion ($DEST), xargs, --target-directory.
 * Primary defense is Tier 1 (structured tools) via matchTrustRootWrite/Read.
 *
 * @param {string} command - bash command string
 * @param {"write"|"read"} mode
 * @returns {string|null} - matched path snippet, or null if safe
 */
export function matchTrustRootBash(command, mode) {
  if (typeof command !== "string") return null;
  const patterns = mode === "write" ? TRUST_ROOT_WRITE_PATTERNS : TRUST_ROOT_READ_PATTERNS;
  for (const [re, label] of patterns) {
    if (re.test(command)) return label;
  }
  return null;
}

/**
 * Verify state.json integrity on read (HOLE 1a — hard-link defense).
 * Call from readPersistentState before JSON.parse.
 *
 * @param {string} path - resolved path to state.json
 * @throws if the file is a symlink or has nlink > 1
 */
export function verifyStateFileIntegrity(path) {
  // lstat: check if the path itself is a symlink (HOLE 1b)
  let lst;
  try {
    lst = lstatSync(path);
  } catch {
    return; // file doesn't exist — caller handles ENOENT
  }
  if (lst.isSymbolicLink()) {
    throw new Error(
      `state.json at ${path} is a symlink — possible redirect attack. Refusing to read.`
    );
  }

  // stat: check nlink (HOLE 1a — hard-link defense, Decision 1b)
  let st;
  try {
    st = statSync(path);
  } catch {
    return; // stat failed for other reason — caller handles
  }
  if (st.nlink > 1) {
    throw new Error(
      `state.json at ${path} has nlink=${st.nlink} (expected 1) — possible hard-link tamper. Refusing to read.`
    );
  }
}

// ─── Exports for testing ────────────────────────────────────────────────────

export const _internal = {
  TRUST_ROOT_WRITE_PATTERNS,
  TRUST_ROOT_READ_PATTERNS,
  TRUST_ROOT_EXCEPTIONS,
  canonicalize,
  matchesAny,
  isException,
  extractPathValues,
};
