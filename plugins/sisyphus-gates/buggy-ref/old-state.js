/**
 * buggy-ref/old-state.js — the OLD readPersistentState and getState from dist/index.js v0.1.0
 *
 * Used only for RED→GREEN TDD demonstration. The old code:
 * - readPersistentState catches JSON parse errors silently and returns null
 *   (so corrupt state looked "missing" — the loophole)
 * - getState hardcodes phase="discovery" on first init (no disk read)
 * - Reads from LEGACY path ~/.config/opencode/.sisyphus/state.json
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const GLOBAL_STATE_PATH = resolve(process.env.HOME || "~", ".config/opencode/.sisyphus/state.json");

export const CURRENT_SCHEMA_VERSION = "2.0.0";  // OLD value

export function readPersistentState() {
  // OLD BUGGY VERSION: catches parse error, returns null
  try {
    if (!existsSync(GLOBAL_STATE_PATH)) return null;
    return JSON.parse(readFileSync(GLOBAL_STATE_PATH, "utf-8"));
  } catch {
    return null;
  }
}

export function writePersistentState(projectName, gateStatus) {
  try {
    writeFileSync(GLOBAL_STATE_PATH, JSON.stringify({
      project: projectName,
      prd_gate: gateStatus.prdGate || "unknown",
      plan_gate: gateStatus.planGate || "unknown",
      approval_status: gateStatus.approvalStatus || "pending",
      last_updated: new Date().toISOString(),
    }, null, 2));
  } catch {
  }
}

export function stateFileExists() {
  return existsSync(GLOBAL_STATE_PATH);
}

const sessionState = new Map();

export function getState(sessionID) {
  if (!sessionState.has(sessionID)) {
    sessionState.set(sessionID, {
      phase: "discovery",  // OLD BUG: hardcoded, never reads from disk
      prdApproved: false,
      planApproved: false,
      evidenceLogged: false,
      lastCheckpoint: "session-start",
      prdGateStatus: "unknown",
      planGateStatus: "unknown",
      approvalStatus: "pending",
      stateFileExists: false,
    });
    syncStateWithDisk(sessionID);
  }
  return sessionState.get(sessionID);
}

export function syncStateWithDisk(sessionID) {
  const state = sessionState.get(sessionID);
  const persistent = readPersistentState();
  state.prdGateStatus = persistent?.prd_gate || "unknown";
  state.planGateStatus = persistent?.plan_gate || "unknown";
  state.approvalStatus = persistent?.approval_status || "pending";
  state.stateFileExists = persistent !== null;
  // OLD BUG: never reads persistent.phase
}

export function legacySidecarExists() {
  return existsSync(GLOBAL_STATE_PATH);
}
