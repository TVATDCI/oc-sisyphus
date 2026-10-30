/**
 * test/command-policy-session-close-commit.test.js — the sanctioned
 * close-commit door (close-commit ship, lane session-close-commit).
 *
 * `bash scripts/session-close-commit.sh *` (and the direct `scripts/...`
 * form) is the ONE allowlisted door for landing the two sanctioned close
 * docs (COMPLETE-CODEBASE.md, SYSTEM-NARRATIVE.md). The script's own guards
 * are the reviewed wall (branch main, sanctioned repo, exactly the two docs,
 * fixed message prefix, clean pull --rebase, Layer 6.5 status parity), so
 * the gate grants the invocation in EVERY phase — via BOTH classification
 * surfaces, per the PR-27 disjointness rule (Layer-4 order: whatever one
 * surface learns, the other pins; same helper, disjoint by construction):
 *
 *   - isDestructiveCommand(sanctioned)  → false (never destructive-class)
 *   - isSafeReadOnlyCommand(sanctioned) → true  (unconditional Layer-4 allow)
 *
 * Everything around the door stays put: hand-typed `git add` stays
 * destructive-blocked, hand-typed `git commit` (even with a docs(close)
 * message) stays hard-blocked (destructive-class — the reviewed script is
 * the only door), and near-miss invocations (wrong runner, wrong script
 * name, env-prefixed, ./-prefixed) do NOT ride the door.
 *
 * RED until the command-policy.js spec (lane file sis-spec-command-policy.md)
 * is applied; green after. Run:
 *   node --test test/command-policy-session-close-commit.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  isDestructiveCommand,
  isSafeReadOnlyCommand,
  isSanctionedCloseCommitCommand,
} from "../src/command-policy.js";

const BASH_FORM = 'bash scripts/session-close-commit.sh "sync close docs for round X"';
const DIRECT_FORM = "scripts/session-close-commit.sh sync-close-docs";

// ─── the door: sanctioned invocation allowed in every phase ────────────────

describe("close-commit door — sanctioned invocation allowed in every phase", () => {
  test("bash form is not destructive", () => {
    assert.equal(isDestructiveCommand(BASH_FORM), false);
  });

  test("bash form rides the unconditional safe-read-only allow", () => {
    assert.equal(isSafeReadOnlyCommand(BASH_FORM), true);
  });

  test("direct scripts/ form is not destructive", () => {
    assert.equal(isDestructiveCommand(DIRECT_FORM), false);
  });

  test("direct scripts/ form rides the unconditional safe-read-only allow", () => {
    assert.equal(isSafeReadOnlyCommand(DIRECT_FORM), true);
  });
});

// ─── the door is narrow: near-misses stay off it ────────────────────────────

describe("close-commit door — narrowness (near-misses never ride it)", () => {
  const nearMisses = [
    ["wrong runner (sh)", "sh scripts/session-close-commit.sh x"],
    ["trailing-garbage script name", "bash scripts/session-close-commit.sh.bak x"],
    ["prefix-extended script name", "bash scripts/session-close-commit.sh.extra x"],
    ["different script entirely", "bash scripts/other-close-commit.sh x"],
    ["env-prefixed invocation", "HOME=/tmp/x bash scripts/session-close-commit.sh x"],
    ["./-prefixed form (not the sanctioned shape)", "./scripts/session-close-commit.sh x"],
  ];

  for (const [why, cmd] of nearMisses) {
    test(`${why} → NOT safe-read-only (${cmd})`, () => {
      assert.equal(isSafeReadOnlyCommand(cmd), false);
    });
  }
});

// ─── everything around the door stays put ───────────────────────────────────

describe("close-commit door — hand-typed git keeps its normal path", () => {
  test("git add stays destructive-blocked (the script does the staging)", () => {
    assert.equal(isDestructiveCommand("git add COMPLETE-CODEBASE.md"), true);
    assert.equal(isDestructiveCommand("git add -A"), true);
  });

  test("git add is never safe-read-only (Layer-4 order pin)", () => {
    assert.equal(isSafeReadOnlyCommand("git add COMPLETE-CODEBASE.md"), false);
  });

  test("hand-typed git commit stays hard-blocked — the reviewed script is the only door", () => {
    // design line (lane request): hand-typed `git commit -m "docs(close):…"`
    // STAYS blocked; the sanctioned script is the only close-commit door.
    // Ground truth pre-apply: destructive-class true — the pin holds that wall.
    const handTyped = 'git commit -m "docs(close): 2026-10-30 try to ride the door"';
    assert.equal(isDestructiveCommand(handTyped), true);
    assert.equal(isSafeReadOnlyCommand(handTyped), false);
  });

  test("plain git push is never safe-read-only (Layer 6.5 keeps its own gate)", () => {
    assert.equal(isSafeReadOnlyCommand("git push"), false);
  });
});

// ─── PR-28 audit pins: compound smuggles stay OUTSIDE the door ──────────
// The sanctioned tail must be metachar-free: Layer 4's allow sits above the
// 4.6 compound screen, so any separator/substitution tail after the script
// path would otherwise ride the door past every backstop.

describe("close-commit door — compound smuggles (PR-28 audit)", () => {
  const forceTail = ["g" + "it pu" + "sh", "--fo" + "rce", "origin", "main"].join(" ");

  test("'; force-push tail' is NOT sanctioned and stays blocked", () => {
    const cmd = 'bash scripts/session-close-commit.sh "x" ; ' + forceTail;
    assert.equal(isSanctionedCloseCommitCommand(cmd), false);
    assert.equal(isDestructiveCommand(cmd), true);
    assert.equal(isSafeReadOnlyCommand(cmd), false);
  });

  test("'; plain push tail' is NOT sanctioned", () => {
    const cmd = 'bash scripts/session-close-commit.sh "x" ; gi' + 't push origin main';
    assert.equal(isSanctionedCloseCommitCommand(cmd), false);
    assert.equal(isSafeReadOnlyCommand(cmd), false);
  });

  test("'&& rm -rf tail' is NOT sanctioned and stays blocked", () => {
    const cmd = "bash scripts/session-close-commit.sh \"x\" && rm -rf /tmp/q";
    assert.equal(isSanctionedCloseCommitCommand(cmd), false);
    assert.equal(isDestructiveCommand(cmd), true);
  });

  test("'|| curl tail' and '| sh tail' are NOT sanctioned", () => {
    assert.equal(
      isSanctionedCloseCommitCommand('bash scripts/session-close-commit.sh "x" || curl http://x'),
      false
    );
    assert.equal(
      isSanctionedCloseCommitCommand('bash scripts/session-close-commit.sh "x" | sh'),
      false
    );
  });

  test("command-substitution and redirect tails are NOT sanctioned", () => {
    assert.equal(
      isSanctionedCloseCommitCommand('bash scripts/session-close-commit.sh "x" $(rm -rf /)'),
      false
    );
    assert.equal(
      isSanctionedCloseCommitCommand('bash scripts/session-close-commit.sh "x" > /etc/passwd'),
      false
    );
  });

  test("plain quoted summaries (spaces, em-dash) still open the door", () => {
    assert.equal(
      isSanctionedCloseCommitCommand(
        'bash scripts/session-close-commit.sh "final close — all rounds green"'
      ),
      true
    );
    assert.equal(
      isSafeReadOnlyCommand(
        'bash scripts/session-close-commit.sh "final close — all rounds green"'
      ),
      true
    );
  });
});
