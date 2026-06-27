/**
 * test/trust-root-paths-opencode-json.test.js — Slice G (brain-2ah)
 *
 * Verifies that opencode.json (the plugin config file) is protected from
 * gated writes but NOT from gated reads.
 *
 * Why: opencode.json configures sandbox_paths itself. If an agent could
 * rewrite it, the agent could widen its own sandbox. Slice G adds the
 * file to TRUST_ROOT_WRITE_PATTERNS to prevent this. Operators edit
 * opencode.json from their terminal (outside opencode), unchanged.
 *
 * Covers AC-3.16 (write blocked) and AC-3.17 (read NOT blocked).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchTrustRootWrite,
  matchTrustRootRead,
} from "../src/trust-root-paths.js";

// ─── AC-3.16: opencode.json write is blocked ──────────────────────────────

test("AC-3.16: matchTrustRootWrite blocks write to canonical opencode.json via filePath", () => {
  const result = matchTrustRootWrite({
    filePath: "/home/vladi/.config/opencode/opencode.json",
  });
  assert.notEqual(result, null, "must return matched path (blocked)");
  assert.equal(
    result.includes("opencode.json"),
    true,
    "matched canonical path should contain opencode.json"
  );
});

test("AC-3.16: matchTrustRootWrite blocks write via 'path' arg key", () => {
  const result = matchTrustRootWrite({
    path: "/home/vladi/.config/opencode/opencode.json",
  });
  assert.notEqual(result, null);
});

test("AC-3.16: matchTrustRootWrite blocks write via 'file_path' arg key", () => {
  const result = matchTrustRootWrite({
    file_path: "/home/vladi/.config/opencode/opencode.json",
  });
  assert.notEqual(result, null);
});

test("AC-3.16: pattern matches any opencode.json (project-local too)", () => {
  // The regex is [/opencode\.json$/i, ...] — matches any path ending in opencode.json.
  // This is intentional: a project-local opencode.json could also widen the sandbox.
  const result = matchTrustRootWrite({
    filePath: "/some/project/subdir/opencode.json",
  });
  assert.notEqual(result, null);
});

test("AC-3.16: pattern does NOT match opencode.json.backup (extension differs)", () => {
  const result = matchTrustRootWrite({
    filePath: "/home/vladi/.config/opencode/opencode.json.backup",
  });
  assert.equal(result, null, "must not match .json.backup (anchored to .json$)");
});

test("AC-3.16: pattern does NOT match opencode-json.txt (different filename)", () => {
  const result = matchTrustRootWrite({
    filePath: "/home/vladi/.config/opencode/opencode-json.txt",
  });
  assert.equal(result, null);
});

test("AC-3.16: pattern is case-insensitive (OPENCODE.JSON also blocked)", () => {
  const result = matchTrustRootWrite({
    filePath: "/home/vladi/.config/opencode/OPENCODE.JSON",
  });
  assert.notEqual(result, null);
});

// ─── AC-3.17: opencode.json read is NOT blocked ───────────────────────────

test("AC-3.17: matchTrustRootRead does NOT block read of opencode.json", () => {
  // Read protection is NOT added — operators and diagnostic tools must
  // still be able to inspect the config. Only writes are blocked.
  const result = matchTrustRootRead({
    filePath: "/home/vladi/.config/opencode/opencode.json",
  });
  assert.equal(result, null, "must NOT block reads of opencode.json");
});

test("AC-3.17: matchTrustRootRead with 'path' arg key also does NOT block opencode.json", () => {
  const result = matchTrustRootRead({
    path: "/home/vladi/.config/opencode/opencode.json",
  });
  assert.equal(result, null);
});

// ─── Regression: existing trust-root patterns still work ──────────────────

test("regression: state.json write is still blocked", () => {
  const result = matchTrustRootWrite({
    filePath: "/home/vladi/.sisyphus/state.json",
  });
  assert.notEqual(result, null);
});

test("regression: workflow.yaml write is still blocked", () => {
  const result = matchTrustRootWrite({
    filePath: "/home/vladi/.sisyphus/workflow.yaml",
  });
  assert.notEqual(result, null);
});

test("regression: PRD verdict file write is still blocked", () => {
  const result = matchTrustRootWrite({
    filePath: "/home/vladi/.sisyphus/notepads/cli/momus-prd-review-2026-06-27T12-04-01-558Z.md",
  });
  assert.notEqual(result, null);
});

test("regression: plan verdict file write is still blocked", () => {
  const result = matchTrustRootWrite({
    filePath: "/home/vladi/.sisyphus/notepads/cli/momus-plan-review-2026-06-27T13-57-58-349Z.md",
  });
  assert.notEqual(result, null);
});

// ─── Non-target paths are unaffected ──────────────────────────────────────

test("regression: arbitrary non-protected path is NOT blocked for write", () => {
  const result = matchTrustRootWrite({
    filePath: "/tmp/some-random-file.txt",
  });
  assert.equal(result, null);
});

test("regression: arbitrary non-protected path is NOT blocked for read", () => {
  const result = matchTrustRootRead({
    filePath: "/tmp/some-random-file.txt",
  });
  assert.equal(result, null);
});
