/**
 * test/phase-machine-yaml.test.js — W1.E yaml-driven phase machine tests.
 *
 * W1.E: phase-machine.js now consumes the workflow config from
 *   $HOME/.sisyphus/workflow.yaml
 * instead of hardcoding the transitions. This file proves that:
 *
 *   1. prd-writing + write to prd path → prd-review (existing transition from yaml)
 *   2. prd-review + output "PRD review PASS" → issue-creation (existing)
 *   3. issue-creation + write to plan path → plan-writing (W1.A fix, now from yaml)
 *   4. plan-writing + output "Plan content" → plan-review (new from yaml)
 *   5. plan-review + output "Plan review PASS" → execution (existing)
 *   6. unknown phase (e.g., "foo") + any tool → no transition (yaml-driven, no fallback)
 *   7. yaml missing → advancePhaseIfNeeded is a no-op (state.phase unchanged)
 *   8. yaml missing → buildGateStatusPrompt returns generic message
 *   9. buildGateStatusPrompt renders phase description from yaml
 *  10. buildGateStatusPrompt renders fail-closed block when mustBlockExecution blocks
 *
 * Test framework: node:test (built-in)
 * Assertions:    node:assert/strict
 * Run: `npm test` or `node --test test/phase-machine-yaml.test.js`
 */

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { withTempHome, createMockState } from "./helpers.js";
import { advancePhaseIfNeeded, buildGateStatusPrompt } from "../src/phase-machine.js";
import { clearWorkflowCache, loadWorkflowConfig } from "../src/workflow-loader.js";

// ─── Test 1: prd-writing → prd-review ──────────────────────────────────────

describe("W1.E — phase-machine: prd-writing → prd-review (from yaml)", () => {
  test("write to prd path → advances to prd-review", async () => {
    await withTempHome(async (home) => {
      clearWorkflowCache();
      loadWorkflowConfig(); // load the default test yaml

      const state = createMockState({ phase: "prd-writing" });
      advancePhaseIfNeeded(
        state,
        "write",
        { path: "/tmp/.sisyphus/prds/foo-prd.md" },
        ""
      );
      assert.equal(state.phase, "prd-review", "must advance to prd-review");
      assert.equal(state.lastCheckpoint, "prd-written");
    });
  });
});

// ─── Test 2: prd-review → issue-creation ──────────────────────────────────

describe("W1.E — phase-machine: prd-review → issue-creation (from yaml)", () => {
  test("output 'PRD review PASS' → advances to issue-creation", async () => {
    await withTempHome(async () => {
      clearWorkflowCache();
      loadWorkflowConfig();

      const state = createMockState({ phase: "prd-review" });
      advancePhaseIfNeeded(state, "read", {}, "PRD review PASS — all checks passed.");
      assert.equal(state.phase, "issue-creation");
      assert.equal(state.prdApproved, true);
      assert.equal(state.prdGateStatus, "PASS");
      assert.equal(state.lastCheckpoint, "prd-approved");
    });
  });
});

// ─── Test 3: issue-creation → plan-writing (W1.A fix, now from yaml) ─────

describe("W1.E — phase-machine: issue-creation → plan-writing (from yaml)", () => {
  test("write to plan path → advances to plan-writing (W1.A bug fix, now yaml-driven)", async () => {
    await withTempHome(async () => {
      clearWorkflowCache();
      loadWorkflowConfig();

      const state = createMockState({ phase: "issue-creation" });
      advancePhaseIfNeeded(
        state,
        "write",
        { path: "/tmp/.sisyphus/plans/foo-plan.md" },
        ""
      );
      assert.equal(state.phase, "plan-writing", "must advance to plan-writing (NOT plan-review)");
      assert.equal(state.lastCheckpoint, "plan-written");
    });
  });
});

// ─── Test 4: plan-writing → plan-review (new from yaml) ────────────────────

describe("W1.E — phase-machine: plan-writing → plan-review (new from yaml)", () => {
  test("output 'Plan content' → advances to plan-review", async () => {
    await withTempHome(async () => {
      clearWorkflowCache();
      loadWorkflowConfig();

      const state = createMockState({ phase: "plan-writing" });
      advancePhaseIfNeeded(state, "read", {}, "Wrote plan file. Plan content here.");
      assert.equal(state.phase, "plan-review", "must advance to plan-review");
      assert.equal(state.lastCheckpoint, "plan-written");
    });
  });
});

// ─── Test 5: plan-review → execution (from yaml) ──────────────────────────

describe("W1.E — phase-machine: plan-review → execution (from yaml)", () => {
  test("output 'Plan review PASS' → advances to execution", async () => {
    await withTempHome(async () => {
      clearWorkflowCache();
      loadWorkflowConfig();

      const state = createMockState({ phase: "plan-review" });
      advancePhaseIfNeeded(state, "read", {}, "Plan review PASS — ready to execute.");
      assert.equal(state.phase, "execution");
      assert.equal(state.planApproved, true);
      assert.equal(state.planGateStatus, "PASS");
      assert.equal(state.lastCheckpoint, "plan-approved");
    });
  });
});

