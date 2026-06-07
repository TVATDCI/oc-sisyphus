/**
 * phase-machine.js — yaml-driven phase transitions and the gate status prompt.
 *
 * W1.E: this module no longer hardcodes the phase transitions or phase
 * descriptions. Instead, it reads the cached workflow config from
 * `~/.sisyphus/workflow.yaml` (loaded by src/workflow-loader.js) and:
 *
 *   - advancePhaseIfNeeded iterates over config.workflow.auto_advance and
 *     matches the current state.phase + tool/args/output against each
 *     rule's `from` and `on` conditions. First match wins.
 *
 *   - buildGateStatusPrompt renders the phase description + next_action
 *     from config.workflow.phases[i] for the current state.phase.
 *
 * Fallback behavior: if the workflow config is unavailable (yaml missing
 * or invalid), advancePhaseIfNeeded is a no-op (phase stays put) and
 * buildGateStatusPrompt renders a generic "workflow config unavailable"
 * message. The fail-closed block (mustBlockExecution) still renders in
 * either case — that's a separate concern.
 *
 * W1.B fix (issue-creation → plan-writing) is preserved: the yaml already
 * contains the correct rule. W1.C cleanup: writePersistentState calls use
 * getProjectName() instead of the legacy process.cwd() signature.
 */

import { writePersistentState } from "./state.js";
import { mustBlockExecution } from "./gates.js";
import { getCachedWorkflowConfig } from "./workflow-loader.js";
import { getProjectName } from "./project-state.js";
import { scanLatestVerdicts } from "./review-scanner.js";
import { maybeEmitRepairBrief } from "./repair-brief.js";

/**
 * Map a yaml set_state key (snake_case) to the corresponding state object
 * field (camelCase). Unknown keys are passed through verbatim — they
 * are stored on the state object for downstream consumers (audit, etc.).
 */
const SET_STATE_KEY_MAP = {
  prd_gate: "prdGateStatus",
  plan_gate: "planGateStatus",
  prd_approved: "prdApproved",
  plan_approved: "planApproved",
  approval_status: "approvalStatus",
  last_checkpoint: "lastCheckpoint",
  evidence_logged: "evidenceLogged",
};

function applySetState(state, key, value) {
  const camelKey = SET_STATE_KEY_MAP[key] || key;
  state[camelKey] = value;
}

/**
 * Check whether a single auto_advance rule's `on` condition matches the
 * current tool/args/output. Returns true on match.
 */
function matchesCondition(rule, tool, args, output) {
  const on = rule.on || {};
  const caseSensitive = rule.case_sensitive !== false;
  const path = (args && args.path) || "";
  const outStr = typeof output === "string" ? output : "";
  const cmpPath = caseSensitive ? path : path.toLowerCase();
  const cmpOut = caseSensitive ? outStr : outStr.toLowerCase();

  if (on.type === "file_write") {
    if (tool !== "write") return false;
    const needle = on.path_contains || "";
    const cmpNeedle = caseSensitive ? needle : String(needle).toLowerCase();
    if (cmpNeedle && cmpPath.includes(cmpNeedle)) return true;
    return false;
  }

  if (on.type === "output_contains") {
    const needle = on.text || "";
    const cmpNeedle = caseSensitive ? needle : String(needle).toLowerCase();
    if (cmpNeedle && cmpOut.includes(cmpNeedle)) return true;
    return false;
  }

  // Evidence-logged style: { tool: write, path_matches: ".sisyphus/evidence/" }
  // No `type` field; the rule identifies itself by tool + path_matches.
  if (typeof on.tool === "string" && typeof on.path_matches === "string") {
    if (tool !== on.tool) return false;
    return path.includes(on.path_matches);
  }

  // Manual triggers (type: manual) and unknown shapes do NOT auto-fire.
  return false;
}

/**
 * Persist gate status to the canonical state file when a gate transition
 * (prd-review → issue-creation, plan-review → execution) fires.
 */
function persistGateTransition(state) {
  writePersistentState(getProjectName(), {
    phase: state.phase,
    prdGate: state.prdGateStatus,
    planGate: state.planGateStatus,
    approvalStatus: state.approvalStatus,
  });
}

/**
 * Advance the session phase if a phase-transition trigger fires.
 * Mutates `state` in place. No-op when the workflow config is unavailable.
 */
