/**
 * test/metachar-phase.test.js — metachar-p0-b: the compound-command
 * metachar screen is phase-INDEPENDENT.
 *
 * Root cause this pins (captain's fresh-window drill, 2026-10-22, evidence
 * fresh-window-drill-2026-10-22.md part 1b): shouldBlockTool's Layer 6
 * short-circuited discovery/prd-writing to allow-all BEFORE the
 * destructive-via-metachar screen, so `echo ok && rm -rf /tmp/...` executed
 * unblocked in the LIVE steady-state (phase=discovery, gates PASS,
 * approval approved) while the execution-phase canary stayed green.
 *
 * Fix under test: Layer 4.6 (gates.js) — a bash command carrying shell
 * metacharacters that is not a Layer 4.5 safe read-only compound is
 * blocked in EVERY phase; singles keep their existing phase behavior.
 *
 * Every assertion runs inside withTempHome with a real workflow.yaml so
 * the W1.E fail-closed check (yaml unavailable + state exists → block)
 * does not fire and the phase semantics under test are isolated.
 *
 * Test framework: node:test (built-in)
 * Run: `npm test` or `node --test test/metachar-phase.test.js`
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { shouldBlockTool } from "../src/gates.js";
import { clearWorkflowCache, loadWorkflowConfig } from "../src/workflow-loader.js";
import { withTempHome } from "./helpers.js";

beforeEach(() => {
  clearWorkflowCache();
  loadWorkflowConfig();
});

/** The live steady-state shape between builds (the captain's window). */
function steadyState(overrides = {}) {
  return {
    phase: "discovery",
    approvalStatus: "approved",
    prdGateStatus: "PASS",
    planGateStatus: "PASS",
    stateFileExists: true,
    prdApproved: true,
    planApproved: true,
    ...overrides,
  };
}

/** Build the flagged compound without a bare literal in the source. */
const FLAGGED_AND = ["echo ok && rm", "-rf /tmp/metachar-phase-never"].join(" ");
const FLAGGED_SEMI = ["echo ok; rm", "-rf /tmp/metachar-phase-never"].join(" ");

describe("metachar-p0-b — compound screen is phase-independent", () => {
  test("blocks the flagged && compound in the discovery steady-state (the captain's red)", async () => {
    await withTempHome(async () => {
      const d = shouldBlockTool("bash", { command: FLAGGED_AND }, steadyState());
      assert.equal(d.blocked, true, `expected block, got ${JSON.stringify(d)}`);
      assert.match(d.reason, /metachar/i);
      assert.equal(d.blockTool, true);
    });
  });

  test("blocks the flagged ; compound in the discovery steady-state", async () => {
    await withTempHome(async () => {
      const d = shouldBlockTool("bash", { command: FLAGGED_SEMI }, steadyState());
      assert.equal(d.blocked, true, `expected block, got ${JSON.stringify(d)}`);
    });
  });

  test("blocks the flagged compound in prd-writing", async () => {
    await withTempHome(async () => {
      const d = shouldBlockTool("bash", { command: FLAGGED_AND }, steadyState({ phase: "prd-writing" }));
      assert.equal(d.blocked, true, `expected block, got ${JSON.stringify(d)}`);
    });
  });

  test("still blocks the flagged compound in execution (unchanged)", async () => {
    await withTempHome(async () => {
      const d = shouldBlockTool("bash", { command: FLAGGED_AND }, steadyState({ phase: "execution" }));
      assert.equal(d.blocked, true, `expected block, got ${JSON.stringify(d)}`);
    });
  });

  test("blocks the flagged compound when fail-closed (gates unknown)", async () => {
    await withTempHome(async () => {
      const d = shouldBlockTool(
        "bash",
        { command: FLAGGED_AND },
        steadyState({ prdGateStatus: "unknown", planGateStatus: "unknown", prdApproved: false, planApproved: false })
      );
      assert.equal(d.blocked, true, `expected block, got ${JSON.stringify(d)}`);
    });
  });

  test("allows a benign single command in discovery (singles keep phase behavior)", async () => {
    await withTempHome(async () => {
      const d = shouldBlockTool("bash", { command: "echo metachar-phase-ok" }, steadyState());
      assert.equal(d.blocked, false);
    });
  });

  test("allows a non-safe but single command in discovery (phase policy unchanged for singles)", async () => {
    await withTempHome(async () => {
      // mkdir is a non-safe single: discovery's allow-all still governs it.
      const d = shouldBlockTool("bash", { command: "mkdir -p /tmp/metachar-phase-dir" }, steadyState());
      assert.equal(d.blocked, false, `expected allow, got ${JSON.stringify(d)}`);
    });
  });

  test("allows the Layer 4.5 read-only compound in discovery (allow-path holds)", async () => {
    await withTempHome(async () => {
      const d = shouldBlockTool("bash", { command: "git status && git log --oneline -1" }, steadyState());
      assert.equal(d.blocked, false);
    });
  });

  test("allows a read-only pipeline compound in discovery", async () => {
    await withTempHome(async () => {
      const d = shouldBlockTool("bash", { command: "ls | grep metachar" }, steadyState());
      assert.equal(d.blocked, false);
    });
  });

  test("blocks a redirect single in discovery — same class execution phase already blocks", async () => {
    await withTempHome(async () => {
      // hasShellMetachar covers redirects; execution phase blocks this today
      // via isDestructiveCommand, discovery now matches (documented tightening).
      const d = shouldBlockTool("bash", { command: "echo metachar > /tmp/metachar-phase-out" }, steadyState());
      assert.equal(d.blocked, true, `expected block, got ${JSON.stringify(d)}`);
    });
  });

  test("non-bash tools are untouched by the screen (write in discovery)", async () => {
    await withTempHome(async () => {
      const d = shouldBlockTool("write", { path: "/tmp/metachar-phase-f", content: "x" }, steadyState());
      assert.equal(d.blocked, false, `expected allow, got ${JSON.stringify(d)}`);
    });
  });
});
