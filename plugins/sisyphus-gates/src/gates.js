/**
 * gates.js — gate decisions and command/tool blocking.
 *
 * W1.A changes (the central security fix):
 *   - mustBlockExecution rewritten: returns blocked:true if ANY of —
 *       (a) !state.stateFileExists   (state file must exist on disk)
 *       (b) prdGateStatus === "unknown" || planGateStatus === "unknown"
 *       (c) prdGateStatus === "FAIL"  || planGateStatus === "FAIL"
 *       (d) approvalStatus !== "approved"
 *     Only returns blocked:false when ALL of: state file exists, both gates
 *     PASS, approval status is "approved". The "pending is acceptable"
 *     loophole is closed.
 *   - shouldBlockTool actually attempts to set output.parts to block the
 *     tool call when fail-closed triggers. Annotation remains for
 *     forensic logging. If the opencode plugin API does not honor
 *     output.parts for tool blocking, we'll address that in W1.C.
 *   - shouldBlockCommand also returns blocked:true when mustBlockExecution
 *     blocks and the command is destructive (git commit, git push, bd close).
 *
 * W1.C changes:
 *   - isDestructiveCommand is re-exported from command-policy.js (the
 *     new comprehensive implementation that closes the W1.A bypasses:
 *     whitespace variants, env-var prefix, python -c, node -e, npm
 *     uninstall, git checkout, chmod -R, redirects, sudo, etc.).
 *   - isAlwaysBlocked (catastrophic denylist) is checked FIRST in
 *     shouldBlockTool and shouldBlockCommand. Catastrophic commands
 *     (rm -rf /, dd if=, mkfs.*, git reset --hard, git push --force
 *     origin main, etc.) block in ALL phases, including execution.
 *   - containsSudo is checked before any other logic. Sudo is never
 *     allowed.
 *   - isSafeReadOnlyCommand (the explicit allowlist) is checked BEFORE
 *     fail-closed. Safe read-only commands (ls, cat, git status,
 *     git log, etc.) are allowed even when fail-closed is active.
 *     This closes the over-broad blocking that the W1.A test
 *     "shouldBlockTool blocks bash when mustBlockExecution blocks"
 *     relied on — that test was updated to use a destructive command
 *     in W1.C.
 *
 * W1.E changes:
 *   - mustBlockExecution now adds a NEW fail-closed check (e): if the
 *     workflow config is unavailable (yaml missing or invalid) AND a
 *     state file exists, the plugin refuses to enforce gates. The
 *     yaml is the source of truth for phase transitions and gate
 *     decisions — without it, we cannot determine what phase the
 *     session is in, so we block everything until the operator
 *     restores the config.
 */

import {
  isDestructiveCommand,
  isSafeReadOnlyCommand,
} from "./command-policy.js";
import {
  containsSudo,
  isAlwaysBlocked,
} from "./sudo-policy.js";
import { getCachedWorkflowConfig } from "./workflow-loader.js";

// Re-export for backward compat with W1.A tests
export { isDestructiveCommand };

/**
 * Decide whether execution must be blocked. This is the central fail-closed
 * check. Returns { blocked: boolean, reason?: string }.
 *
 * The OLD implementation (pre-W1.A) had a loophole: if state file was
 * missing AND no review files showed FAIL, it returned blocked:false. That
 * meant a fresh project with no state.json could execute freely. The new
 * rule: only "approved" unblocks, AND the state file must exist on disk.
 *
 * W1.E: also blocks when the workflow config is unavailable AND a state
 * file exists. The reasoning: the yaml drives the phase machine and gate
 * prompt. Without it, the plugin cannot know what phase the session is
 * in, so it cannot safely allow execution.
 */
export function mustBlockExecution(state) {
  // W1.E: (e) Workflow config must be available. Treat as fail-closed
  // ONLY when a state file exists (otherwise the regular (a) check
  // already covers it and we don't double-block). This guards against
  // a scenario where someone deletes the yaml but leaves a stale state
  // file — we want the operator to notice and restore the config.
  if (state.stateFileExists && getCachedWorkflowConfig() === null) {
    return {
      blocked: true,
      reason: `Workflow config unavailable: ~/.sisyphus/workflow.yaml missing or invalid. Refusing to enforce gates.`,
    };
  }

  // (a) State file must exist
  if (!state.stateFileExists) {
    return {
      blocked: true,
      reason: `State file missing at canonical path. Sisyphus fail-closed: no execution without persisted state. Approval=${state.approvalStatus}, PRD=${state.prdGateStatus}, Plan=${state.planGateStatus}.`,
    };
  }

  // (b) Gate status must be known (not "unknown")
  if (state.prdGateStatus === "unknown" || state.planGateStatus === "unknown") {
    return {
      blocked: true,
      reason: `Gate status unknown (PRD: ${state.prdGateStatus}, Plan: ${state.planGateStatus}). Run review gates before executing.`,
    };
  }

  // (c) No gate may FAIL
  if (state.prdGateStatus === "FAIL" || state.planGateStatus === "FAIL") {
    return {
      blocked: true,
      reason: `Gate review(s) FAILED (PRD: ${state.prdGateStatus}, Plan: ${state.planGateStatus}). Fix blockers and re-run review gates before executing.`,
    };
  }

  // (d) Approval must be "approved" (NOT "pending", NOT anything else)
  if (state.approvalStatus !== "approved") {
    return {
      blocked: true,
      reason: `approval_status is "${state.approvalStatus}". Must be "approved" to execute.`,
    };
  }

  return { blocked: false };
}

