/**
 * test/fail-closed.buggy-ref.test.js — RED baseline for W1.A
 *
 * This file imports the OLD buggy code from buggy-ref/ to demonstrate
 * that the test suite catches the security bugs being fixed.
 *
 * Run: `node --test test/fail-closed.buggy-ref.test.js`
 * Expect: many failures (RED).
 *
 * This file is for documentation only — it should NOT be run as part of
 * the normal `npm test` (excluded via the file glob, which is *.test.js —
 * the maintainer chooses which files to include in CI).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  withTempHome,
  createMockState,
  writeStateFile,
  writeLegacyStateFile,
  canonicalStatePath,
  legacyStatePath,
} from "../test/helpers.js";

import {
  mustBlockExecution,
  shouldBlockTool,
  shouldBlockCommand,
} from "../buggy-ref/old-gates.js";

import {
  readPersistentState,
  getState,
} from "../buggy-ref/old-state.js";

import { existsSync } from "node:fs";

describe("W1.A — RED BASELINE: mustBlockExecution (against OLD buggy code)", () => {
  test("RED: missing state file should block — but OLD code allows it (the loophole)", async () => {
    await withTempHome(async () => {
      const state = createMockState({
        stateFileExists: false,
        prdGateStatus: "unknown",
        planGateStatus: "unknown",
        approvalStatus: "pending",
      });
      const result = mustBlockExecution(state);
      // OLD code returns blocked:false here — test expects blocked:true
      assert.equal(result.blocked, true, "FAIL: OLD code allows execution when state missing + no FAIL reviews (the loophole)");
    });
  });

  test("RED: missing state file with PASS reviews should block — OLD code allows it", async () => {
    await withTempHome(async () => {
      const state = createMockState({
        stateFileExists: false,
        prdGateStatus: "PASS",
        planGateStatus: "PASS",
        approvalStatus: "approved",
      });
      const result = mustBlockExecution(state);
      // OLD code returns blocked:false here — test expects blocked:true
      assert.equal(result.blocked, true, "FAIL: OLD code allows execution when state missing even if reviews are PASS");
    });
  });

  test("RED: missing state file with FAIL reviews should block — OLD code does block, but...", async () => {
    await withTempHome(async () => {
      const state = createMockState({
        stateFileExists: false,
        prdGateStatus: "FAIL",
        planGateStatus: "FAIL",
        approvalStatus: "rejected",
      });
      const result = mustBlockExecution(state);
      // OLD code DOES block here, but the reason format differs
      assert.equal(result.blocked, true);
      assert.ok(/FAIL/i.test(result.reason));
    });
  });

  test("RED: corrupt state file should throw on read — OLD code returns null", async () => {
    await withTempHome(async (home) => {
      const path = canonicalStatePath(home);
      const { writeFileSync } = await import("node:fs");
      writeFileSync(path, "{ this is not valid JSON ");

      let threw = false;
      try {
        readPersistentState();
      } catch (err) {
        threw = true;
      }
      // OLD code returns null, so threw is false — test expects threw=true
      assert.equal(threw, true, "FAIL: OLD readPersistentState silently returns null on parse error");
    });
  });

  test("RED: valid state with unknown gate status should block — OLD code allows it", async () => {
    await withTempHome(async () => {
      const state = createMockState({
        stateFileExists: true,
        prdGateStatus: "unknown",
        planGateStatus: "unknown",
        approvalStatus: "pending",
      });
      const result = mustBlockExecution(state);
      // OLD code does not check for "unknown" — returns blocked:false
      assert.equal(result.blocked, true, "FAIL: OLD code does not block on unknown gate status");
    });
  });

  test("PASS gates + approved: OLD code allows (this test should be GREEN with OLD code too)", async () => {
    const state = createMockState({
      stateFileExists: true,
      prdGateStatus: "PASS",
      planGateStatus: "PASS",
      approvalStatus: "approved",
    });
    const result = mustBlockExecution(state);
    assert.equal(result.blocked, false);
  });

  test("FAIL gate: OLD code blocks (this test should be GREEN with OLD code too)", async () => {
    const state = createMockState({
      stateFileExists: true,
      prdGateStatus: "PASS",
      planGateStatus: "FAIL",
      approvalStatus: "approved",
    });
    const result = mustBlockExecution(state);
    assert.equal(result.blocked, true);
  });

  test("approval_status=rejected: OLD code blocks (this test should be GREEN with OLD code too)", async () => {
    const state = createMockState({
      stateFileExists: true,
      prdGateStatus: "PASS",
      planGateStatus: "PASS",
      approvalStatus: "rejected",
    });
    const result = mustBlockExecution(state);
    assert.equal(result.blocked, true);
  });
});

describe("W1.A — RED BASELINE: readPersistentState path resolution (against OLD code)", () => {
  test("RED: OLD code reads from ~/.config/opencode/.sisyphus/state.json, NOT canonical path", async () => {
    await withTempHome(async (home) => {
      // Populate only the canonical path
      writeStateFile(home, {
        project: "canonical-only",
        phase: "execution",
        prd_gate: "PASS",
        plan_gate: "PASS",
        approval_status: "approved",
      });
      // Confirm legacy does NOT exist
      assert.equal(existsSync(legacyStatePath(home)), false);
      // OLD code looks at the legacy path, so it returns null
      const result = readPersistentState();
      // FIXED code returns the canonical content; OLD code returns null
      assert.ok(result !== null, "FAIL: OLD code returns null because it looks at the wrong path");
    });
  });

  test("RED: OLD code DOES read from legacy sidecar (proves the path it's hardcoded to)", async () => {
    await withTempHome(async (home) => {
      // Populate ONLY the legacy sidecar
      writeLegacyStateFile(home, {
        project: "legacy-only",
        phase: "execution",
        prd_gate: "PASS",
        plan_gate: "PASS",
        approval_status: "approved",
      });
      const result = readPersistentState();
      // OLD code finds the legacy sidecar, FIXED code does not
      assert.equal(result, null, "OLD code finds the legacy sidecar — that is the bug we are fixing");
    });
  });
});

describe("W1.A — RED BASELINE: shouldBlockTool (against OLD code)", () => {
  test("RED: OLD shouldBlockTool does NOT block write when state missing + unknown gates", async () => {
    await withTempHome(async () => {
      const state = createMockState({ stateFileExists: false });
      const result = shouldBlockTool("write", { path: "/tmp/x" }, state);
      // OLD code: mustBlockExecution returns blocked:false, so shouldBlockTool returns blocked:false
      assert.equal(result.blocked, true, "FAIL: OLD shouldBlockTool does not block when state missing");
    });
  });

  test("RED: OLD shouldBlockTool does NOT block bash when state missing", async () => {
    await withTempHome(async () => {
      const state = createMockState({ stateFileExists: false });
      const result = shouldBlockTool("bash", { command: "ls" }, state);
      assert.equal(result.blocked, true, "FAIL: OLD shouldBlockTool does not block bash when state missing");
    });
  });

  test("RED: OLD shouldBlockTool does NOT block edit when state missing", async () => {
    await withTempHome(async () => {
      const state = createMockState({ stateFileExists: false });
      const result = shouldBlockTool("edit", { path: "/tmp/x" }, state);
      assert.equal(result.blocked, true, "FAIL: OLD shouldBlockTool does not block edit when state missing");
    });
  });

  test("GREEN: OLD shouldBlockTool allows read (this is fine in both versions)", async () => {
    await withTempHome(async () => {
      const state = createMockState({ stateFileExists: false });
      const result = shouldBlockTool("read", { path: "/tmp/x" }, state);
      assert.equal(result.blocked, false);
    });
  });
});

describe("W1.A — RED BASELINE: shouldBlockCommand (against OLD code)", () => {
  test("RED: OLD code: git commit not blocked if state missing + no FAIL (the loophole)", async () => {
    await withTempHome(async () => {
      const state = createMockState({ stateFileExists: false });
      const result = shouldBlockCommand("git commit", [], state);
      // OLD code: mustBlockExecution returns blocked:false, so shouldBlockCommand returns blocked:false
      assert.equal(result.blocked, true, "FAIL: OLD shouldBlockCommand does not block git commit when state missing");
    });
  });

  test("RED: OLD code: bd close not blocked if state missing + no FAIL", async () => {
    await withTempHome(async () => {
      const state = createMockState({ stateFileExists: false });
      const result = shouldBlockCommand("bd close", [], state);
      assert.equal(result.blocked, true, "FAIL: OLD shouldBlockCommand does not block bd close when state missing");
    });
  });
});

describe("W1.A — RED BASELINE: getState reads persisted phase (against OLD code)", () => {
  test("RED: OLD getState hardcodes phase='discovery' on first init (does not read from disk)", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, {
        project: "phase-test",
        phase: "execution",
        prd_gate: "PASS",
        plan_gate: "PASS",
        approval_status: "approved",
      });
      const sessionID = "test-session-phase-restore";
      const state = getState(sessionID);
      // OLD code: phase is always "discovery" on first init
      assert.equal(state.phase, "execution", `FAIL: OLD getState returned phase="${state.phase}", expected "execution"`);
    });
  });
});
