/**
 * test/adversarial/sandbox-bypass.test.js — security regression tests
 *
 * Adversarial (red-team) tests attempting to bypass Layer 3.7 sandbox
 * containment. Each test represents a known attack class; a failure means
 * a defense has regressed and is a BLOCKER for the sandbox feature.
 *
 * Slice B (brain-99x): symlink + path-traversal escape attacks.
 *
 * These tests intentionally duplicate some coverage from the main
 * sandbox-policy.test.js file — duplication here is a feature, not a bug:
 * if the unit tests are accidentally weakened or deleted, the adversarial
 * tests still catch the regression.
 *
 * Layer 0 (trust-root paths) is the primary defense for ~/.sisyphus/* and
 * plugin source. Layer 3.7 (sandbox) is the secondary relaxation layer
 * and must NOT grant any privilege to paths outside sandbox_paths prefixes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSandboxPath, isSandboxCommand } from "../../src/sandbox-policy.js";

function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function cleanup(...paths) {
  for (const p of paths) {
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

// ─── ADV-1: Direct symlink escape ─────────────────────────────────────────

test("ADV-1: symlink inside sandbox pointing to outside path does NOT grant sandbox privileges", () => {
  // Attacker scenario: agent has somehow created /tmp/sandbox/.escape
  // pointing to ~/.config/opencode (prod path). Intent: trick isSandboxPath
  // into thinking the prod path is sandboxed.
  const sandbox = makeTempDir("adv1-sandbox-");
  const outsideTarget = makeTempDir("adv1-outside-");
  const escapeLink = join(sandbox, ".escape-to-prod");
  try {
    symlinkSync(outsideTarget, escapeLink);
    const result = isSandboxPath(escapeLink, [sandbox + "/"]);
    assert.equal(
      result,
      null,
      "symlink escape must fail — realpath must resolve to outsideTarget, " +
        "which is NOT under sandbox prefix"
    );
  } finally {
    cleanup(sandbox, outsideTarget);
  }
});

// ─── ADV-2: Chained symlink escape (A → B → outside) ──────────────────────

test("ADV-2: chained symlinks cannot bypass realpath resolution", () => {
  // Attacker scenario: create /tmp/sandbox/link1 → /tmp/sandbox/link2,
  // /tmp/sandbox/link2 → /etc (or any outside path). Naive `lstat` or
  // string-prefix checks would miss this; realpath() follows the full chain.
  const sandbox = makeTempDir("adv2-sandbox-");
  const outsideTarget = makeTempDir("adv2-outside-");
  const link2 = join(sandbox, "link2");
  const link1 = join(sandbox, "link1");
  try {
    symlinkSync(outsideTarget, link2);
    symlinkSync(link2, link1);
    const result = isSandboxPath(link1, [sandbox + "/"]);
    assert.equal(
      result,
      null,
      "chained symlinks must be resolved by realpath — escape detected"
    );
  } finally {
    cleanup(sandbox, outsideTarget);
  }
});

// ─── ADV-3: Relative path traversal in cwd ────────────────────────────────

test("ADV-3: cwd with ../ traversal does NOT escape via string tricks", () => {
  // Attacker scenario: cwd = /tmp/sandbox/../../../etc
  // Naive startsWith("/tmp/sandbox/") would say TRUE (string starts with prefix).
  // canonicalize uses resolve() which collapses .. BEFORE the prefix match.
  // Real resolved path is /etc, which does NOT match /tmp/sandbox/.
  const sandbox = makeTempDir("adv3-sandbox-");
  try {
    const traversalPath = sandbox + "/../../../etc";
    const result = isSandboxPath(traversalPath, [sandbox + "/"]);
    assert.equal(
      result,
      null,
      "relative path traversal must be resolved by canonicalize.resolve() — " +
        "the resolved /etc path does not match the sandbox prefix"
    );
  } finally {
    cleanup(sandbox);
  }
});

// ─── ADV-4: Hidden symlink masquerading as legitimate ─────────────────────

test("ADV-4: hidden symlink (.something) inside sandbox is still subject to realpath check", () => {
  // Attacker scenario: name the escape symlink with a hidden prefix to
  // evade naive "is the path hidden?" filters. realpath doesn't care
  // about naming conventions.
  const sandbox = makeTempDir("adv4-sandbox-");
  const outsideTarget = makeTempDir("adv4-outside-");
  const hiddenEscape = join(sandbox, ".cache");
  try {
    symlinkSync(outsideTarget, hiddenEscape);
    const result = isSandboxPath(hiddenEscape, [sandbox + "/"]);
    assert.equal(
      result,
      null,
      "hidden-name symlink must still be subject to realpath check"
    );
  } finally {
    cleanup(sandbox, outsideTarget);
  }
});

// ─── ADV-5: Symlink to a sandbox-protected path (e.g. ~/.sisyphus) ────────

test("ADV-5: symlink to a trust-root path does NOT grant trust-root privileges via sandbox", () => {
  // Attacker scenario: create /tmp/sandbox/.sneaky → ~/.sisyphus
  // (or any fake target pretending to be a trust-root path).
  // Goal: verify Layer 3.7 doesn't ACCIDENTALLY grant sandbox privileges
  // to a symlinked outside path. (Layer 0 separately protects the actual
  // trust-root path; this test just verifies sandbox doesn't compound.)
  const sandbox = makeTempDir("adv5-sandbox-");
  const fakeTrustRoot = makeTempDir("adv5-fake-trust-");
  const sneakyLink = join(sandbox, ".sneaky-to-sisyphus");
  try {
    symlinkSync(fakeTrustRoot, sneakyLink);
    const result = isSandboxPath(sneakyLink, [sandbox + "/"]);
    assert.equal(
      result,
      null,
      "symlink to outside path must not grant sandbox privileges even if " +
        "the target pretends to be a trust-root path"
    );
  } finally {
    cleanup(sandbox, fakeTrustRoot);
  }
});

// ─── ADV-6: Legitimate in-sandbox symlink still works (negative test) ─────

test("ADV-6 (negative): legitimate in-sandbox symlink still matches (defense doesn't over-block)", () => {
  // Sanity check: the symlink defense is targeted at ESCAPE, not at all symlinks.
  // A symlink whose target is genuinely inside the sandbox should still match.
  const sandbox = makeTempDir("adv6-sandbox-");
  const realTarget = join(sandbox, "real-subdir");
  const legitLink = join(sandbox, "link-to-real");
  try {
    mkdirSync(realTarget);
    symlinkSync(realTarget, legitLink);
    const result = isSandboxPath(legitLink, [sandbox + "/"]);
    assert.notEqual(
      result,
      null,
      "legitimate in-sandbox symlink should match — defense must not over-block"
    );
    assert.equal(result.matchedSandboxPath, sandbox + "/");
  } finally {
    cleanup(sandbox);
  }
});


// ─── Slice C: Command-injection adversarial tests ─────────────────────

test("ADV-7: regex injection via .* entry must not match everything", () => {
  assert.equal(isSandboxCommand("evil-command", [".*"]), null);
  assert.notEqual(isSandboxCommand(".*", [".*"]), null);
});

test("ADV-8: unescaped ( would throw — escapeRegExp prevents", () => {
  assert.notEqual(isSandboxCommand("(test)", ["(test)"]), null);
});

test("ADV-9: unescaped [ would throw — escapeRegExp prevents", () => {
  assert.notEqual(isSandboxCommand("[test]", ["[test]"]), null);
});

test("ADV-10: ReDoS resistance — many spaces between tokens", () => {
  const s = "npm" + " ".repeat(100) + "install";
  assert.notEqual(isSandboxCommand(s, ["npm install"]), null);
});
