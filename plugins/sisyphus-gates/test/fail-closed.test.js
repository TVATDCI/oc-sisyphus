/**
 * test/fail-closed.test.js — W1.A fail-closed correctness tests.
 *
 * These 17 tests prove the central security fix: the plugin actually
 * fails closed when state is missing or corrupt, instead of silently
 * allowing execution.
 *
 * Test framework: node:test (built-in)
 * Assertions:    node:assert/strict
 *
 * Run: `npm test` or `node --test test/fail-closed.test.js`
 */

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  mustBlockExecution,
  shouldBlockTool,
  shouldBlockCommand,
} from "../src/gates.js";
import { readPersistentState, writePersistentState, getState, CURRENT_SCHEMA_VERSION } from "../src/state.js";
import { advancePhaseIfNeeded } from "../src/phase-machine.js";
import { clearWorkflowCache, loadWorkflowConfig } from "../src/workflow-loader.js";

import {
  withTempHome,
  createMockState,
  writeStateFile,
  removeStateFile,
  writeLegacyStateFile,
  canonicalStatePath,
  legacyStatePath,
} from "./helpers.js";

/**
 * W1.E: mustBlockExecution now checks the cached workflow config. Each
 * test must load the config so the (e) check (yaml unavailable + state
 * file exists → block) does not fire spuriously.
 */
beforeEach(() => {
  clearWorkflowCache();
  loadWorkflowConfig();
});