export function advancePhaseIfNeeded(state, tool, args, output) {
  const config = getCachedWorkflowConfig();
  if (!config || !config.workflow || !Array.isArray(config.workflow.auto_advance)) {
    return;
  }

  for (const rule of config.workflow.auto_advance) {
    if (!rule || typeof rule !== "object") continue;
    if (state.phase !== rule.from) continue;
    if (!matchesCondition(rule, tool, args, output)) continue;

    // First match wins: transition, apply set_state, persist if needed.
    state.phase = rule.to;

    if (rule.set_state && typeof rule.set_state === "object") {
      for (const [k, v] of Object.entries(rule.set_state)) {
        applySetState(state, k, v);
      }
    }

    // Persist for gate transitions (prd-review → issue-creation,
    // plan-review → execution). These transitions flip the persistent
    // gate status from "unknown" to "PASS".
    const wasGate = state.phase === "issue-creation" || state.phase === "execution";
    // Detect "was a gate phase" by checking if the gate was just set to PASS
    // via set_state in the rule we just applied. The from→to pair uniquely
    // identifies a gate transition.
    if (
      (rule.from === "prd-review" && rule.to === "issue-creation") ||
      (rule.from === "plan-review" && rule.to === "execution")
    ) {
      persistGateTransition(state);
    }

    // Suppress unused-variable warning while keeping the comment for readers.
    void wasGate;
    return;
  }
}

/**
 * Build the gate status block injected into the system prompt. The header
 * (gate status, approval, evidence, last checkpoint) is always rendered
 * from the in-memory state. The phase-specific guidance section is
 * rendered from config.workflow.phases[i] for the current phase. When
 * the workflow config is unavailable, a generic message is shown.
 */
export function buildGateStatusPrompt(state) {
  if (state.prdGateStatus === "FAIL" || state.planGateStatus === "FAIL") {
    const latestFail = scanLatestVerdicts().find((v) => v.decision === "FAIL" && v.valid);
    if (latestFail) maybeEmitRepairBrief(state, latestFail);
  }

  const lines = [
    "## Sisyphus Gate Status",
    `Current Phase: ${state.phase}`,
    `PRD Gate: ${state.prdGateStatus.toUpperCase()}`,
    `Plan Gate: ${state.planGateStatus.toUpperCase()}`,
    `Approval Status: ${state.approvalStatus.toUpperCase()}`,
    `State File: ${state.stateFileExists ? "EXISTS" : "MISSING — FAIL-CLOSED ACTIVE"}`,
    `PRD Approved: ${state.prdApproved ? "YES ✅" : "NO ⛔"}`,
    `Plan Approved: ${state.planApproved ? "YES ✅" : "NO ⛔"}`,
    `Evidence Logged: ${state.evidenceLogged ? "YES ✅" : "NO ⛔"}`,
    `Last Checkpoint: ${state.lastCheckpoint}`,
    "",
  ];

  // Fail-closed block is independent of the yaml: always render when blocking.
  const failClosed = mustBlockExecution(state);
  if (failClosed.blocked) {
    lines.push(
      "═══ ⚠️  WORKFLOW BLOCKED — FAIL-CLOSED MODE ⚠️  ═══",
      failClosed.reason,
      "",
      "To proceed:",
      "1. Fix all blocker items identified in Momus review files",
      "2. Re-run review gates: /skill:momus-prd-reviewer and/or /skill:momus-plan-reviewer",
      "3. Ensure review outputs contain 'Gate Decision: PASS'",
      "4. Or create the canonical state file at ~/.sisyphus/state.json with schema_version 3.0.0",
      "",
      "Allowed operations: read-only tools (read, grep, websearch)",
      "Blocked operations: write, edit, bash commands, git commit/push",
      ""
    );
    return lines.join("\n");
  }

  // Phase-specific guidance from yaml
  const config = getCachedWorkflowConfig();
  const phases = config?.workflow?.phases;
  if (Array.isArray(phases)) {
    const phase = phases.find((p) => p && p.id === state.phase);
    if (phase) {
      if (phase.description) lines.push(`→ ${phase.description}`);
      if (phase.next_action) lines.push(`→ ${phase.next_action}`);
      return lines.join("\n");
    }
  }

  // No yaml or unknown phase: generic message
  lines.push(
    "→ Workflow config unavailable. ~/.sisyphus/workflow.yaml is missing or invalid.",
    "→ Phase guidance and auto-advance are disabled. Restore the workflow config to re-enable governance."
  );
  return lines.join("\n");
}
