/**
 * test/self-test/scenarios.js — 20 end-to-end scenarios for sisyphus-gates.
 *
 * Each scenario is an async function that returns { name, ok, message, detail? }.
 * Scenarios use the helpers to:
 *   1. Create a sandboxed HOME
 *   2. Optionally set up state.json or workflow.yaml
 *   3. Boot the plugin server()
 *   4. Call hooks (tool.execute.before, command.execute.before,
 *      experimental.chat.system.transform)
 *   5. Assert the plugin blocked or allowed as expected
 *   6. Clean up
 *
 * The 20 scenarios cover:
 *   - State file conditions: missing, corrupt, unknown gates, FAIL gate,
 *     pending approval, approved
 *   - Workflow config: yaml missing, yaml invalid
 *   - Catastrophic commands: rm -rf /, dd, mkfs, git push --force origin main
 *   - Sudo: never allowed
 *   - Recovery flow: state goes from approved → corrupt → fail-closed → repair
 *   - Metrics: block recorded, allow not recorded, multi-event subtypes,
 *     chat-system-transform on FAIL, chat-system-transform stale-state refresh
 */

import {
  createSandbox,
  writeState,
  corruptStateFile,
  removeState,
  removeWorkflow,
  writeWorkflow,
  bootServer,
  callToolExecuteBefore,
  callCommandExecuteBefore,
  callChatSystemTransform,
  assertBlocked,
  assertAllowed,
  readMetricsEvents,
  clearMetricsFile,
} from "./helpers.js";

/** Build a "fully approved" state object. */
function approvedState(overrides = {}) {
  return {
    phase: "execution",
    prd_gate: "PASS",
    plan_gate: "PASS",
    approval_status: "approved",
    ...overrides,
  };
}

// ─── State file scenarios ──────────────────────────────────────────────────

/**
 * Scenario 1: state.json does not exist. Plugin should block any
 * destructive action because fail-closed (a) "state file missing" fires.
 */
