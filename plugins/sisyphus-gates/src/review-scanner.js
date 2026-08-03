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
import { homedir } from "node:os";
import { getLatestVerdict, validateVerdict } from "./verdict-parser.js";
import { verifyVerdict } from "./verdict-signing.js";
import { logGateEvent } from "./gate-logger.js";

const _warnedBadVerdicts = new Set();

let BASE_DIR_OVERRIDE = null;

function getNotepadsPath() {
  const base = BASE_DIR_OVERRIDE || homedir();
  return join(base, ".sisyphus", "notepads");
}

function getScanPath() {
  const base = BASE_DIR_OVERRIDE || process.cwd();
  return join(base, ".sisyphus", "notepads");
}

/**
 * Scan .sisyphus/notepads/ for momus-prd-review and momus-plan-review files
 * and report their gate decision.
 *
 * @returns {{ prdGate: "PASS"|"FAIL"|null, planGate: "PASS"|"FAIL"|null }}
 */
export function scanReviewFiles() {
  const results = { prdGate: null, planGate: null };
  try {
    const notepadsPath = getScanPath();
    if (!existsSync(notepadsPath)) return results;
    for (const entry of readdirSync(notepadsPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const file of readdirSync(join(notepadsPath, entry.name))) {
        if (
          !file.includes("momus-prd-review") &&
          !file.includes("momus-plan-review")
        )
          continue;
        const content = readFileSync(
          join(notepadsPath, entry.name, file),
          "utf-8",
        );
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
    const sig = `${verdict.kind}|${verdict.reviewer}|${validation.errors.join(";")}`;
    if (!_warnedBadVerdicts.has(sig)) {
      _warnedBadVerdicts.add(sig);
      logGateEvent("scan", "invalid verdict", {
        kind: verdict.kind,
        reviewer: verdict.reviewer,
        errors: validation.errors,
      });
    }
    return undefined;
  }
  if (verdict.decision === "PASS") return "PASS";
  if (verdict.decision === "FAIL") return "FAIL";
  if (verdict.decision === "WARN") return null;
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
    const notepadsPath = getScanPath();
    if (!existsSync(notepadsPath)) return results;
    const latestByKind = { prd: null, plan: null };
    for (const entry of readdirSync(notepadsPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const file of readdirSync(join(notepadsPath, entry.name))) {
        if (
          !file.includes("momus-prd-review") &&
          !file.includes("momus-plan-review")
        )
          continue;
        const content = readFileSync(
          join(notepadsPath, entry.name, file),
          "utf-8",
        );
        const isPRD = file.includes("prd-review");
        const isPlan = file.includes("plan-review");
        if (isPRD) {
          const v = getLatestVerdict(content, "prd");
          if (
            v &&
            (!latestByKind.prd || v.timestamp >= latestByKind.prd.timestamp)
          ) {
            latestByKind.prd = v;
          }
        }
        if (isPlan) {
          const v = getLatestVerdict(content, "plan");
          if (
            v &&
            (!latestByKind.plan || v.timestamp >= latestByKind.plan.timestamp)
          ) {
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

export function loadSignedVerdicts(kind, id, memoryKey) {
  if (!memoryKey) {
    logGateEvent("scan", "loadSignedVerdicts: skipped (no memoryKey)", {
      kind,
    });
    return {
      gate: null,
      valid: false,
      id: null,
      decision: null,
      signed_at: null,
    };
  }

  try {
    const notepadsPath = getNotepadsPath();
    if (!existsSync(notepadsPath)) {
      logGateEvent("scan", "loadSignedVerdicts: notepads dir missing", {
        kind,
        notepadsPath,
      });
      return {
        gate: null,
        valid: false,
        id: null,
        decision: null,
        signed_at: null,
      };
    }

    let latest = null;

    for (const entry of readdirSync(notepadsPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sessionDir = join(notepadsPath, entry.name);
      let files;
      try {
        files = readdirSync(sessionDir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.includes(`momus-${kind}-review`)) continue;

        let content;
        try {
          content = readFileSync(join(sessionDir, file), "utf-8");
        } catch {
          continue;
        }

        const gateMatch = content.match(
          /<!--\s*SISYPHUS_GATE\s+(\{[\s\S]*?\})\s*-->/,
        );
        const sigMatch = content.match(
          /<!--\s*SISYPHUS_GATE_SIG\s+(\{[\s\S]*?\})\s*-->/,
        );
        if (!gateMatch || !sigMatch) continue;

        let payload, sig;
        try {
          payload = JSON.parse(gateMatch[1]);
          sig = JSON.parse(sigMatch[1]);
        } catch {
          continue;
        }

        if (!verifyVerdict(payload, sig, memoryKey)) continue;

        if (id && payload.id && payload.id !== id) continue;

        if (!latest || (payload.signed_at || "") >= (latest.signed_at || "")) {
          latest = payload;
        }
      }
    }

    logGateEvent("scan", "loadSignedVerdicts result", {
      kind,
      latestFound: !!latest,
      decision: latest?.decision || null,
      id: latest?.id || null,
      signedAt: latest?.signed_at || null,
    });

    if (!latest)
      return {
        gate: null,
        valid: false,
        id: null,
        decision: null,
        signed_at: null,
      };

    let gate = null;
    if (latest.decision === "PASS") gate = "PASS";
    else if (latest.decision === "FAIL") gate = "FAIL";

    return {
      gate,
      valid: true,
      id: latest.id || null,
      decision: latest.decision || null,
      signed_at: latest.signed_at || null,
      kind: latest.kind || null,
    };
  } catch {
    return {
      gate: null,
      valid: false,
      id: null,
      decision: null,
      signed_at: null,
    };
  }
}

export const _internal = {
  setBaseDir(dir) {
    BASE_DIR_OVERRIDE = dir;
  },
  resetBaseDir() {
    BASE_DIR_OVERRIDE = null;
  },
  getNotepadsPath() {
    return getNotepadsPath();
  },
};