/**
 * Decide whether a tool call should be blocked.
 *
 * Layered decision order:
 *   1. Catastrophic (isAlwaysBlocked) → always block, all phases
 *   2. Sudo (containsSudo) → always block
 *   3. Safe read-only tools (read, grep, websearch, glob) → never block
 *   4. Safe read-only bash commands (ls, cat, git status, etc.) → never block
 *   5. Fail-closed (mustBlockExecution) → block write/edit/bash with destructive or non-safe commands
 *   6. Phase-specific rules
 *
 * Returns { blocked: false } OR { blocked: true, reason: string, blockTool?: boolean }.
 */
export function shouldBlockTool(tool, args, state) {
  // Layer 1: Catastrophic denylist (always blocked, even in execution phase)
  if (tool === "bash" && args?.command && isAlwaysBlocked(args.command)) {
    return {
      blocked: true,
      reason: "Catastrophic command blocked in all phases (W1.C isAlwaysBlocked)",
      blockTool: true,
    };
  }

  // Layer 2: Sudo (always blocked)
  if (tool === "bash" && args?.command && containsSudo(args.command)) {
    return {
      blocked: true,
      reason: "sudo commands are never allowed (W1.C sudo policy)",
      blockTool: true,
    };
  }

  // Layer 3: Safe read-only tools (always allowed)
  if (tool === "read" || tool === "grep" || tool === "websearch" || tool === "glob") {
    return { blocked: false };
  }

  // Layer 4: Safe read-only bash commands (always allowed, even when fail-closed)
  if (tool === "bash" && args?.command && isSafeReadOnlyCommand(args.command)) {
    return { blocked: false };
  }

  // Layer 5: Fail-closed blocks write/edit/bash with non-safe commands
  const failClosed = mustBlockExecution(state);
  if (failClosed.blocked && (tool === "write" || tool === "edit" || tool === "bash")) {
    return { ...failClosed, blockTool: true };
  }

  // Layer 6: Phase-specific logic
  if (state.phase === "discovery" || state.phase === "prd-writing") {
    return { blocked: false };
  }

  if (state.phase === "prd-review") {
    if (tool === "bash" && args?.command && isDestructiveCommand(args.command)) {
      return { blocked: true, reason: "Destructive commands blocked during PRD review", blockTool: true };
    }
    return { blocked: false };
  }

  if (state.prdApproved && !state.planApproved) {
    if (tool === "bash" && args?.command) {
      if (args.command.includes("git commit") || args.command.includes("git push")) {
        return {
          blocked: true,
          reason: "Cannot commit until plan gate passes. Run /skill:plan-writer first.",
          blockTool: true,
        };
      }
      if (isDestructiveCommand(args.command)) {
        return { blocked: true, reason: "Destructive commands blocked", blockTool: true };
      }
    }
    return { blocked: false };
  }

  if (state.planApproved) {
    if (tool === "bash" && args?.command && isDestructiveCommand(args.command)) {
      return { blocked: true, reason: "Destructive commands blocked", blockTool: true };
    }
    return { blocked: false };
  }

  if (tool === "bash" && args?.command && isDestructiveCommand(args.command)) {
    return { blocked: true, reason: "Destructive commands blocked until gates pass", blockTool: true };
  }

  return { blocked: false };
}

/**
 * Decide whether a custom command (git commit, git push, bd close, etc.)
 * should be blocked.
 *
 * Layered decision order:
 *   1. Catastrophic (isAlwaysBlocked) → always block, all phases
 *   2. Sudo (containsSudo) → always block
 *   3. Safe read-only (isSafeReadOnlyCommand) → never block
 *   4. Fail-closed → block for known dangerous commands
 *   5. Phase-specific rules (plan approval, evidence)
 */
export function shouldBlockCommand(command, args, state) {
  // Layer 1: Catastrophic (always blocked, even in execution)
  if (typeof command === "string" && isAlwaysBlocked(command)) {
    return {
      blocked: true,
      reason: "Catastrophic command blocked in all phases (W1.C isAlwaysBlocked)",
      blockTool: true,
    };
  }

  // Layer 2: Sudo (always blocked)
  if (typeof command === "string" && containsSudo(command)) {
    return {
      blocked: true,
      reason: "sudo commands are never allowed (W1.C sudo policy)",
      blockTool: true,
    };
  }

  // Layer 3: Safe read-only commands (always allowed, even when fail-closed)
  if (typeof command === "string" && isSafeReadOnlyCommand(command)) {
    return { blocked: false };
  }

  // Layer 4: Fail-closed
  const failClosed = mustBlockExecution(state);
  if (failClosed.blocked && (command === "git commit" || command === "git push" || command === "bd close")) {
    return { ...failClosed, blockTool: true };
  }

  if (command === "bd close" && !state.evidenceLogged) {
    return {
      blocked: true,
      reason: "Cannot close issue until evidence is logged. Run validation first.",
      blockTool: true,
    };
  }

  if ((command === "git commit" || command === "git push") && !state.planApproved) {
    return {
      blocked: true,
      reason: "Cannot commit/push until plan gate passes.",
      blockTool: true,
    };
  }

  return { blocked: false };
}