export async function scenario_state_missing() {
  const sb = createSandbox();
  try {
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /tmp/foo" },
      sessionID: "selftest-1",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "state-missing", ok: true, message: "blocks destructive command when state.json is missing" }
      : { name: "state-missing", ok: false, message: "should block when state is missing", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

/**
 * Scenario 2: state.json contains invalid JSON. readPersistentState throws,
 * syncStateWithDisk catches and treats as missing → fail-closed (a) fires.
 */
export async function scenario_state_corrupt() {
  const sb = createSandbox();
  try {
    corruptStateFile(sb.home);
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /tmp/foo" },
      sessionID: "selftest-2",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "state-corrupt", ok: true, message: "blocks destructive command when state.json is invalid JSON" }
      : { name: "state-corrupt", ok: false, message: "should block when state is corrupt", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

/**
 * Scenario 3: state.json is valid but prd_gate and plan_gate are "unknown".
 * Fail-closed (b) "gate status unknown" fires.
 */
export async function scenario_state_unknown_gates() {
  const sb = createSandbox();
  try {
    writeState(sb.home, {
      phase: "execution",
      prd_gate: "unknown",
      plan_gate: "unknown",
      approval_status: "pending",
    });
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /tmp/foo" },
      sessionID: "selftest-3",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "state-unknown-gates", ok: true, message: "blocks when gate status is 'unknown'" }
      : { name: "state-unknown-gates", ok: false, message: "should block on unknown gates", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

/**
 * Scenario 4: state.json has plan_gate=FAIL. Fail-closed (c) "no gate may FAIL" fires.
 */
export async function scenario_state_fail_gate() {
  const sb = createSandbox();
  try {
    writeState(sb.home, {
      phase: "execution",
      prd_gate: "PASS",
      plan_gate: "FAIL",
      approval_status: "approved",
    });
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /tmp/foo" },
      sessionID: "selftest-4",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "state-fail-gate", ok: true, message: "blocks when plan_gate=FAIL even with approval=approved" }
      : { name: "state-fail-gate", ok: false, message: "should block on FAIL gate", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

/**
 * Scenario 5: state.json has approval_status=pending. Fail-closed (d) fires.
 */
export async function scenario_state_pending_approval() {
  const sb = createSandbox();
  try {
    writeState(sb.home, {
      phase: "execution",
      prd_gate: "PASS",
      plan_gate: "PASS",
      approval_status: "pending",
    });
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /tmp/foo" },
      sessionID: "selftest-5",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "state-pending-approval", ok: true, message: "blocks when approval_status=pending" }
      : { name: "state-pending-approval", ok: false, message: "should block on pending approval", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

/**
 * Scenario 6: state.json is fully approved (all gates PASS, approval=approved,
 * phase=execution). Destructive commands should still be blocked at the
 * phase-specific layer (Layer 6: planApproved → block isDestructiveCommand).
 */
export async function scenario_state_approved_destructive_blocked() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /tmp/foo" },
      sessionID: "selftest-6",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "state-approved-destructive", ok: true, message: "blocks destructive command even in execution phase" }
      : { name: "state-approved-destructive", ok: false, message: "should block destructive command", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

/**
 * Scenario 7: state.json is fully approved. Safe read-only commands (ls, cat)
 * should be allowed even though destructive commands are blocked.
 */
export async function scenario_state_approved_safe_allowed() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "ls -la /tmp" },
      sessionID: "selftest-7",
    });
    const r = assertAllowed(out);
    return r.ok
      ? { name: "state-approved-safe", ok: true, message: "allows safe read-only command in execution phase" }
      : { name: "state-approved-safe", ok: false, message: "should allow safe command", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

// ─── Workflow config scenarios ─────────────────────────────────────────────

/**
 * Scenario 8: state.json is approved but workflow.yaml is missing.
 * Fail-closed (e) fires: gates.js mustBlockExecution blocks because the
 * yaml is the source of truth for phase transitions.
 */
export async function scenario_workflow_yaml_missing() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    removeWorkflow(sb.home);
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /tmp/foo" },
      sessionID: "selftest-8",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "workflow-yaml-missing", ok: true, message: "blocks when workflow.yaml is missing (even with approved state)" }
      : { name: "workflow-yaml-missing", ok: false, message: "should block on missing yaml", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

/**
 * Scenario 9: state.json is approved but workflow.yaml is invalid (e.g.,
 * missing required "workflow" root). loader throws, plugin runs in fail-closed
 * mode, mustBlockExecution returns blocked:true with the new (e) reason.
 */
export async function scenario_workflow_yaml_invalid() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    writeWorkflow(sb.home, "not_a_valid_workflow: 42\n"); // no `workflow:` root
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /tmp/foo" },
      sessionID: "selftest-9",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "workflow-yaml-invalid", ok: true, message: "blocks when workflow.yaml is invalid (missing required fields)" }
      : { name: "workflow-yaml-invalid", ok: false, message: "should block on invalid yaml", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

// ─── Catastrophic command scenarios (W1.C isAlwaysBlocked) ─────────────────

/**
 * Scenario 10: rm -rf / (root wipe). isAlwaysBlocked → block in all phases.
 */
export async function scenario_catastrophic_rm_rf_root() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /" },
      sessionID: "selftest-10",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "catastrophic-rm-rf-root", ok: true, message: "blocks rm -rf /" }
      : { name: "catastrophic-rm-rf-root", ok: false, message: "should block rm -rf /", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

/**
 * Scenario 11: dd if=/dev/zero of=/dev/sda (low-level disk write).
 */
export async function scenario_catastrophic_dd() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "dd if=/dev/zero of=/dev/sda" },
      sessionID: "selftest-11",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "catastrophic-dd", ok: true, message: "blocks dd if=..." }
      : { name: "catastrophic-dd", ok: false, message: "should block dd", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

/**
 * Scenario 12: mkfs.ext4 /dev/sdb (filesystem format).
 */
export async function scenario_catastrophic_mkfs() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "mkfs.ext4 /dev/sdb" },
      sessionID: "selftest-12",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "catastrophic-mkfs", ok: true, message: "blocks mkfs.*" }
      : { name: "catastrophic-mkfs", ok: false, message: "should block mkfs", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

/**
 * Scenario 13: git push --force origin main. isAlwaysBlocked fires.
 */
export async function scenario_catastrophic_force_push_main() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    const hooks = await bootServer();
    const out = await callCommandExecuteBefore(hooks, {
      command: "git push --force origin main",
      sessionID: "selftest-13",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "catastrophic-force-push", ok: true, message: "blocks git push --force origin main" }
      : { name: "catastrophic-force-push", ok: false, message: "should block force-push to main", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

// ─── Sudo scenario ─────────────────────────────────────────────────────────

/**
 * Scenario 14: sudo is never allowed. Even with fully approved state,
 * a sudo command is blocked at Layer 2 of gates.js.
 */
export async function scenario_sudo_never_allowed() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    const hooks = await bootServer();
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "sudo apt update" },
      sessionID: "selftest-14",
    });
    const r = assertBlocked(out);
    return r.ok
      ? { name: "sudo-never-allowed", ok: true, message: "blocks sudo apt update even with approved state" }
      : { name: "sudo-never-allowed", ok: false, message: "should block sudo", detail: r.reason };
  } finally {
    sb.cleanup();
  }
}

// ─── Recovery flow scenario ────────────────────────────────────────────────

/**
 * Scenario 15: end-to-end recovery flow.
 *   1. Start with fully approved state
 *   2. Verify a destructive command is blocked (catastrophic layer)
 *   3. Corrupt the state file
 *   4. Verify destructive is STILL blocked (now via fail-closed, not phase)
 *   5. Repair the state file (re-write valid)
 *   6. Verify behavior is restored (destructive still blocked, safe allowed)
 */
export async function scenario_recovery_flow() {
  const sb = createSandbox();
  try {
    // Step 1: write approved state, boot, verify catastrophic block
    writeState(sb.home, approvedState());
    const hooks1 = await bootServer();
    const out1 = await callToolExecuteBefore(hooks1, {
      tool: "bash",
      args: { command: "rm -rf /" },
      sessionID: "selftest-15a",
    });
    const r1 = assertBlocked(out1);
    if (!r1.ok) {
      return { name: "recovery-flow", ok: false, message: "step 1: should block rm -rf / with approved state", detail: r1.reason };
    }

    // Step 2: verify safe read-only is allowed
    const out2 = await callToolExecuteBefore(hooks1, {
      tool: "bash",
      args: { command: "ls -la" },
      sessionID: "selftest-15b",
    });
    const r2 = assertAllowed(out2);
    if (!r2.ok) {
      return { name: "recovery-flow", ok: false, message: "step 2: should allow ls with approved state", detail: r2.reason };
    }

    // Step 3: corrupt the state file
    corruptStateFile(sb.home);

    // Step 4: use a NEW sessionID so syncStateWithDisk re-reads from disk
    const hooks2 = await bootServer();
    const out3 = await callToolExecuteBefore(hooks2, {
      tool: "bash",
      args: { command: "rm -rf /tmp/foo" },
      sessionID: "selftest-15c",
    });
    const r3 = assertBlocked(out3);
    if (!r3.ok) {
      return { name: "recovery-flow", ok: false, message: "step 4: should still block after corruption (via fail-closed)", detail: r3.reason };
    }

    // Step 5: repair state file
    writeState(sb.home, approvedState());

    // Step 6: use a NEW sessionID again, verify behavior is restored
    const hooks3 = await bootServer();
    const out4 = await callToolExecuteBefore(hooks3, {
      tool: "bash",
      args: { command: "rm -rf /tmp/foo" },
      sessionID: "selftest-15d",
    });
    const r4 = assertBlocked(out4);
    if (!r4.ok) {
      return { name: "recovery-flow", ok: false, message: "step 6: should block destructive after repair", detail: r4.reason };
    }

    const out5 = await callToolExecuteBefore(hooks3, {
      tool: "bash",
      args: { command: "ls -la" },
      sessionID: "selftest-15e",
    });
    const r5 = assertAllowed(out5);
    if (!r5.ok) {
      return { name: "recovery-flow", ok: false, message: "step 6: should allow safe after repair", detail: r5.reason };
    }

    return {
      name: "recovery-flow",
      ok: true,
      message: "end-to-end: approved → corrupt → fail-closed → repair → restored",
    };
  } finally {
    sb.cleanup();
  }
}

// ─── Metrics scenarios (Wave 4D) ───────────────────────────────────────────

export async function scenario_metrics_block_recorded() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    clearMetricsFile(sb.home);
    const hooks = await bootServer();
    await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /" },
      sessionID: "selftest-16",
    });
    const events = readMetricsEvents(sb.home);
    if (events.length !== 1) {
      return {
        name: "metrics-block-recorded",
        ok: false,
        message: `expected 1 event, got ${events.length}`,
        detail: JSON.stringify(events),
      };
    }
    const e = events[0];
    if (e.event_subtype !== "catastrophic") {
      return {
        name: "metrics-block-recorded",
        ok: false,
        message: `expected event_subtype=catastrophic, got ${e.event_subtype}`,
      };
    }
    if (e.tool !== "bash" || e.sessionID !== "selftest-16" || e.phase !== "execution") {
      return {
        name: "metrics-block-recorded",
        ok: false,
        message: "event has wrong shape",
        detail: JSON.stringify(e),
      };
    }
    return {
      name: "metrics-block-recorded",
      ok: true,
      message: "records catastrophic block to JSONL with correct shape",
    };
  } finally {
    sb.cleanup();
  }
}