describe("W1.A — fail-closed: mustBlockExecution", () => {
  test("missing state file → mustBlockExecution returns blocked:true (stateFileExists: false, both gates unknown)", async () => {
    await withTempHome(async () => {
      const state = createMockState({
        stateFileExists: false,
        prdGateStatus: "unknown",
        planGateStatus: "unknown",
        approvalStatus: "pending",
      });
      const result = mustBlockExecution(state);
      assert.equal(result.blocked, true, "missing state file must block");
      assert.ok(result.reason, "block reason must be present");
    });
  });

  test("missing state file with PASS reviews → mustBlockExecution returns blocked:true (state file must exist even if reviews say PASS)", async () => {
    await withTempHome(async () => {
      const state = createMockState({
        stateFileExists: false,
        prdGateStatus: "PASS",
        planGateStatus: "PASS",
        approvalStatus: "approved",
      });
      const result = mustBlockExecution(state);
      assert.equal(result.blocked, true, "missing state file must block even when reviews say PASS");
      assert.ok(result.reason.includes("State file missing"), "reason must mention missing state file");
    });
  });

  test("missing state file with FAIL reviews → mustBlockExecution returns blocked:true AND reason contains FAIL", async () => {
    await withTempHome(async () => {
      const state = createMockState({
        stateFileExists: false,
        prdGateStatus: "FAIL",
        planGateStatus: "FAIL",
        approvalStatus: "rejected",
      });
      const result = mustBlockExecution(state);
      assert.equal(result.blocked, true);
      assert.ok(/FAIL/i.test(result.reason), `reason must mention FAIL: got ${result.reason}`);
    });
  });

  test("corrupt state file → readPersistentState throws, mustBlockExecution returns blocked:true", async () => {
    await withTempHome(async (home) => {
      // Write invalid JSON to the canonical state file
      const path = canonicalStatePath(home);
      writeFileSync(path, "{ this is not valid JSON ");

      // readPersistentState MUST throw on parse error (not return null)
      let threw = false;
      try {
        readPersistentState();
      } catch (err) {
        threw = true;
      }
      assert.equal(threw, true, "readPersistentState must throw on corrupt JSON, not return null");

      // After catching the throw, the caller treats the state as missing.
      // mustBlockExecution on a "missing + unknown" state blocks.
      const state = createMockState({
        stateFileExists: false,
        prdGateStatus: "unknown",
        planGateStatus: "unknown",
        approvalStatus: "pending",
      });
      const result = mustBlockExecution(state);
      assert.equal(result.blocked, true);
    });
  });

  test("valid state with unknown gate status → mustBlockExecution returns blocked:true", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, {
        project: "test",
        phase: "discovery",
        prd_gate: "unknown",
        plan_gate: "unknown",
        approval_status: "pending",
      });
      // Simulate what getState would produce after sync
      const state = createMockState({
        stateFileExists: true,
        prdGateStatus: "unknown",
        planGateStatus: "unknown",
        approvalStatus: "pending",
      });
      const result = mustBlockExecution(state);
      assert.equal(result.blocked, true);
      assert.ok(/unknown/i.test(result.reason), `reason must mention unknown: got ${result.reason}`);
    });
  });

  test("valid state with PASS gates and approval=approved → mustBlockExecution returns blocked:false", async () => {
    await withTempHome(async () => {
      const state = createMockState({
        stateFileExists: true,
        prdGateStatus: "PASS",
        planGateStatus: "PASS",
        approvalStatus: "approved",
      });
      const result = mustBlockExecution(state);
      assert.equal(result.blocked, false, `must allow execution when all gates pass and approved: ${JSON.stringify(result)}`);
    });
  });

  test("valid state with FAIL gate → mustBlockExecution returns blocked:true", async () => {
    await withTempHome(async () => {
      const state = createMockState({
        stateFileExists: true,
        prdGateStatus: "PASS",
        planGateStatus: "FAIL",
        approvalStatus: "approved",
      });
      const result = mustBlockExecution(state);
      assert.equal(result.blocked, true);
      assert.ok(/FAIL/i.test(result.reason));
    });
  });

  test("approval_status=rejected → mustBlockExecution returns blocked:true", async () => {
    await withTempHome(async () => {
      const state = createMockState({
        stateFileExists: true,
        prdGateStatus: "PASS",
        planGateStatus: "PASS",
        approvalStatus: "rejected",
      });
      const result = mustBlockExecution(state);
      assert.equal(result.blocked, true);
      assert.ok(/rejected|approval/i.test(result.reason));
    });
  });

  // W1.E: new fail-closed check (e) — workflow config unavailable + state
  // file exists → block with the new reason. This guards against a stale
  // state file outliving a deleted/edited workflow.yaml.
  test("W1.E — workflow config unavailable + state file exists → mustBlockExecution returns blocked:true with new reason", async () => {
    await withTempHome(async (home) => {
      // Remove the default yaml to force the (e) check to fire
      rmSync(join(home, ".sisyphus", "workflow.yaml"));
      clearWorkflowCache();

      const state = createMockState({
        stateFileExists: true,
        prdGateStatus: "PASS",
        planGateStatus: "PASS",
        approvalStatus: "approved",
      });
      const result = mustBlockExecution(state);
      assert.equal(result.blocked, true);
      assert.ok(
        /Workflow config unavailable/i.test(result.reason),
        `reason must mention workflow config unavailable. Got: ${result.reason}`
      );
    });
  });
});

describe("W1.A — fail-closed: readPersistentState path resolution", () => {
  test("readPersistentState reads from canonical path ~/.sisyphus/state.json", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, {
        project: "canonical-test",
        phase: "execution",
        prd_gate: "PASS",
        plan_gate: "PASS",
        approval_status: "approved",
      });
      const result = readPersistentState();
      assert.ok(result !== null, "readPersistentState must find the file at canonical path");
      assert.equal(result.project, "canonical-test");
      assert.equal(result.prd_gate, "PASS");
    });
  });

  test("readPersistentState does NOT read from ~/.config/opencode/.sisyphus/state.json", async () => {
    await withTempHome(async (home) => {
      // Populate ONLY the legacy sidecar (no canonical file)
      writeLegacyStateFile(home, {
        project: "legacy-only",
        phase: "execution",
        prd_gate: "PASS",
        plan_gate: "PASS",
        approval_status: "approved",
      });
      // Confirm canonical does NOT exist
      assert.equal(existsSync(canonicalStatePath(home)), false, "canonical must not exist for this test");
      // Confirm legacy DOES exist
      assert.equal(existsSync(legacyStatePath(home)), true, "legacy must exist for this test");

      const result = readPersistentState();
      assert.equal(result, null, "readPersistentState must NOT find the legacy sidecar");
    });
  });
});

