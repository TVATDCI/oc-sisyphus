/**
 * review-scanner.js — scan the .sisyphus/notepads/ tree for momus review files.
 *
 * W1.B: replaced the brittle string-match gate detection (which triggered
 * on `content.includes("Gate Decision:** FAIL")` and had false positives /
 * negatives) with the structured `verdict-parser`. The exported
 * `scanReviewFiles()` API is unchanged:
 *
 *   { prdGate: "PASS" | "FAIL" | null, planGate: "PASS" | "FAIL" | null }
 *
 * Mapping rules:
 *   - Verdict `decision === "PASS"` → gate = "PASS"
 *   - Verdict `decision === "FAIL"` → gate = "FAIL"
 *   - Verdict `decision === "WARN"` → gate = null (uncertain)
 *   - Verdict fails `validateVerdict` → log a warning, treat as null
 *
 * Last verdict of each kind wins (last write wins semantics).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getLatestVerdict, validateVerdict } from "./verdict-parser.js";

/**
 * Scan .sisyphus/notepads/ for momus-prd-review and momus-plan-review files
 * and report their gate decision.
 *
 * @returns {{ prdGate: "PASS"|"FAIL"|null, planGate: "PASS"|"FAIL"|null }}
 */
export function scanReviewFiles() {
  const results = { prdGate: null, planGate: null };
  try {
    const notepadsPath = join(process.cwd(), ".sisyphus", "notepads");
    if (!existsSync(notepadsPath)) return results;
    for (const entry of readdirSync(notepadsPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const file of readdirSync(join(notepadsPath, entry.name))) {
        if (!file.includes("momus-prd-review") && !file.includes("momus-plan-review")) continue;
        const content = readFileSync(join(notepadsPath, entry.name, file), "utf-8");
        const isPRD = file.includes("prd-review");
        const isPlan = file.includes("plan-review");

        // For each kind, get the latest verdict and map it to a gate status.
        if (isPRD) {
          const v = getLatestVerdict(content, "prd");
          const mapped = mapVerdictToGate(v);
          if (mapped !== undefined) results.prdGate = mapped;
        }
        if (isPlan) {
          const v = getLatestVerdict(content, "plan");
          const mapped = mapVerdictToGate(v);
          if (mapped !== undefined) results.planGate = mapped;
        }
      }
    }
  } catch {
    return results;
  }
  return results;
}

/**
 * Map a verdict (or null/invalid) to a gate status string. Returns undefined
 * when the verdict is null or invalid (caller keeps the prior value).
 *
 * @param {object|null} verdict
 * @returns {"PASS"|"FAIL"|null|undefined}
 */
function mapVerdictToGate(verdict) {
  if (!verdict) return undefined;
  const validation = validateVerdict(verdict);
  if (!validation.valid) {
    console.warn(
      `[sisyphus-gates] review-scanner: invalid verdict (kind=${verdict.kind}, reviewer=${verdict.reviewer}): ${validation.errors.join("; ")}`
    );
    return undefined;
  }
  if (verdict.decision === "PASS") return "PASS";
  if (verdict.decision === "FAIL") return "FAIL";
  if (verdict.decision === "WARN") return null; // WARN is uncertain
  return undefined;
}

/**
 * G1: scan the notepads tree and return the most recent verdict of each
 * kind (prd, plan) with FULL verdict data (blockers, timestamp, reviewer,
 * decision). Used by repair-brief.js to assemble a structured YAML brief
 * when a gate is FAIL. Each entry also includes `valid` (boolean) so the
 * caller can skip malformed verdicts without re-validating.
 *
 * @returns {Array<{kind: "prd"|"plan", decision: string, blockers: string[], timestamp: string, reviewer: string, valid: boolean}>}
 */
export function scanLatestVerdicts() {
  const results = [];
  try {
    const notepadsPath = join(process.cwd(), ".sisyphus", "notepads");
    if (!existsSync(notepadsPath)) return results;
    const latestByKind = { prd: null, plan: null };
    for (const entry of readdirSync(notepadsPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const file of readdirSync(join(notepadsPath, entry.name))) {
        if (!file.includes("momus-prd-review") && !file.includes("momus-plan-review")) continue;
        const content = readFileSync(join(notepadsPath, entry.name, file), "utf-8");
        const isPRD = file.includes("prd-review");
        const isPlan = file.includes("plan-review");
        if (isPRD) {
          const v = getLatestVerdict(content, "prd");
          if (v && (!latestByKind.prd || v.timestamp >= latestByKind.prd.timestamp)) {
            latestByKind.prd = v;
          }
        }
        if (isPlan) {
          const v = getLatestVerdict(content, "plan");
          if (v && (!latestByKind.plan || v.timestamp >= latestByKind.plan.timestamp)) {
            latestByKind.plan = v;
          }
        }
      }
    }
    for (const kind of ["prd", "plan"]) {
      const v = latestByKind[kind];
      if (!v) continue;
      const validation = validateVerdict(v);
      results.push({ ...v, kind, valid: validation.valid });
    }
  } catch {
    return results;
  }
  return results;
}