export async function scenario_metrics_allow_not_recorded() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    clearMetricsFile(sb.home);
    const hooks = await bootServer();
    await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "ls -la" },
      sessionID: "selftest-17",
    });
    const events = readMetricsEvents(sb.home);
    if (events.length !== 0) {
      return {
        name: "metrics-allow-not-recorded",
        ok: false,
        message: `expected 0 events for safe command, got ${events.length}`,
        detail: JSON.stringify(events),
      };
    }
    return {
      name: "metrics-allow-not-recorded",
      ok: true,
      message: "does not record safe read-only commands (block-only metrics)",
    };
  } finally {
    sb.cleanup();
  }
}

export async function scenario_metrics_multi_event_subtypes() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    clearMetricsFile(sb.home);
    const hooks = await bootServer();

    await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /" },
      sessionID: "selftest-18a",
    });
    await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "sudo apt update" },
      sessionID: "selftest-18b",
    });
    await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /tmp/foo" },
      sessionID: "selftest-18c",
    });

    const events = readMetricsEvents(sb.home);
    if (events.length !== 3) {
      return {
        name: "metrics-multi-event-subtypes",
        ok: false,
        message: `expected 3 events, got ${events.length}`,
        detail: JSON.stringify(events),
      };
    }
    const subtypes = new Set(events.map((e) => e.event_subtype));
    if (subtypes.size !== 3) {
      return {
        name: "metrics-multi-event-subtypes",
        ok: false,
        message: `expected 3 distinct subtypes, got ${[...subtypes].join(", ")}`,
      };
    }
    return {
      name: "metrics-multi-event-subtypes",
      ok: true,
      message: `records 3 events with distinct subtypes: ${[...subtypes].join(", ")}`,
    };
  } finally {
    sb.cleanup();
  }
}

