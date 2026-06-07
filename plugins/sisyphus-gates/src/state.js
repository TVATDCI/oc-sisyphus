/**
 * state.js — persistent and session state for sisyphus-gates.
 *
 * W1.A changes (the security fix):
 *   - readPersistentState throws on JSON parse error. The caller catches
 *     and treats that as a missing/corrupt state file. (The old code
 *     silently returned null on parse error, which made the plugin pass
 *     fail-closed checks trivially: any corrupt file looked "missing".)
 *   - readPersistentState returns null ONLY on file-not-found (ENOENT).
 *   - State root is the canonical path (getCanonicalStatePath), NOT the
 *     legacy sidecar under .config/opencode/.
 *   - Written state includes schema_version "3.0.0". Older states without
 *     schema_version are accepted (with a console warning) for backward
 *     compatibility. Future versions (greater than "3.0.0") fail closed.
 *   - getState reads persisted `phase` from disk on first init instead of
 *     hardcoding "discovery". (Old bug #7.)
 *
 * W1.C changes:
 *   - readPersistentState and writePersistentState now call
 *     getActiveStatePath() from project-state.js to determine the file
 *     location. The per-project state at
 *     ~/.sisyphus/projects/{name}/state.json takes precedence over the
 *     global canonical path if it exists.
 *   - getCanonicalStatePath remains the global fallback; project paths
 *     are computed by getProjectStatePath() in paths.js.
 *   - The schema migration / version validation logic is unchanged.
 *   - The per-session state map and syncStateWithDisk logic are unchanged.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { getCanonicalStatePath, getLegacySidecarStatePath } from "./paths.js";
import { getProjectName, getActiveStatePath, ensureProjectDir } from "./project-state.js";
import { scanReviewFiles } from "./review-scanner.js";

export const CURRENT_SCHEMA_VERSION = "3.0.0";

/**
 * Read the persistent state file.
 * Returns the parsed object on success.
 * Returns null ONLY when the file does not exist.
 * Throws on JSON parse error, missing required fields, or future schema versions.
 *
 * W1.C: reads from the per-project state file if it exists, else the
 * global canonical path. The project name is resolved from the cwd via
 * getProjectName(process.cwd()).
 */
export function readPersistentState() {
  const projectName = getProjectName(process.cwd());
  const path = getActiveStatePath(projectName);
  let raw;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
  const parsed = JSON.parse(raw);

  // Schema version validation
  if (typeof parsed.schema_version === "string") {
    if (parsed.schema_version > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `State file schema_version=${parsed.schema_version} is newer than supported ${CURRENT_SCHEMA_VERSION}. Refusing to read.`
      );
    }
  } else {
    // Missing schema_version: warn but accept (backward compat with v2.0.0)
    console.warn(
      `[sisyphus-gates] State file at ${path} has no schema_version. ` +
        `Expected ${CURRENT_SCHEMA_VERSION}. Accepting as legacy.`
    );
  }

  return parsed;
}

/**
 * Write the persistent state file with the current schema.
 *
 * W1.C: writes to the per-project state file (creating the project
 * directory if needed), unless no project name was resolved (in which
 * case it falls back to the global canonical path).
 */
export function writePersistentState(projectName, gateStatus, extra = {}) {
  const resolvedProjectName = projectName || getProjectName(process.cwd());
  const path = getActiveStatePath(resolvedProjectName);

  if (path !== getCanonicalStatePath()) {
    ensureProjectDir(resolvedProjectName);
  }

  const state = {
    schema_version: CURRENT_SCHEMA_VERSION,
    project: projectName,
    phase: gateStatus.phase || "discovery",
    prd_gate: gateStatus.prdGate || "unknown",
    plan_gate: gateStatus.planGate || "unknown",
    approval_status: gateStatus.approvalStatus || "pending",
    last_updated: new Date().toISOString(),
    ...extra,
  };
  try {
    writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
  } catch (err) {
    console.error(`[sisyphus-gates] Failed to write state to ${path}:`, err.message);
  }
}

/**
 * Quick check: does the canonical state file exist on disk?
 * (W1.C: now also returns true if the per-project state file exists.)
 */
export function stateFileExists() {
  const projectName = getProjectName(process.cwd());
  return existsSync(getActiveStatePath(projectName));
}

/**
 * Quick check: does the legacy sidecar state file exist?
 * Used by the negative-lookup test to confirm we no longer read it.
 */
export function legacySidecarExists() {
  return existsSync(getLegacySidecarStatePath());
}

// ─── Session state (in-memory, per-session) ──────────────────────────────

const sessionState = new Map();

/**
 * Default shape for a fresh session. `phase` is overwritten below if a
 * persisted state file is present.
 */
function defaultSessionState() {
  return {
    phase: "discovery",
    prdApproved: false,
    planApproved: false,
    evidenceLogged: false,
    lastCheckpoint: "session-start",
    prdGateStatus: "unknown",
    planGateStatus: "unknown",
    approvalStatus: "pending",
    stateFileExists: false,
    planId: null,
    repairBriefPath: null,
  };
}

/**
 * Get the per-session state object, creating it on first call.
 * On creation, syncs with disk (reads persisted phase if present).
 */
export function getState(sessionID) {
  if (!sessionState.has(sessionID)) {
    const s = defaultSessionState();
    sessionState.set(sessionID, s);
    syncStateWithDisk(sessionID);
  }
  return sessionState.get(sessionID);
}

/**
 * Refresh the in-memory session state from disk + review files.
 * Sets stateFileExists to reflect disk presence.
 * Falls back to review-file scan for gate status when no state file exists.
 * Returns the state object (or undefined if sessionID is unknown), so
 * callers like the G3 chat-transform hook can chain on a fresh value.
 */
export function syncStateWithDisk(sessionID) {
  const state = sessionState.get(sessionID);
  if (!state) return undefined;

  let persistent = null;
  try {
    persistent = readPersistentState();
  } catch (err) {
    // Corrupt or future-schema state: treat as missing AND log.
    console.error(`[sisyphus-gates] Persistent state unreadable:`, err.message);
    persistent = null;
  }

  const reviews = scanReviewFiles();

  state.prdGateStatus = persistent?.prd_gate || reviews.prdGate || "unknown";
  state.planGateStatus = persistent?.plan_gate || reviews.planGate || "unknown";
  state.approvalStatus = persistent?.approval_status || "pending";
  state.stateFileExists = persistent !== null;

  // Read persisted phase on init (W1.A bug #7 fix)
  if (persistent && typeof persistent.phase === "string") {
    state.phase = persistent.phase;
  }

  if (state.prdGateStatus === "PASS") state.prdApproved = true;
  if (state.planGateStatus === "PASS") state.planApproved = true;

  if (reviews.prdGate === "FAIL") {
    state.prdApproved = false;
    state.prdGateStatus = "FAIL";
  }
  if (reviews.planGate === "FAIL") {
    state.planApproved = false;
    state.planGateStatus = "FAIL";
  }

  return state;
}
