/**
 * buggy-ref/old-gates.js — the OLD mustBlockExecution from dist/index.js v0.1.0
 *
 * Used only for RED→GREEN TDD demonstration. The old code has the central
 * security loophole: if state file is missing AND no review files show FAIL,
 * it returns blocked:false. It also allows "pending" approval, which
 * W1.A removes.
 *
 * Replicate of dist/index.js v0.1.0 mustBlockExecution (lines 126-151):
 *
 *   function mustBlockExecution(state) {
 *     if (!state.stateFileExists) {
 *       if (state.prdGateStatus === "FAIL" || state.planGateStatus === "FAIL") {
 *         return { blocked: true, reason: "State file missing. Gate decisions found in review files ..." };
 *       }
 *     }
 *     if (state.approvalStatus && state.approvalStatus !== "approved" && state.approvalStatus !== "pending") {
 *       return { blocked: true, reason: 'approval_status is "...". Must be "approved" to execute.' };
 *     }
 *     if (state.prdGateStatus === "FAIL" || state.planGateStatus === "FAIL") {
 *       return { blocked: true, reason: "Gate review(s) FAILED ..." };
 *     }
 *     return { blocked: false };
 *   }
 */

export function isDestructiveCommand(cmd) {
  if (typeof cmd !== "string") return false;
  return [
    /^rm\s/,
    /^rm\s+-rf/,
    /^git\s+reset\s+--hard/,
    /^git\s+push\s+--force/,
    /^git\s+clean\s+-fd/,
    /sudo\s+/,
    /^dd\s+/,
    /^mkfs/,
    /^shutdown/,
    /^reboot/,
  ].some((p) => p.test(cmd.trim()));
}

export function mustBlockExecution(state) {
  // OLD BUGGY VERSION: returns blocked:false when state missing + no FAIL reviews
  if (!state.stateFileExists) {
    if (state.prdGateStatus === "FAIL" || state.planGateStatus === "FAIL") {
      return {
        blocked: true,
        reason: `State file missing. Gate decisions found in review files (PRD: ${state.prdGateStatus}, Plan: ${state.planGateStatus}). Run review gates before executing.`,
      };
    }
  }

  if (state.approvalStatus && state.approvalStatus !== "approved" && state.approvalStatus !== "pending") {
    return {
      blocked: true,
      reason: `approval_status is "${state.approvalStatus}". Must be "approved" to execute.`,
    };
  }

  if (state.prdGateStatus === "FAIL" || state.planGateStatus === "FAIL") {
    return {
      blocked: true,
      reason: `Gate review(s) FAILED (PRD: ${state.prdGateStatus}, Plan: ${state.planGateStatus}). Fix blockers and re-run review gates before executing.`,
    };
  }

  return { blocked: false };
}

export function shouldBlockTool(tool, args, state) {
  const failClosed = mustBlockExecution(state);
  if (failClosed.blocked && (tool === "write" || tool === "edit" || tool === "bash")) {
    return failClosed;
  }
  return { blocked: false };
}

export function shouldBlockCommand(command, args, state) {
  const failClosed = mustBlockExecution(state);
  if (failClosed.blocked && (command === "git commit" || command === "git push" || command === "bd close")) {
    return failClosed;
  }
  return { blocked: false };
}