// ─── Chat-system-transform metrics scenarios (G3) ──────────────────────────

/**
 * Scenario 19: state.json has plan_gate=FAIL. The
 * `experimental.chat.system.transform` hook runs, sees the FAIL on disk,
 * records a `gate-failed` event, and injects the gate-status block into
 * the system prompt.
 */
export async function scenario_chat_transform_gate_failed_metric() {
  const sb = createSandbox();
  try {
    writeState(sb.home, {
      phase: "prd-review",
      prd_gate: "PASS",
      plan_gate: "FAIL",
      approval_status: "pending",
    });
    clearMetricsFile(sb.home);
    const hooks = await bootServer();
    const out = await callChatSystemTransform(hooks, {
      sessionID: "selftest-19",
    });
    if (!Array.isArray(out.system) || out.system.length === 0) {
      return {
        name: "chat-transform-gate-failed-metric",
        ok: false,
        message: "expected system prompt block to be injected",
      };
    }
    if (!/WORKFLOW BLOCKED/i.test(out.system.join("\n"))) {
      return {
        name: "chat-transform-gate-failed-metric",
        ok: false,
        message: "system prompt should contain the fail-closed block",
        detail: out.system.join("\n"),
      };
    }
    const events = readMetricsEvents(sb.home);
    const failed = events.filter((e) => e.event_subtype === "gate-failed");
    if (failed.length !== 1) {
      return {
        name: "chat-transform-gate-failed-metric",
        ok: false,
        message: `expected exactly 1 gate-failed event, got ${failed.length}`,
        detail: JSON.stringify(events),
      };
    }
    const e = failed[0];
    if (e.tool !== "system-transform" || e.sessionID !== "selftest-19") {
      return {
        name: "chat-transform-gate-failed-metric",
        ok: false,
        message: "event has wrong tool/sessionID",
        detail: JSON.stringify(e),
      };
    }
    if (!/^gate-status-rendered prd=PASS plan=FAIL approval=pending/.test(e.reason)) {
      return {
        name: "chat-transform-gate-failed-metric",
        ok: false,
        message: "reason string should encode gate-status-rendered payload",
        detail: e.reason,
      };
    }
    return {
      name: "chat-transform-gate-failed-metric",
      ok: true,
      message: "chat transform records gate-failed metric and injects block on FAIL",
    };
  } finally {
    sb.cleanup();
  }
}

