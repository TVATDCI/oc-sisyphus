/**
 * paths.js — canonical path constants for sisyphus-gates.
 *
 * W1.A change: the canonical state root moved from
 *   ~/.config/opencode/.sisyphus/state.json
 * to
 *   ~/.sisyphus/state.json
 * (per Wave 0 user decision: `~/.sisyphus/` is the canonical live state root.)
 *
 * The old sidecar path is still defined for the deprecated banner write and
 * for one test that proves the plugin no longer reads it.
 *
 * W1.C additions: per-project state paths at
 *   ~/.sisyphus/projects/{name}/state.json
 */

import { resolve } from "node:path";

/**
 * Canonical persistent state path: $HOME/.sisyphus/state.json
 * Resolved lazily so tests can override process.env.HOME before first read.
 */
export function getCanonicalStatePath() {
  const home = process.env.HOME || "~";
  return resolve(home, ".sisyphus", "state.json");
}

/**
 * Old (deprecated) sidecar state path. Kept for the workflow.yaml banner
 * location reference and the negative-lookup test. The plugin does NOT read it.
 */
export const LEGACY_SIDECAR_STATE_PATH = ".config/opencode/.sisyphus/state.json";

export function getLegacySidecarStatePath() {
  const home = process.env.HOME || "~";
  return resolve(home, LEGACY_SIDECAR_STATE_PATH);
}

/**
 * Per-project state directory: $HOME/.sisyphus/projects/{name}/
 * W1.C: per-project isolation.
 */
export function getProjectStateDir(projectName) {
  const home = process.env.HOME || "~";
  return resolve(home, ".sisyphus", "projects", projectName);
}

/**
 * Per-project state file: $HOME/.sisyphus/projects/{name}/state.json
 * W1.C: per-project isolation.
 */
export function getProjectStatePath(projectName) {
  return resolve(getProjectStateDir(projectName), "state.json");
}

/**
 * G1: Repair-brief directory: $HOME/.sisyphus/repairs/
 * Holds structured YAML repair briefs written on FAIL gate state, read
 * by wave-executor Step 1.5 as HARD CONSTRAINTS.
 */
export function getRepairsDir() {
  const home = process.env.HOME || "~";
  return resolve(home, ".sisyphus", "repairs");
}

/**
 * G1: Repair-brief file path for a given planId + ISO timestamp.
 * Filename: <planId>-<iso-timestamp-filename-safe>.yaml
 */
export function getRepairBriefPath(planId, isoTimestamp) {
  const safe = String(isoTimestamp).replace(/[:.]/g, "-");
  return resolve(getRepairsDir(), `${planId}-${safe}.yaml`);
}
