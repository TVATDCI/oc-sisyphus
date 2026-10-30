/**
 * test/command-policy-pre-output-tokens.test.js — dangerous-token screen
 * extension (brain-rgyi, captain-ruled follow-up to the PR-26 allowlist).
 *
 * The dialog-reduction allowlist makes `rg *` and `git diff/log/show *`
 * no-ask at the opencode layer. Two metachar-free vectors rode along:
 *   - `rg --pre=<cmd>` executes a command per searched file (exec primitive)
 *   - `git diff/log/show --output=<file>` and GNU `diff --output=` write
 *     formatted output to arbitrary paths (write primitive)
 * Both are destructive-class now: hard-blocked for every seat, every phase,
 * at the gate (the opencode layer allows the base commands, so the gate is
 * the only wall left).
 *
 * House style per test/command-policy.test.js (W1.C). Run:
 *   node --test test/command-policy-pre-output-tokens.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { isDestructiveCommand } from "../src/command-policy.js";

// ─── --pre: rg preprocessor exec primitive ─────────────────────────────────

describe("token screen — --pre (assignment, space, bare, position-independent)", () => {
  test("rg --pre touch … → destructive (space form)", () => {
    assert.equal(isDestructiveCommand("rg --pre touch needle /tmp/f.txt"), true);
  });

  test("rg --pre=touch … → destructive (assignment form)", () => {
    assert.equal(isDestructiveCommand("rg --pre=touch needle /tmp/f.txt"), true);
  });

  test("rg --pre 'sh -c …' … → destructive (quoted command)", () => {
    assert.equal(
      isDestructiveCommand("rg --pre 'sh -c \"rm -rf /\"' needle /tmp/f.txt"),
      true
    );
  });

  test("FOO=bar rg --pre cmd … → destructive (env prefix, position-independent)", () => {
    assert.equal(isDestructiveCommand("FOO=bar rg --pre cmd /tmp/f.txt"), true);
  });

  test("rg --pre (bare trailing) → destructive", () => {
    assert.equal(isDestructiveCommand("rg --pre"), true);
  });
});

// ─── --output: git/diff formatted-write primitive ──────────────────────────

describe("token screen — --output (assignment, space, bare, across tools)", () => {
  test("git diff --output=/tmp/x → destructive", () => {
    assert.equal(isDestructiveCommand("git diff --output=/tmp/x"), true);
  });

  test("git log --output /tmp/x → destructive (space form)", () => {
    assert.equal(isDestructiveCommand("git log --output /tmp/x"), true);
  });

  test("git show --output=x HEAD → destructive", () => {
    assert.equal(isDestructiveCommand("git show --output=x HEAD"), true);
  });

  test("diff --output=/tmp/x a b → destructive (GNU diff, also allowlisted)", () => {
    assert.equal(isDestructiveCommand("diff --output=/tmp/x a b"), true);
  });

  test("git diff --output (bare trailing) → destructive", () => {
    assert.equal(isDestructiveCommand("git diff --output"), true);
  });
});

// ─── near-misses: real flags that must NOT match ───────────────────────────

describe("token screen — near-miss collisions stay clean", () => {
  test("rg --pretty pattern f → not destructive", () => {
    assert.equal(isDestructiveCommand("rg --pretty pattern /tmp/f.txt"), false);
  });

  test("rg --regexp pattern f → not destructive", () => {
    assert.equal(isDestructiveCommand("rg --regexp pattern /tmp/f.txt"), false);
  });

  test("git diff --output-indicator-new=+ HEAD → not destructive", () => {
    assert.equal(
      isDestructiveCommand("git diff --output-indicator-new=+ HEAD"),
      false
    );
  });

  test("jq --raw-output .a f → not destructive (no --output substring)", () => {
    assert.equal(isDestructiveCommand("jq --raw-output .a /tmp/f.json"), false);
  });

  test("npm view --prefix /x pkg → not destructive", () => {
    assert.equal(isDestructiveCommand("npm view --prefix /x pkg"), false);
  });
});

// ─── regression pins: the PR-26 allowlist keeps working ────────────────────

describe("token screen — plain allowlisted forms stay clean", () => {
  test("git diff HEAD~1 → not destructive", () => {
    assert.equal(isDestructiveCommand("git diff HEAD~1"), false);
  });

  test("git log --oneline -10 → not destructive", () => {
    assert.equal(isDestructiveCommand("git log --oneline -10"), false);
  });

  test("git show HEAD → not destructive", () => {
    assert.equal(isDestructiveCommand("git show HEAD"), false);
  });

  test("rg pattern f → not destructive", () => {
    assert.equal(isDestructiveCommand("rg pattern /tmp/f.txt"), false);
  });

  test("diff a b → not destructive", () => {
    assert.equal(isDestructiveCommand("diff a b"), false);
  });

  test("git status → not destructive", () => {
    assert.equal(isDestructiveCommand("git status"), false);
  });
});

// ─── phase-independence pin ────────────────────────────────────────────────

describe("token screen — phase independence", () => {
  // isDestructiveCommand takes no phase argument: the classification is
  // structural, and Layer 6 consumes it identically in every phase. The pin:
  // the same command classifies destructive regardless of when it is seen.
  test("vector commands classify destructive with no phase input", () => {
    assert.equal(isDestructiveCommand("rg --pre touch needle /tmp/f.txt"), true);
    assert.equal(isDestructiveCommand("git diff --output=/tmp/x"), true);
  });
});