/**
 * Scenario 20: state.json was approved when the session was first observed,
 * but the on-disk state has since been rewritten to a FAIL. The hook must
 * re-read from disk (syncStateWithDisk) and record the event, proving it
 * does NOT trust a cached/in-memory copy.
 */
export async function scenario_chat_transform_stale_state_refresh() {
  const sb = createSandbox();
  try {
    writeState(sb.home, {
      phase: "execution",
      prd_gate: "PASS",
      plan_gate: "PASS",
      approval_status: "approved",
    });
    clearMetricsFile(sb.home);
    const hooks = await bootServer();

    const out1 = await callChatSystemTransform(hooks, {
      sessionID: "selftest-20a",
    });
    const events1 = readMetricsEvents(sb.home);
    if (events1.some((e) => e.event_subtype === "gate-failed")) {
      return {
        name: "chat-transform-stale-state-refresh",
        ok: false,
        message: "must not record gate-failed when disk state is approved",
      };
    }

    writeState(sb.home, {
      phase: "prd-review",
      prd_gate: "FAIL",
      plan_gate: "PASS",
      approval_status: "pending",
    });

    const out2 = await callChatSystemTransform(hooks, {
      sessionID: "selftest-20b",
    });
    const events2 = readMetricsEvents(sb.home);
    const failed = events2.filter((e) => e.event_subtype === "gate-failed");
    if (failed.length !== 1) {
      return {
        name: "chat-transform-stale-state-refresh",
        ok: false,
        message: `expected 1 gate-failed event after on-disk FAIL, got ${failed.length}`,
        detail: JSON.stringify(events2),
      };
    }
    if (failed[0].sessionID !== "selftest-20b") {
      return {
        name: "chat-transform-stale-state-refresh",
        ok: false,
        message: "stale-state event must carry the second sessionID",
        detail: JSON.stringify(failed[0]),
      };
    }
    if (!/WORKFLOW BLOCKED/i.test(out2.system.join("\n"))) {
      return {
        name: "chat-transform-stale-state-refresh",
        ok: false,
        message: "system prompt should now show the fail-closed block",
        detail: out2.system.join("\n"),
      };
    }
    return {
      name: "chat-transform-stale-state-refresh",
      ok: true,
      message: "chat transform refreshes from disk (syncStateWithDisk) and fires on FAIL",
    };
  } finally {
    sb.cleanup();
  }
}

// ─── Scenario registry ─────────────────────────────────────────────────────

export const SCENARIOS = [
  scenario_state_missing,
  scenario_state_corrupt,
  scenario_state_unknown_gates,
  scenario_state_fail_gate,
  scenario_state_pending_approval,
  scenario_state_approved_destructive_blocked,
  scenario_state_approved_safe_allowed,
  scenario_workflow_yaml_missing,
  scenario_workflow_yaml_invalid,
  scenario_catastrophic_rm_rf_root,
  scenario_catastrophic_dd,
  scenario_catastrophic_mkfs,
  scenario_catastrophic_force_push_main,
  scenario_sudo_never_allowed,
  scenario_recovery_flow,
  scenario_metrics_block_recorded,
  scenario_metrics_allow_not_recorded,
  scenario_metrics_multi_event_subtypes,
  scenario_chat_transform_gate_failed_metric,
  scenario_chat_transform_stale_state_refresh,
];
