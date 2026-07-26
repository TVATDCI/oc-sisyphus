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
import { shouldBlockTool, shouldBlockCommand, isDestructiveCommand } from "../src/gates.js";

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

describe("SUBCOMMAND_BD destructive enumeration (brain-hxm)", () => {
  // brain-hxm (P0, Oracle ses_05fa90ad2ffe25lDSMkB0WImbE): inverted-default hole.
  // These subs mutate/destroy bd state but were missing from the destructive
  // enumeration. Layer 6 (execution phase) only blocks isDestructiveCommand()
  // hits — so in execution state these slipped through entirely.
  //
  // We test isDestructiveCommand directly because it is the source of truth
  // for the destructive classification. Full-pipeline shouldBlockTool tests
  // would be tautological here: in the test env, getCachedWorkflowConfig()
  // returns null, so Layer 5 blocks all non-safe bash regardless of Layer 6,
  // masking whether the destructive classifier itself was fixed.
  //
  // 11 subs added to SUBCOMMAND_BD.destructive. admin/hooks are top-level
  // covers: `admin` covers reset/wipe/etc., `hooks` covers install/uninstall.
  const destructiveSubs = [
    "delete", "sql", "prune", "purge", "gc",
    "compact", "flatten", "batch", "import", "admin", "hooks",
  ];

  for (const sub of destructiveSubs) {
    test(`bd ${sub} classified destructive by isDestructiveCommand`, () => {
      assert.equal(isDestructiveCommand(`bd ${sub} arg`), true);
    });
  }

  // Headline vectors from the bead — explicit named tests for grep-ability.
  test("bd sql 'DELETE FROM memories' destructive (bypass-forget vector)", () => {
    assert.equal(isDestructiveCommand("bd sql 'DELETE FROM memories'"), true);
  });

  test("bd hooks install destructive (persistence vector)", () => {
    assert.equal(isDestructiveCommand("bd hooks install"), true);
  });

  test("bd admin reset destructive (wipe vector)", () => {
    assert.equal(isDestructiveCommand("bd admin reset"), true);
  });

  // Regression guard: existing safe subs must NOT be over-classified.
  const safeSubs = ["create", "update", "ready", "list", "show", "memories", "remember"];
  for (const sub of safeSubs) {
    test(`bd ${sub} NOT destructive (regression guard)`, () => {
      assert.equal(isDestructiveCommand(`bd ${sub} arg`), false);
    });
  }
});
