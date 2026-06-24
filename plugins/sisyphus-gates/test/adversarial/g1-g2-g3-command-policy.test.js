/**
 * test/adversarial/g1-g2-g3-command-policy.test.js — P0d adversarial corpus.
 *
 * Ported from remote opencode-config repo. Adapted import paths for our
 * flat src/ structure (no policy/ subdirectory).
 *
 * Bypass payloads from the original audit (G1, G2, G3) that the hardened
 * classifiers in src/command-policy.js and src/sudo-policy.js MUST reject.
 *
 * G1: command substitution, backtick injection, shell wrappers
 * G2: command chaining (&&, ||, ;, |)
 * G3: wildcard state-file access, npx, symlinks, eval/source
 *
 * Each payload gets its own test so a failure names the exact bypass vector.
 *
 * PHASE 1 EXPLORATION NOTE:
 *   These tests are ported BEFORE changing plugin code. Tests that FAIL
 *   identify exactly which security checks our current code is missing.
 *   The failures become the specification for Phase 2 behavioral hardening.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isDestructiveCommand,
  isSafeReadOnlyCommand,
} from "../../src/command-policy.js";
import {
  isAlwaysBlocked,
} from "../../src/sudo-policy.js";

// ─── G1: command substitution, backtick injection, shell wrappers ─────────────

test("G1: echo $(command substitution) → destructive", () => {
  assert.equal(isDestructiveCommand("echo $(rm -rf /tmp/x)"), true);
  assert.equal(isSafeReadOnlyCommand("echo $(rm -rf /tmp/x)"), false);
});

test("G1: `rm (backtick injection) → destructive", () => {
  assert.equal(isDestructiveCommand("`rm -rf /tmp`"), true);
  assert.equal(isSafeReadOnlyCommand("`rm -rf /tmp`"), false);
});

test("G1: bash -c wrapper → destructive", () => {
  assert.equal(isDestructiveCommand("bash -c 'rm -rf /tmp/x'"), true);
  assert.equal(isSafeReadOnlyCommand("bash -c 'rm -rf /tmp/x'"), false);
});

test("G1: sh -c wrapper → destructive", () => {
  assert.equal(isDestructiveCommand("sh -c 'rm -rf /tmp/x'"), true);
  assert.equal(isSafeReadOnlyCommand("sh -c 'rm -rf /tmp/x'"), false);
});

// ─── G2: command chaining (&&, ||, ;, |) ────────────────────────────────────

test("G2: ls && rm -rf /tmp (control-flow AND) → destructive", () => {
  assert.equal(isDestructiveCommand("ls && rm -rf /tmp"), true);
  assert.equal(isSafeReadOnlyCommand("ls && rm -rf /tmp"), false);
});

test("G2: ls || rm -rf /tmp (control-flow OR) → destructive", () => {
  assert.equal(isDestructiveCommand("ls || rm -rf /tmp"), true);
  assert.equal(isSafeReadOnlyCommand("ls || rm -rf /tmp"), false);
});

test("G2: ls ; rm -rf /tmp (semicolon chain) → destructive", () => {
  assert.equal(isDestructiveCommand("ls ; rm -rf /tmp"), true);
  assert.equal(isSafeReadOnlyCommand("ls ; rm -rf /tmp"), false);
});

test("G2: ls | rm -rf /tmp (pipe chain) → destructive", () => {
  assert.equal(isDestructiveCommand("ls | rm -rf /tmp"), true);
  assert.equal(isSafeReadOnlyCommand("ls | rm -rf /tmp"), false);
});

// ─── G3: wildcard state-file access, npx, symlinks, eval/source ────────────

test("G3: cp .*state.json (wildcard copy state file) → blocked by fail-closed + Layer 0", () => {
  // Not always-destructive (cp is legitimate in execution phase). Caught by
  // Layer 0 trust-root path denylist + fail-closed blocking non-safe commands.
  assert.equal(isSafeReadOnlyCommand("cp .*state.json /tmp/backup"), false);
});

test("G3: mv .*state.json (wildcard move state file) → blocked by fail-closed + Layer 0", () => {
  assert.equal(isSafeReadOnlyCommand("mv .*state.json /tmp/backup"), false);
});

test("G3: npx -y evil-pkg (arbitrary package run) → destructive", () => {
  assert.equal(isDestructiveCommand("npx -y evil-pkg"), true);
  assert.equal(isSafeReadOnlyCommand("npx -y evil-pkg"), false);
});

test("G3: ln -s .sisyphus (symlink to trust-root) → blocked by fail-closed + Layer 0", () => {
  assert.equal(isSafeReadOnlyCommand("ln -s .sisyphus /tmp/link"), false);
});

test("G3: cp -l (hard-link copy to trust-root) → blocked by fail-closed + Layer 0", () => {
  assert.equal(isSafeReadOnlyCommand("cp -l .sisyphus /tmp/link"), false);
});

test("G3: chmod 777 . (recursive permission change) → blocked by fail-closed", () => {
  assert.equal(isSafeReadOnlyCommand("chmod 777 ."), false);
});

test("G3: eval 'rm ...' (eval execution) → destructive", () => {
  assert.equal(isDestructiveCommand("eval 'rm -rf /tmp'"), true);
  assert.equal(isSafeReadOnlyCommand("eval 'rm -rf /tmp'"), false);
});

test("G3: . /tmp/evil.sh (dot/source execution) → destructive", () => {
  assert.equal(isDestructiveCommand(". /tmp/evil.sh"), true);
  assert.equal(isSafeReadOnlyCommand(". /tmp/evil.sh"), false);
});

test("G3: source /tmp/evil.sh (source execution) → destructive", () => {
  assert.equal(isDestructiveCommand("source /tmp/evil.sh"), true);
  assert.equal(isSafeReadOnlyCommand("source /tmp/evil.sh"), false);
});

// ─── Sudo: any command with sudo prefix ────────────────────────────────────

test("G3: sudo ls (sudo prefix) → destructive", () => {
  assert.equal(isDestructiveCommand("sudo ls /tmp"), true);
  assert.equal(isSafeReadOnlyCommand("sudo ls /tmp"), false);
});

// ─── Catastrophic: always blocked in ALL phases ────────────────────────────

test("CATASTROPHIC: rm -rf / (root wipe) → always blocked", () => {
  assert.equal(isAlwaysBlocked("rm -rf /"), true);
  assert.equal(isDestructiveCommand("rm -rf /"), true);
  assert.equal(isSafeReadOnlyCommand("rm -rf /"), false);
});

test("CATASTROPHIC: dd if=/dev/zero of=/ (disk wipe) → always blocked", () => {
  assert.equal(isAlwaysBlocked("dd if=/dev/zero of=/"), true);
  assert.equal(isDestructiveCommand("dd if=/dev/zero of=/"), true);
  assert.equal(isSafeReadOnlyCommand("dd if=/dev/zero of=/"), false);
});

test("CATASTROPHIC: mkfs.ext4 /dev/sda (filesystem format) → always blocked", () => {
  assert.equal(isAlwaysBlocked("mkfs.ext4 /dev/sda"), true);
  assert.equal(isSafeReadOnlyCommand("mkfs.ext4 /dev/sda"), false);
});

// ─── Positive: safe read-only commands must NOT be flagged ─────────────────

test("REG: ls -la → safe read-only", () => {
  assert.equal(isSafeReadOnlyCommand("ls -la"), true);
  assert.equal(isDestructiveCommand("ls -la"), false);
  assert.equal(isAlwaysBlocked("ls -la"), false);
});

test("REG: cat file.txt → safe read-only", () => {
  assert.equal(isSafeReadOnlyCommand("cat file.txt"), true);
  assert.equal(isDestructiveCommand("cat file.txt"), false);
  assert.equal(isAlwaysBlocked("cat file.txt"), false);
});

test("REG: git status → safe read-only", () => {
  assert.equal(isSafeReadOnlyCommand("git status"), true);
  assert.equal(isDestructiveCommand("git status"), false);
  assert.equal(isAlwaysBlocked("git status"), false);
});

test("REG: git log --oneline → safe read-only", () => {
  assert.equal(isSafeReadOnlyCommand("git log --oneline"), true);
  assert.equal(isDestructiveCommand("git log --oneline"), false);
  assert.equal(isAlwaysBlocked("git log --oneline"), false);
});

test("REG: echo hello → safe read-only", () => {
  assert.equal(isSafeReadOnlyCommand("echo hello"), true);
  assert.equal(isDestructiveCommand("echo hello"), false);
  assert.equal(isAlwaysBlocked("echo hello"), false);
});

test("REG: find . -name '*.js' → safe read-only", () => {
  assert.equal(isSafeReadOnlyCommand("find . -name '*.js'"), true);
  assert.equal(isDestructiveCommand("find . -name '*.js'"), false);
  assert.equal(isAlwaysBlocked("find . -name '*.js'"), false);
});

test("REG: grep -r 'pattern' . → safe read-only", () => {
  assert.equal(isSafeReadOnlyCommand("grep -r 'pattern' ."), true);
  assert.equal(isDestructiveCommand("grep -r 'pattern' ."), false);
  assert.equal(isAlwaysBlocked("grep -r 'pattern' ."), false);
});
