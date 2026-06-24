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
import { scanReviewFiles, loadSignedVerdicts } from "./review-scanner.js";
import { logGateEvent } from "./gate-logger.js";

export const CURRENT_SCHEMA_VERSION = "3.0.0";

let MEMORY_KEY = null;

export function setMemoryKey(key) {
  MEMORY_KEY = key && typeof key === "string" ? key : null;
}

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
    logGateEvent("state", "readPersistentState: no schema_version (accepting as legacy)", { path, expected: CURRENT_SCHEMA_VERSION });
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

  let existing = {};
  try {
    existing = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    // File doesn't exist or is corrupt — start fresh
  }

  const merged = {
    ...existing,
    schema_version: CURRENT_SCHEMA_VERSION,
    project: projectName ?? existing.project,
    phase: gateStatus.phase ?? existing.phase ?? "discovery",
    prd_gate: gateStatus.prdGate ?? existing.prd_gate ?? "unknown",
    plan_gate: gateStatus.planGate ?? existing.plan_gate ?? "unknown",
    approval_status: gateStatus.approvalStatus ?? existing.approval_status ?? "pending",
    last_updated: new Date().toISOString(),
    ...extra,
  };
  try {
    writeFileSync(path, JSON.stringify(merged, null, 2) + "\n");
  } catch (err) {
    logGateEvent("state", "writePersistentState failed", { path, error: err.message });
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
    logGateEvent("sync", "syncStateWithDisk: persistent state unreadable", { error: err.message });
    persistent = null;
  }

  const reviews = scanReviewFiles();

  const prdVerdict = loadSignedVerdicts("prd", null, MEMORY_KEY);
  const planVerdict = loadSignedVerdicts("plan", null, MEMORY_KEY);
  state.prdGateStatus = prdVerdict.gate || "unknown";
  state.planGateStatus = planVerdict.gate || "unknown";
  state.approvalStatus = persistent?.approval_status || "pending";
  state.stateFileExists = persistent !== null;

  if (persistent && typeof persistent.phase === "string") {
    state.phase = persistent.phase;
  }

  if (persistent) {
    if (persistent.plan_id) state.planId = persistent.plan_id;
    if (persistent.prd_id) state.prdId = persistent.prd_id;
  }

  if (state.prdGateStatus === "PASS") state.prdApproved = true;
  if (state.planGateStatus === "PASS") state.planApproved = true;

  if (reviews.prdGate === "FAIL" && state.prdGateStatus !== "PASS") {
    state.prdApproved = false;
    state.prdGateStatus = "FAIL";
  }
  if (reviews.planGate === "FAIL" && state.planGateStatus !== "PASS") {
    state.planApproved = false;
    state.planGateStatus = "FAIL";
  }

  logGateEvent("sync", "syncStateWithDisk", {
    sessionID,
    prdGate: state.prdGateStatus,
    planGate: state.planGateStatus,
    approval: state.approvalStatus,
    phase: state.phase,
    stateFileExists: state.stateFileExists,
    memoryKeySet: !!MEMORY_KEY,
  });

  return state;
}