// ─── Test 6: unknown phase → no transition (yaml-driven, no fallback) ─────

describe("W1.E — phase-machine: unknown phase is ignored", () => {
  test("unknown phase (e.g., 'foo') + any tool → no transition (yaml has no entry)", async () => {
    await withTempHome(async () => {
      clearWorkflowCache();
      loadWorkflowConfig();

      const state = createMockState({ phase: "foo" });
      const before = { ...state };
      advancePhaseIfNeeded(state, "write", { path: "/tmp/prd.md" }, "PRD review PASS");
      assert.equal(state.phase, "foo", "unknown phase must not transition");
      assert.equal(state.prdApproved, before.prdApproved, "side effects must not fire");
    });
  });
});

// ─── Test 7: yaml missing → advancePhaseIfNeeded is no-op ──────────────────

describe("W1.E — phase-machine: yaml missing → no-op", () => {
  test("yaml missing → advancePhaseIfNeeded is a no-op (state.phase unchanged)", async () => {
    await withTempHome(async (home) => {
      // withTempHome writes a default yaml; remove it to test the missing-yaml path.
      rmSync(join(home, ".sisyphus", "workflow.yaml"));
      clearWorkflowCache();

      const state = createMockState({ phase: "prd-writing" });
      advancePhaseIfNeeded(
        state,
        "write",
        { path: "/tmp/.sisyphus/prds/foo-prd.md" },
        ""
      );
      assert.equal(state.phase, "prd-writing", "phase must NOT change when yaml missing");
      assert.notEqual(state.lastCheckpoint, "prd-written", "checkpoint must NOT update");
    });
  });
});

// ─── Test 8: yaml missing → buildGateStatusPrompt returns generic message ──

describe("W1.E — phase-machine: yaml missing → generic gate prompt", () => {
  test("yaml missing → buildGateStatusPrompt returns generic unavailable message", async () => {
    await withTempHome(async (home) => {
      rmSync(join(home, ".sisyphus", "workflow.yaml"));
      clearWorkflowCache();

      const state = createMockState({
        phase: "prd-writing",
        prdGateStatus: "PASS",
        planGateStatus: "PASS",
        approvalStatus: "approved",
        prdApproved: true,
        planApproved: true,
        stateFileExists: true,
      });
      const prompt = buildGateStatusPrompt(state);
      assert.ok(
        /unavailable|workflow config/i.test(prompt),
        `prompt must indicate workflow config unavailable. Got: ${prompt}`
      );
    });
  });
});

// ─── Test 9: buildGateStatusPrompt renders phase description from yaml ─────

describe("W1.E — phase-machine: buildGateStatusPrompt uses yaml descriptions", () => {
  test("prompt includes the phase description from the yaml", async () => {
    await withTempHome(async (home) => {
      // Overwrite default yaml with a custom phase description to prove
      // the prompt is reading from yaml, not a hardcoded string.
      writeFileSync(
        join(home, ".sisyphus", "workflow.yaml"),
        `workflow:
  name: custom-test
  version: "1.0.0"
  phases:
    - id: discovery
      description: "CUSTOM_DISCOVERY_DESCRIPTION_42"
      next_action: "CUSTOM_NEXT_ACTION_99"
  auto_advance: []
  state:
    version: "3.0.0"
  blocking: {}
`
      );
      clearWorkflowCache();
      loadWorkflowConfig();

      const state = createMockState({
        phase: "discovery",
        prdGateStatus: "PASS",
        planGateStatus: "PASS",
        approvalStatus: "approved",
        prdApproved: true,
        planApproved: true,
        stateFileExists: true,
      });
      const prompt = buildGateStatusPrompt(state);
      assert.ok(
        prompt.includes("CUSTOM_DISCOVERY_DESCRIPTION_42"),
        `prompt must include yaml phase description. Got: ${prompt}`
      );
      assert.ok(
        prompt.includes("CUSTOM_NEXT_ACTION_99"),
        `prompt must include yaml next_action. Got: ${prompt}`
      );
    });
  });
});

// ─── Test 10: buildGateStatusPrompt shows fail-closed block when blocking ──

describe("W1.E — phase-machine: buildGateStatusPrompt fail-closed block", () => {
  test("renders fail-closed block when mustBlockExecution blocks (existing behavior)", async () => {
    await withTempHome(async () => {
      clearWorkflowCache();
      loadWorkflowConfig();

      // stateFileExists: false triggers mustBlockExecution fail-closed
      const state = createMockState({
        phase: "execution",
        prdGateStatus: "unknown",
        planGateStatus: "unknown",
        approvalStatus: "pending",
        stateFileExists: false,
      });
      const prompt = buildGateStatusPrompt(state);
      assert.ok(
        /FAIL-CLOSED|WORKFLOW BLOCKED|⛔|State file missing/i.test(prompt),
        `prompt must render fail-closed block. Got: ${prompt}`
      );
    });
  });
});
