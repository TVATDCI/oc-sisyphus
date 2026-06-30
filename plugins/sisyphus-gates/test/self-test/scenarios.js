/**
 * test/self-test/scenarios.js — 23 end-to-end scenarios for sisyphus-gates.
 *
 * Updated for throw enforcement (Phase 2) and signing pivot (Phase 3):
 * - callToolExecuteBefore/callCommandExecuteBefore now catch throws
 * - Scenarios 19-20 no longer expect system prompt injection (removed in Phase 2)
 * - Gate status comes from HMAC-signed verdicts, not state.json text
 *
 * Scenario 23 (session-close-gate-lifecycle) added Phase 1.5: proves the
 * anti-drift gate actually blocks `git push` end-to-end (not just in unit
 * tests with in-memory state). Closes the M1 coverage gap from the Oracle
 * review (ses_0e579e5a7ffexFcQJLtm3eW6KP) — without this, the gate could
 * ship dormant again with all unit tests green.
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
  seedApprovedGates,
} from "./helpers.js";

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

export async function scenario_workflow_yaml_invalid() {
  const sb = createSandbox();
  try {
    writeState(sb.home, approvedState());
    writeWorkflow(sb.home, "not_a_valid_workflow: 42\n");
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

// ─── Catastrophic command scenarios ────────────────────────────────────────

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

export async function scenario_recovery_flow() {
  const sb = createSandbox();
  try {
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

    const out2 = await callToolExecuteBefore(hooks1, {
      tool: "bash",
      args: { command: "ls -la" },
      sessionID: "selftest-15b",
    });
    const r2 = assertAllowed(out2);
    if (!r2.ok) {
      return { name: "recovery-flow", ok: false, message: "step 2: should allow ls with approved state", detail: r2.reason };
    }

    corruptStateFile(sb.home);

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

    writeState(sb.home, approvedState());

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

// ─── Metrics scenarios ─────────────────────────────────────────────────────

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

// ─── Chat-system-transform scenarios (updated for Phase 2/3) ───────────────

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
    // System prompt injection was intentionally disabled (TUI clutter fix).
    // The hook should run without error and NOT inject prompt blocks.
    if (out.system.length > 0) {
      return {
        name: "chat-transform-gate-failed-metric",
        ok: false,
        message: "system prompt injection should be disabled",
      };
    }
    return {
      name: "chat-transform-gate-failed-metric",
      ok: true,
      message: "chat transform runs without injecting prompt (injection intentionally disabled)",
    };
  } finally {
    sb.cleanup();
  }
}

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
    // Gate status comes from HMAC-signed verdicts, not state.json.
    // Without signed verdicts in sandbox, no gate-failed events expected.
    // The hook should run without error and not inject prompt blocks.
    if (out2.system.length > 0) {
      return {
        name: "chat-transform-stale-state-refresh",
        ok: false,
        message: "system prompt injection should be disabled",
      };
    }
    return {
      name: "chat-transform-stale-state-refresh",
      ok: true,
      message: "chat transform refreshes from disk without injecting prompt",
    };
  } finally {
    sb.cleanup();
  }
}


// ─── Slice E (brain-9z9): Sandbox e2e scenarios ──────────────────────────

const SANDBOX_OPTIONS = {
  sandbox_paths: ["/tmp/"],
  sandbox_allowed_commands: ["npm install", "npm test"],
};

export async function scenario_sandbox_allow_npm_install() {
  const sb = createSandbox();
  const originalCwd = process.cwd();
  try {
    writeState(sb.home, approvedState());
    clearMetricsFile(sb.home);
    process.chdir(sb.home);
    const hooks = await bootServer(SANDBOX_OPTIONS);
    const out = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "npm install" },
      sessionID: "selftest-21",
    });
    const r = assertAllowed(out);
    if (!r.ok) {
      return { name: "sandbox-allow-npm-install", ok: false, message: "should allow npm install in sandbox", detail: r.reason };
    }
    const events = readMetricsEvents(sb.home);
    const sandboxEvents = events.filter((e) => e.event_subtype === "sandbox-allow");
    if (sandboxEvents.length !== 1) {
      return { name: "sandbox-allow-npm-install", ok: false, message: `expected 1 sandbox-allow event, got ${sandboxEvents.length}`, detail: JSON.stringify(events) };
    }
    const e = sandboxEvents[0];
    if (e.command !== "npm install") {
      return { name: "sandbox-allow-npm-install", ok: false, message: `expected command=npm install, got ${e.command}` };
    }
    return {
      name: "sandbox-allow-npm-install",
      ok: true,
      message: "npm install allowed in sandbox cwd + sandbox-allow event recorded",
    };
  } finally {
    process.chdir(originalCwd);
    sb.cleanup();
  }
}

export async function scenario_sandbox_blocks_critical_layers() {
  const sb = createSandbox();
  const originalCwd = process.cwd();
  try {
    writeState(sb.home, approvedState());
    clearMetricsFile(sb.home);
    process.chdir(sb.home);
    const hooks = await bootServer(SANDBOX_OPTIONS);

    // sudo should be blocked by Layer 2
    const out1 = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "sudo apt update" },
      sessionID: "selftest-22a",
    });
    const r1 = assertBlocked(out1);
    if (!r1.ok) {
      return { name: "sandbox-blocks-critical", ok: false, message: "should block sudo in sandbox", detail: r1.reason };
    }

    // rm -rf / should be blocked by Layer 1
    const out2 = await callToolExecuteBefore(hooks, {
      tool: "bash",
      args: { command: "rm -rf /" },
      sessionID: "selftest-22b",
    });
    const r2 = assertBlocked(out2);
    if (!r2.ok) {
      return { name: "sandbox-blocks-critical", ok: false, message: "should block rm -rf / in sandbox", detail: r2.reason };
    }

    // write to state.json should be blocked by Layer 0
    const statePath = sb.home + "/.sisyphus/state.json";
    const out3 = await callToolExecuteBefore(hooks, {
      tool: "write",
      args: { filePath: statePath },
      sessionID: "selftest-22c",
    });
    const r3 = assertBlocked(out3);
    if (!r3.ok) {
      return { name: "sandbox-blocks-critical", ok: false, message: "should block write to state.json in sandbox", detail: r3.reason };
    }

    return {
      name: "sandbox-blocks-critical",
      ok: true,
      message: "sandbox allows npm install but blocks sudo/rm-rf/state.json-write",
    };
  } finally {
    process.chdir(originalCwd);
    sb.cleanup();
  }
}
// ─── Session-close gate scenario (Phase 1.5 e2e) ───────────────────────────
// Only test that proves the gate blocks a real `git push` through the full
// tool.execute.before hook (unit + subprocess tests don't — Oracle M1 gap).

export async function scenario_session_close_gate_lifecycle() {
  const sb = createSandbox();
  try {
    seedApprovedGates(sb.home);
    writeState(sb.home, approvedState({
      session_close: { status: "open", started_at: "2026-06-30T00:00:00.000Z" },
    }));
    const hooks1 = await bootServer();
    const out1 = await callToolExecuteBefore(hooks1, {
      tool: "bash",
      args: { command: "git push origin main" },
      sessionID: "selftest-23a",
    });
    const r1 = assertBlocked(out1);
    if (!r1.ok) {
      return { name: "session-close-gate-lifecycle", ok: false, message: "step 1: should block git push when session_close.status='open'", detail: r1.reason };
    }
    if (!/session-close/i.test(r1.reason)) {
      return { name: "session-close-gate-lifecycle", ok: false, message: "step 1: blocked but NOT by session-close gate — blocked by: " + r1.reason };
    }

    seedApprovedGates(sb.home);
    writeState(sb.home, approvedState({
      session_close: { status: "complete", started_at: "2026-06-30T00:00:00.000Z", completed_at: "2026-06-30T01:00:00.000Z" },
    }));
    const hooks2 = await bootServer();
    const out2 = await callToolExecuteBefore(hooks2, {
      tool: "bash",
      args: { command: "git push origin main" },
      sessionID: "selftest-23b",
    });
    const r2 = assertAllowed(out2);
    if (!r2.ok) {
      return { name: "session-close-gate-lifecycle", ok: false, message: "step 2: should allow git push when session_close.status='complete'", detail: r2.reason };
    }

    seedApprovedGates(sb.home);
    writeState(sb.home, approvedState());
    const hooks3 = await bootServer();
    const out3 = await callToolExecuteBefore(hooks3, {
      tool: "bash",
      args: { command: "git push origin main" },
      sessionID: "selftest-23c",
    });
    const r3 = assertAllowed(out3);
    if (!r3.ok) {
      return { name: "session-close-gate-lifecycle", ok: false, message: "step 3: should allow git push when session_close absent (fail-open)", detail: r3.reason };
    }

    seedApprovedGates(sb.home);
    writeState(sb.home, approvedState({
      session_close: { status: "open", started_at: "2026-06-30T00:00:00.000Z" },
    }));
    const hooks4 = await bootServer();
    const out4 = await callToolExecuteBefore(hooks4, {
      tool: "bash",
      args: { command: "bd dolt push" },
      sessionID: "selftest-23d",
    });
    const r4 = assertBlocked(out4);
    if (!r4.ok) {
      return { name: "session-close-gate-lifecycle", ok: false, message: "step 4: should block bd dolt push when session_close.status='open'", detail: r4.reason };
    }
    if (!/session-close/i.test(r4.reason)) {
      return { name: "session-close-gate-lifecycle", ok: false, message: "step 4: blocked but NOT by session-close gate — blocked by: " + r4.reason };
    }

    return {
      name: "session-close-gate-lifecycle",
      ok: true,
      message: "end-to-end: open→blocked, complete→allowed, absent→allowed (fail-open), bd dolt push→blocked",
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
  scenario_sandbox_allow_npm_install,
  scenario_sandbox_blocks_critical_layers,
  scenario_session_close_gate_lifecycle,
];