describe("W1.A — fail-closed: shouldBlockTool", () => {
  test("shouldBlockTool blocks write when mustBlockExecution blocks", async () => {
    await withTempHome(async () => {
      const state = createMockState({ stateFileExists: false });
      const result = shouldBlockTool("write", { path: "/tmp/x" }, state);
      assert.equal(result.blocked, true);
      assert.ok(result.reason);
    });
  });

  test("shouldBlockTool blocks bash with destructive command when mustBlockExecution blocks", async () => {
    // W1.C update: W1.A used "ls" but W1.C added a safe-readonly allowlist.
    // Safe commands now pass through, so this test uses "rm -rf /tmp" to
    // still prove the fail-closed behavior for destructive bash.
    await withTempHome(async () => {
      const state = createMockState({ stateFileExists: false });
      const result = shouldBlockTool("bash", { command: "rm -rf /tmp" }, state);
      assert.equal(result.blocked, true);
      assert.ok(result.reason);
    });
  });

  test("shouldBlockTool allows safe read-only bash command even when mustBlockExecution blocks (W1.C)", async () => {
    // W1.C: explicit allowlist of safe read-only commands.
    await withTempHome(async () => {
      const state = createMockState({ stateFileExists: false });
      const result = shouldBlockTool("bash", { command: "ls -la" }, state);
      assert.equal(result.blocked, false, "safe read-only commands must be allowed");
    });
  });

  test("shouldBlockTool blocks edit when mustBlockExecution blocks", async () => {
    await withTempHome(async () => {
      const state = createMockState({ stateFileExists: false });
      const result = shouldBlockTool("edit", { path: "/tmp/x" }, state);
      assert.equal(result.blocked, true);
      assert.ok(result.reason);
    });
  });

  test("shouldBlockTool allows read when mustBlockExecution blocks", async () => {
    await withTempHome(async () => {
      const state = createMockState({ stateFileExists: false });
      const result = shouldBlockTool("read", { path: "/tmp/x" }, state);
      assert.equal(result.blocked, false, "read must always be allowed");
    });
  });
});

describe("W1.A — fail-closed: shouldBlockCommand", () => {
  test("shouldBlockCommand blocks git commit when plan not approved", async () => {
    await withTempHome(async () => {
      const state = createMockState({
        stateFileExists: true,
        prdGateStatus: "PASS",
        planGateStatus: "unknown",
        planApproved: false,
        approvalStatus: "pending",
      });
      const result = shouldBlockCommand("git commit", [], state);
      assert.equal(result.blocked, true);
    });
  });

  test("shouldBlockCommand blocks bd close when evidence not logged", async () => {
    await withTempHome(async () => {
      const state = createMockState({
        stateFileExists: true,
        prdGateStatus: "PASS",
        planGateStatus: "PASS",
        planApproved: true,
        approvalStatus: "approved",
        evidenceLogged: false,
      });
      const result = shouldBlockCommand("bd close", [], state);
      assert.equal(result.blocked, true);
      assert.ok(/evidence/i.test(result.reason));
    });
  });
});

describe("W1.A — getState reads persisted phase from disk on init", () => {
  test("getState reads persisted phase from disk on init (not hardcoded discovery)", async () => {
    await withTempHome(async (home) => {
      // Pre-populate state file with phase=execution
      writeStateFile(home, {
        project: "phase-test",
        phase: "execution",
        prd_gate: "PASS",
        plan_gate: "PASS",
        approval_status: "approved",
      });

      // Create a fresh session — this is the FIRST call to getState for this ID
      const sessionID = "test-session-phase-restore";
      const state = getState(sessionID);
      assert.equal(state.phase, "execution", `getState must read persisted phase, got: ${state.phase}`);
    });
  });
});
