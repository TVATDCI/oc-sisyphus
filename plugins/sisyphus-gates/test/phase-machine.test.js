/**
 * test/phase-machine.test.js — W1.B phase machine tests.
 *
 * W1.B fixes the phase machine skip bug. The old behavior:
 *   - in `issue-creation` phase, write to plan file → jump to `plan-review`
 *     (skipping `plan-writing` entirely)
 *
 * The new behavior:
 *   - in `issue-creation` phase, write to plan file → `plan-writing`
 *   - in `plan-writing` phase, output contains plan content → `plan-review`
 *   - in `plan-review` phase, "Plan review PASS" → `execution` (regression)
 *
 * Also covers the existing transitions to make sure they still work:
 *   - prd-writing + write to PRD file → prd-review
 *   - prd-review + "PRD review PASS" → issue-creation
 *
 * Test framework: node:test (built-in)
 * Assertions:    node:assert/strict
 * Run: `npm test` or `node --test test/phase-machine.test.js`
 */

import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

import { withTempHome, createMockState } from "./helpers.js";
import { advancePhaseIfNeeded } from "../src/phase-machine.js";
import { clearWorkflowCache, loadWorkflowConfig } from "../src/workflow-loader.js";

/**
 * W1.E: the phase machine is now yaml-driven. Each test must load the
 * workflow config from the temp-home workflow.yaml that withTempHome
 * writes. beforeEach handles the cache clear + load so the tests stay
 * focused on transition behavior.
 */
beforeEach(() => {
  clearWorkflowCache();
  loadWorkflowConfig();
});

// ─── W1.B: The bug fix (issue-creation → plan-writing) ────────────────────

describe("W1.B — phase-machine: issue-creation → plan-writing fix", () => {
  test("in `issue-creation` phase, write to plan file → advances to `plan-writing` (not plan-review)", async () => {
    await withTempHome(async () => {
      const state = createMockState({ phase: "issue-creation" });
      advancePhaseIfNeeded(
        state,
        "write",
        { path: "/tmp/.sisyphus/plans/foo-plan.md" },
        ""
      );
      assert.equal(
        state.phase,
        "plan-writing",
        `phase must be 'plan-writing' (was buggy: skipped to 'plan-review'). Got: ${state.phase}`
      );
      assert.equal(state.lastCheckpoint, "plan-written");
    });
  });

  test("in `issue-creation` phase, write to NON-plan file → does NOT advance", async () => {
    await withTempHome(async () => {
      const state = createMockState({ phase: "issue-creation" });
      advancePhaseIfNeeded(
        state,
        "write",
        { path: "/tmp/.sisyphus/notes/board-meeting.md" },
        ""
      );
      assert.equal(state.phase, "issue-creation", "non-plan write must not advance phase");
      assert.notEqual(state.lastCheckpoint, "plan-written");
    });
  });
});

// ─── W1.B: The new transition (plan-writing → plan-review) ────────────────

describe("W1.B — phase-machine: plan-writing → plan-review transition", () => {
  test("in `plan-writing` phase, output contains plan content → advances to `plan-review`", async () => {
    await withTempHome(async () => {
      const state = createMockState({ phase: "plan-writing" });
      // The signal: any output that looks like plan content. We use the
      // existing string-match style (output.includes(...)) for now — this
      // matches the established pattern in the file. W1.E may replace
      // these with structured verdict blocks too.
      const output = "Wrote plan file. Plan content here. Plan review requested.";
      advancePhaseIfNeeded(state, "read", {}, output);
      assert.equal(
        state.phase,
        "plan-review",
        `phase must be 'plan-review' after plan content output. Got: ${state.phase}`
      );
      assert.equal(state.lastCheckpoint, "plan-written");
    });
  });
});

// ─── Regression: existing transitions still work ───────────────────────────

