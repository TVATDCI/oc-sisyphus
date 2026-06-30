/**
 * test/session-close-gate.test.js — Phase 1 anti-drift MVP.
 *
 * Tests for the session-close gate. The gate blocks `git push` and
 * `bd dolt push` when session_close.status === "open" (protocol started
 * but not completed). Fails open when status is undefined/complete/overridden.
 *
 * Source contract this test enforces (operator must implement):
 *   - gates.js: shouldBlockCommand blocks git push / bd dolt push when
 *     state.session_close?.status === "open". Returns {blocked: true, reason}.
 *     Does NOT block git commit, git push --force (already blocked by L1),
 *     bd close, or any other command.
 *   - cli.js: exports cmdProtocol(args, opts) where args=[action, protocolName]
 *     and opts.reason carries the override reason. action ∈ {start, complete, override}.
 *     (Note: `start` is a deviation from the draft — see source spec.)
 *   - cli.js: parseArgs extracts --reason <string> into opts.reason.
 *   - state.js: default state object includes a `session_close` field.
 *
 * Return shape: {blocked: boolean, reason: string} — matches existing API
 * proven by fail-closed.test.js:296-322. NOT {allowed: false, ...} as the
 * draft narrative suggests.
 *
 * Test framework: node:test (built-in)
 * Assertions:    node:assert/strict
 *
 * Run: `npm test` or `node --test test/session-close-gate.test.js`
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { shouldBlockCommand } from "../src/gates.js";
import { cmdProtocol } from "../cli.js";
import { withTempHome, createMockState, writeStateFile } from "./helpers.js";

const TEST_KEY_COMMAND = "echo test-key-do-not-use-in-prod";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Default opts matching cli.test.js defaultOpts, plus `reason` (new flag
 * consumed by cmdProtocol override).
 */
function defaultOpts(overrides = {}) {
  return {
    keyCommand: null,
    cwd: null,
    dryRun: false,
    help: false,
    reason: null,
    ...overrides,
  };
}

/**
 * State where `git push` would NORMALLY pass (plan approved, evidence logged,
 * approval granted). Use this as the base for session-close tests so the
 * ONLY thing that can block is session_close.status.
 *
 * Mirrors the "happy path" construction pattern in fail-closed.test.js.
 */
function approvedState(overrides = {}) {
  return createMockState({
    stateFileExists: true,
    prdGateStatus: "PASS",
    planGateStatus: "PASS",
    planApproved: true,
    approvalStatus: "approved",
    evidenceLogged: true,
    phase: "execution",
    ...overrides,
  });
}

function readState(home) {
  const p = join(home, ".sisyphus", "state.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

beforeEach(() => {
  process.env.SISYPHUS_VERDICT_KEY_COMMAND = TEST_KEY_COMMAND;
});

afterEach(() => {
  delete process.env.SISYPHUS_VERDICT_KEY_COMMAND;
});

// ─── shouldBlockCommand: session-close gate (tests 1–6) ─────────────────────

describe("Session-close gate — shouldBlockCommand", () => {
  test("1. status='open' blocks git push with session-close reason", async () => {
    await withTempHome(async () => {
      const state = approvedState({
        session_close: {
          status: "open",
          started_at: "2026-06-30T00:00:00.000Z",
        },
      });

      const result = shouldBlockCommand("git push", [], state);

      assert.equal(result.blocked, true, "git push must be blocked when status='open'");
      assert.match(result.reason, /session-close/i);
    });
  });

  test("2. status='complete' allows git push", async () => {
    await withTempHome(async () => {
      const state = approvedState({
        session_close: {
          status: "complete",
          started_at: "2026-06-30T00:00:00.000Z",
          completed_at: "2026-06-30T01:00:00.000Z",
        },
      });

      const result = shouldBlockCommand("git push", [], state);

      assert.equal(result.blocked, false, "git push must pass when status='complete'");
    });
  });

  test("3. status='overridden' allows git push (operator bypass)", async () => {
    await withTempHome(async () => {
      const state = approvedState({
        session_close: {
          status: "overridden",
          started_at: "2026-06-30T00:00:00.000Z",
          override_reason: "quick typo fix",
          override_at: "2026-06-30T00:05:00.000Z",
        },
      });

      const result = shouldBlockCommand("git push", [], state);

      assert.equal(result.blocked, false, "git push must pass when status='overridden'");
    });
  });

  test("4. session_close field absent → fail-open (first run after feature deploy)", async () => {
    await withTempHome(async () => {
      // approvedState() does not set session_close — simulates an old state
      // file written before this feature existed, OR a fresh session that
      // never triggered session-close.
      const state = approvedState();

      const result = shouldBlockCommand("git push", [], state);

      assert.equal(result.blocked, false, "must fail-open when session_close is absent");
    });
  });

  test("5. status='open' does NOT block git commit (only push is gated)", async () => {
    await withTempHome(async () => {
      const state = approvedState({
        session_close: { status: "open", started_at: "2026-06-30T00:00:00.000Z" },
      });

      const result = shouldBlockCommand("git commit", [], state);

      assert.equal(result.blocked, false, "git commit must NOT be gated by session-close");
    });
  });

  test("6. status='open' blocks bd dolt push", async () => {
    await withTempHome(async () => {
      const state = approvedState({
        session_close: { status: "open", started_at: "2026-06-30T00:00:00.000Z" },
      });

      const result = shouldBlockCommand("bd dolt push", [], state);

      assert.equal(result.blocked, true, "bd dolt push must be blocked when status='open'");
      assert.match(result.reason, /session-close/i);
    });
  });
});

// ─── CLI: cmdProtocol (tests 7–8) ────────────────────────────────────────────

describe("Session-close gate — cli.cmdProtocol", () => {
  test("7. complete: flips status to 'complete' and records completed_at", async () => {
    await withTempHome(async (home) => {
      // Seed state with an open session-close (started but not finished)
      writeStateFile(home, {
        project: "test-proj",
        phase: "execution",
        plan_approved: true,
        approval_status: "approved",
        evidence_logged: true,
        session_close: {
          status: "open",
          started_at: "2026-06-30T00:00:00.000Z",
        },
      });

      cmdProtocol(["complete", "session-close"], defaultOpts());

      const state = readState(home);
      assert.ok(state, "state.json must exist after cmdProtocol");
      assert.equal(state.session_close.status, "complete");
      assert.ok(
        state.session_close.completed_at,
        "completed_at must be set to an ISO timestamp"
      );
      // Audit-trail invariant: completing must not erase the start time.
      assert.equal(
        state.session_close.started_at,
        "2026-06-30T00:00:00.000Z",
        "started_at must be preserved across the complete transition"
      );
    });
  });

  test("8. override: flips status to 'overridden' and records reason + override_at", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, {
        project: "test-proj",
        phase: "execution",
        plan_approved: true,
        approval_status: "approved",
        evidence_logged: true,
        session_close: {
          status: "open",
          started_at: "2026-06-30T00:00:00.000Z",
        },
      });

      cmdProtocol(
        ["override", "session-close"],
        defaultOpts({ reason: "quick typo fix" })
      );

      const state = readState(home);
      assert.ok(state);
      assert.equal(state.session_close.status, "overridden");
      assert.equal(
        state.session_close.override_reason,
        "quick typo fix",
        "override_reason must match the --reason flag value"
      );
      assert.ok(
        state.session_close.override_at,
        "override_at must be set to an ISO timestamp"
      );
    });
  });
});
