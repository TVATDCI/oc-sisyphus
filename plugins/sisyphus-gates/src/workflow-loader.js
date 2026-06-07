/**
 * workflow-loader.js — load and validate the workflow configuration.
 *
 * W1.E: the canonical workflow definition lives at
 *   $HOME/.sisyphus/workflow.yaml
 * This module reads it once at server start (via plugin.server()) and
 * caches the parsed object. All other modules (phase-machine.js,
 * buildGateStatusPrompt, mustBlockExecution) consume the cached value
 * via getCachedWorkflowConfig().
 *
 * Fail-closed design:
 *   - File missing (ENOENT) → returns null. Caller treats as "no config".
 *   - YAML parse error → throws. Caller (plugin.js) catches and logs,
 *     treats as "no config" (the cache stays null).
 *   - Future schema_version → throws. Same fail-closed path.
 *   - Missing required fields → throws. Same fail-closed path.
 *
 * This module is the single point of truth for whether the workflow
 * is operational. If it isn't, gates.js mustBlockExecution refuses to
 * allow execution (treats invalid config as missing).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import yaml from "js-yaml";

/** Schema version supported by this build. Bump when the format changes. */
export const WORKFLOW_SCHEMA_VERSION = "1.0.0";

/** Cached config. null = never loaded or cleared. */
let cachedConfig = null;
/** Track whether cache has been populated (distinguishes "not loaded" from "loaded as null"). */
let cacheLoaded = false;

/** Resolve the canonical workflow.yaml path for a given home. */
function getWorkflowConfigPath(home) {
  const h = home || process.env.HOME || "~";
  return resolve(h, ".sisyphus", "workflow.yaml");
}

/**
 * Compare two semver-like version strings. Returns -1, 0, or 1.
 * Missing fields in the shorter version are treated as "0".
 */
function compareVersions(a, b) {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * Validate a parsed workflow config object structurally.
 * Returns { valid: boolean, errors: string[] }.
 *
 * Required top-level structure (nested under `workflow:`):
 *   - workflow.phases: array (length >= 1)
 *   - workflow.auto_advance: array
 *   - workflow.state: object
 *   - workflow.blocking: object
 *   - workflow.version: string (must not be > WORKFLOW_SCHEMA_VERSION)
 */
export function validateWorkflowConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["config is not an object"] };
  }
  if (!config.workflow || typeof config.workflow !== "object") {
    return { valid: false, errors: ["missing 'workflow' root"] };
  }
  const wf = config.workflow;

  if (!Array.isArray(wf.phases)) {
    errors.push("missing or non-array 'workflow.phases'");
  } else if (wf.phases.length < 1) {
    errors.push("'workflow.phases' must contain at least one phase");
  }

  if (!Array.isArray(wf.auto_advance)) {
    errors.push("missing or non-array 'workflow.auto_advance'");
  }

  if (!wf.state || typeof wf.state !== "object" || Array.isArray(wf.state)) {
    errors.push("missing or non-object 'workflow.state'");
  }

  if (!wf.blocking || typeof wf.blocking !== "object" || Array.isArray(wf.blocking)) {
    errors.push("missing or non-object 'workflow.blocking'");
  }

  if (typeof wf.version === "string" && wf.version.length > 0) {
    if (compareVersions(wf.version, WORKFLOW_SCHEMA_VERSION) > 0) {
      errors.push(
        `workflow.version=${wf.version} is newer than supported ${WORKFLOW_SCHEMA_VERSION}`
      );
    }
  } else {
    errors.push("missing or empty 'workflow.version'");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load the workflow config from $HOME/.sisyphus/workflow.yaml.
 * Returns the parsed object on success, or null ONLY on ENOENT.
 * Throws on: YAML parse error, future schema_version, missing required fields.
 *
 * The result is cached. Subsequent calls return the cached object
 * without re-reading the file. Use clearWorkflowCache() to force a
 * fresh read (used by tests).
 */
export function loadWorkflowConfig(home = process.env.HOME) {
  if (cacheLoaded) return cachedConfig;

  const path = getWorkflowConfigPath(home);

  if (!existsSync(path)) {
    cachedConfig = null;
    cacheLoaded = true;
    return null;
  }

  const raw = readFileSync(path, "utf-8");
  let parsed;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`Failed to parse workflow.yaml: ${err.message}`);
  }

  const validation = validateWorkflowConfig(parsed);
  if (!validation.valid) {
    throw new Error(
      `Invalid workflow config: ${validation.errors.join("; ")}`
    );
  }

  cachedConfig = parsed;
  cacheLoaded = true;
  return parsed;
}

/**
 * Return the cached config from the last successful loadWorkflowConfig call,
 * or null if no successful load has occurred (or cache was cleared).
 */
export function getCachedWorkflowConfig() {
  return cacheLoaded ? cachedConfig : null;
}

/**
 * Clear the cache. The next loadWorkflowConfig call will re-read the file.
 * Used by tests and by reload handlers.
 */
export function clearWorkflowCache() {
  cachedConfig = null;
  cacheLoaded = false;
}