describe("W1.B — phase-machine: regression on existing transitions", () => {
  test("in `prd-writing` phase, write to PRD file → advances to `prd-review`", async () => {
    await withTempHome(async () => {
      const state = createMockState({ phase: "prd-writing" });
      advancePhaseIfNeeded(
        state,
        "write",
        { path: "/tmp/.sisyphus/prds/foo-prd.md" },
        ""
      );
      assert.equal(state.phase, "prd-review");
      assert.equal(state.lastCheckpoint, "prd-written");
    });
  });

  test("in `prd-review` phase, output contains 'PRD review PASS' → advances to `issue-creation`", async () => {
    await withTempHome(async (home) => {
      // prd-review transition writes to persistent state, so we need HOME set.
      const state = createMockState({ phase: "prd-review" });
      advancePhaseIfNeeded(state, "read", {}, "PRD review PASS — all checks passed.");
      assert.equal(state.phase, "issue-creation");
      assert.equal(state.lastCheckpoint, "prd-approved");
      assert.equal(state.prdApproved, true);
      assert.equal(state.prdGateStatus, "PASS");
    });
  });

  test("in `plan-review` phase, output contains 'Plan review PASS' → advances to `execution`", async () => {
    await withTempHome(async (home) => {
      const state = createMockState({ phase: "plan-review" });
      advancePhaseIfNeeded(state, "read", {}, "Plan review PASS — ready to execute.");
      assert.equal(state.phase, "execution");
      assert.equal(state.lastCheckpoint, "plan-approved");
      assert.equal(state.planApproved, true);
      assert.equal(state.planGateStatus, "PASS");
    });
  });
});

// ─── Full happy path ──────────────────────────────────────────────────────

describe("W1.B — phase-machine: full happy path", () => {
  test("prd-writing → prd-review → issue-creation → plan-writing → plan-review → execution", async () => {
    await withTempHome(async (home) => {
      const state = createMockState({ phase: "prd-writing" });

      // Step 1: write PRD → prd-review
      advancePhaseIfNeeded(state, "write", { path: "/tmp/.sisyphus/prds/foo-prd.md" }, "");
      assert.equal(state.phase, "prd-review");

      // Step 2: PRD review PASS → issue-creation
      advancePhaseIfNeeded(state, "read", {}, "PRD review PASS — approved.");
      assert.equal(state.phase, "issue-creation");
      assert.equal(state.prdApproved, true);

      // Step 3: write plan → plan-writing (the bug fix)
      advancePhaseIfNeeded(state, "write", { path: "/tmp/.sisyphus/plans/foo-plan.md" }, "");
      assert.equal(state.phase, "plan-writing");

      advancePhaseIfNeeded(state, "read", {}, "Wrote plan file. Plan content here.");
      assert.equal(state.phase, "plan-review");

      // Step 5: plan review PASS → execution
      advancePhaseIfNeeded(state, "read", {}, "Plan review PASS — ready to execute.");
      assert.equal(state.phase, "execution");
      assert.equal(state.planApproved, true);
    });
  });
});

// ─── State field updates through transitions ──────────────────────────────

describe("W1.B — phase-machine: state field updates through transitions", () => {
  test("state.prdApproved, state.planApproved, state.prdGateStatus, state.planGateStatus, state.evidenceLogged all update correctly", async () => {
    await withTempHome(async (home) => {
      // Pre-state: nothing approved, no evidence
      const state = createMockState({
        phase: "prd-writing",
        prdApproved: false,
        planApproved: false,
        prdGateStatus: "unknown",
        planGateStatus: "unknown",
        evidenceLogged: false,
      });

      // Walk through the happy path
      advancePhaseIfNeeded(state, "write", { path: "/tmp/.sisyphus/prds/foo-prd.md" }, "");
      advancePhaseIfNeeded(state, "read", {}, "PRD review PASS");
      assert.equal(state.prdApproved, true, "prdApproved must be true after PRD PASS");
      assert.equal(state.prdGateStatus, "PASS", "prdGateStatus must be PASS");

      advancePhaseIfNeeded(state, "write", { path: "/tmp/.sisyphus/plans/foo-plan.md" }, "");
      advancePhaseIfNeeded(state, "read", {}, "Plan content here.");
      advancePhaseIfNeeded(state, "read", {}, "Plan review PASS");
      assert.equal(state.planApproved, true, "planApproved must be true after Plan PASS");
      assert.equal(state.planGateStatus, "PASS", "planGateStatus must be PASS");

      // evidenceLogged: write to .sisyphus/evidence/ should set it
      assert.equal(state.evidenceLogged, false, "evidenceLogged starts false");
      advancePhaseIfNeeded(
        state,
        "write",
        { path: "/tmp/.sisyphus/evidence/w1-test.md" },
        ""
      );
      assert.equal(state.evidenceLogged, true, "evidenceLogged must be true after evidence write");
    });
  });
});
