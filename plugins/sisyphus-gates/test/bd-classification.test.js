/**
 * test/bd-classification.test.js — SUBCOMMAND_BD phase-agnostic classification.
 *
 * Finding A fix (2026-07-25, Oracle ses_0656dc708ffeOMNXBtw0kJm9Wh): create /
 * update / stale / orphans / lint / preflight moved from destructive → safe so
 * AGENTS.md's "bd for ALL tracking" mandate doesn't collide with Layer 6
 * destructive-blocks outside execution phases.
 *
 * Run: `npm test` or `node --test test/bd-classification.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { shouldBlockTool, shouldBlockCommand } from "../src/gates.js";

describe("SUBCOMMAND_BD phase-agnostic classification (Finding A)", () => {
  const failClosedState = { stateFileExists: false };
  const execState = {
    stateFileExists: true,
    planApproved: true,
    evidenceLogged: true,
    approvalStatus: "approved",
  };

  test("bd create allowed in fail-closed state (Layer 4 short-circuit)", () => {
    const result = shouldBlockTool("bash", { command: "bd create --title=x" }, failClosedState);
    assert.equal(result.blocked, false);
  });

  test("bd create allowed in execution state", () => {
    const result = shouldBlockTool("bash", { command: "bd create --title=x" }, execState);
    assert.equal(result.blocked, false);
  });

  test("bd update allowed in fail-closed state", () => {
    const result = shouldBlockTool("bash", { command: "bd update abc123 --claim" }, failClosedState);
    assert.equal(result.blocked, false);
  });

  test("bd read-only queries allowed in fail-closed state", () => {
    for (const sub of ["stale", "orphans", "lint", "preflight"]) {
      const result = shouldBlockTool("bash", { command: `bd ${sub}` }, failClosedState);
      assert.equal(result.blocked, false, `bd ${sub} should be allowed`);
    }
  });

  test("bd forget still blocked in fail-closed state", () => {
    const result = shouldBlockTool("bash", { command: "bd forget some-key" }, failClosedState);
    assert.equal(result.blocked, true);
  });

  test("bd close still blocked when evidence not logged", () => {
    const state = {
      stateFileExists: true,
      planApproved: true,
      evidenceLogged: false,
      approvalStatus: "approved",
    };
    const result = shouldBlockCommand("bd close", [], state);
    assert.equal(result.blocked, true);
  });

  test("bd dolt push still blocked when session-close open", () => {
    const state = {
      stateFileExists: true,
      planApproved: true,
      evidenceLogged: true,
      approvalStatus: "approved",
      session_close: { status: "open" },
    };
    const result = shouldBlockCommand("bd dolt push", [], state);
    assert.equal(result.blocked, true);
  });

  test("bd edit still blocked in fail-closed state", () => {
    const result = shouldBlockTool("bash", { command: "bd edit abc123" }, failClosedState);
    assert.equal(result.blocked, true);
  });
});
