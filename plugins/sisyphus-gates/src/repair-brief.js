/**
 * repair-brief.js — write structured repair briefs to ~/.sisyphus/repairs/
 *
 * G1: emits a YAML file when a gate is FAIL, captures the verdict data
 * (blockers, timestamp, reviewer). wave-executor Step 1.5 reads the most
 * recent brief for the active plan and treats its blockers as HARD
 * CONSTRAINTS for the next iteration.
 *
 * Idempotency: keyed by (planId, prior_verdict.timestamp) via the filename
 * pattern <planId>-<iso-timestamp>.yaml. A second write with the same key
 * is a no-op and returns the existing path.
 *
 * Schema (schema_version "1.0.0"):
 *   plan_id, prior_verdict { kind, decision, blockers[], timestamp, reviewer },
 *   iterations, status ("open" | "resolved"), created_at.
 */

import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { getRepairsDir } from "./paths.js";

export const BRIEF_SCHEMA_VERSION = "1.0.0";

function timestampToFilename(iso) {
  return String(iso).replace(/[:.]/g, "-");
}

export function buildRepairBrief(state, verdict) {
  if (!state || !verdict) return null;
  return {
    schema_version: BRIEF_SCHEMA_VERSION,
    plan_id: state.planId,
    prior_verdict: {
      kind: verdict.kind,
      decision: verdict.decision,
      blockers: Array.isArray(verdict.blockers) ? verdict.blockers : [],
      timestamp: verdict.timestamp,
      reviewer: verdict.reviewer,
    },
    iterations: 1,
    status: "open",
    created_at: new Date().toISOString(),
  };
}

export function serializeBrief(brief) {
  return yaml.dump(brief, { lineWidth: 100, noRefs: true });
}

export function parseRepairBrief(yamlText) {
  const obj = yaml.load(yamlText);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("repair-brief: not a YAML object");
  }
  if (obj.schema_version !== BRIEF_SCHEMA_VERSION) {
    throw new Error(
      `repair-brief: unsupported schema_version "${obj.schema_version}" (expected "${BRIEF_SCHEMA_VERSION}")`
    );
  }
  return obj;
}

export function writeRepairBrief(state, verdict) {
  if (!state || !state.planId || !verdict || !verdict.timestamp) return null;
  const verdictTimestamp = verdict.timestamp;
  const dir = getRepairsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filename = `${state.planId}-${timestampToFilename(verdictTimestamp)}.yaml`;
  const path = join(dir, filename);
  if (existsSync(path)) {
    state.repairBriefPath = path;
    return path;
  }
  const brief = buildRepairBrief(state, verdict);
  writeFileSync(path, serializeBrief(brief), "utf-8");
  state.repairBriefPath = path;
  return path;
}

export function readLatestRepairBrief(planId) {
  if (!planId) return null;
  const dir = getRepairsDir();
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(`${planId}-`) && f.endsWith(".yaml"))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  const path = join(dir, files[0]);
  try {
    return parseRepairBrief(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function maybeEmitRepairBrief(state, latestVerdict) {
  if (!state) return null;
  const hasFail =
    state.prdGateStatus === "FAIL" || state.planGateStatus === "FAIL";
  if (!hasFail) return null;
  if (!latestVerdict || latestVerdict.decision !== "FAIL") return null;
  return writeRepairBrief(state, latestVerdict);
}
