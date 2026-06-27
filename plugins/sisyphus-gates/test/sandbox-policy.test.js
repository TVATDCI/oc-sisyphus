/**
 * test/sandbox-policy.test.js — unit tests for src/sandbox-policy.js
 *
 * Slice A (brain-vi1): Config plumbing — loadSandboxConfig validation.
 * Covers AC-3.7, AC-3.8, AC-3.9 from PRD sandbox-allowlist.
 *
 * Layer 3.7 sandbox relaxation is opt-in via opencode.json plugin config:
 *   {
 *     "sandbox_paths": ["/tmp/"],
 *     "sandbox_allowed_commands": ["npm install", ...]
 *   }
 *
 * Validation rules (PRD Decision D6):
 *   - Missing sandbox_paths key   → feature disabled (byte-identical to v0.2.0)
 *   - Empty sandbox_paths array   → feature disabled (byte-identical to v0.2.0)
 *   - sandbox_paths entry without trailing "/" → reject entire config (feature disabled)
 *   - sandbox_allowed_commands missing → treated as empty array
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSandboxConfig } from "../src/sandbox-policy.js";

// ─── AC-3.8: Missing sandbox_paths key produces byte-identical behavior ────

test("AC-3.8: loadSandboxConfig({}) returns empty config (feature disabled)", () => {
  const result = loadSandboxConfig({});
  assert.notEqual(result, null, "should return an object, not null");
  assert.deepEqual(result, {
    sandboxPaths: [],
    sandboxAllowedCommands: [],
  });
});

test("AC-3.8: loadSandboxConfig(undefined) returns empty config", () => {
  const result = loadSandboxConfig(undefined);
  assert.notEqual(result, null);
  assert.deepEqual(result, {
    sandboxPaths: [],
    sandboxAllowedCommands: [],
  });
});

test("AC-3.8: loadSandboxConfig(null) returns empty config", () => {
  const result = loadSandboxConfig(null);
  assert.notEqual(result, null);
  assert.deepEqual(result, {
    sandboxPaths: [],
    sandboxAllowedCommands: [],
  });
});

// ─── AC-3.7: Empty sandbox_paths produces byte-identical behavior ──────────

test("AC-3.7: loadSandboxConfig({sandbox_paths: []}) returns empty paths", () => {
  const result = loadSandboxConfig({ sandbox_paths: [] });
  assert.deepEqual(result, {
    sandboxPaths: [],
    sandboxAllowedCommands: [],
  });
});

test("AC-3.7: empty sandbox_paths + populated allowed_commands returns empty paths only", () => {
  // Even with allowed commands, empty paths means feature disabled.
  // We still return the object (not null) so callers can distinguish
  // "explicitly empty" from "validation failure".
  const result = loadSandboxConfig({
    sandbox_paths: [],
    sandbox_allowed_commands: ["npm install"],
  });
  assert.deepEqual(result, {
    sandboxPaths: [],
    sandboxAllowedCommands: ["npm install"],
  });
});

// ─── AC-3.9: Malformed sandbox_paths (no trailing slash) rejected ─────────

test("AC-3.9: loadSandboxConfig({sandbox_paths: ['/tmp']}) returns null (no trailing slash)", () => {
  // Per D6: any entry without trailing "/" → reject ENTIRE config.
  // This prevents /tmp from matching /tmp-eslint-cache, /tmpfoo, etc.
  const result = loadSandboxConfig({ sandbox_paths: ["/tmp"] });
  assert.equal(result, null, "must reject entire config when any path lacks trailing /");
});

test("AC-3.9: mix of valid and invalid entries → entire config rejected (null)", () => {
  const result = loadSandboxConfig({
    sandbox_paths: ["/tmp/", "/var"], // second entry lacks trailing /
  });
  assert.equal(result, null);
});

test("AC-3.9: empty string entry → rejected (no trailing slash)", () => {
  const result = loadSandboxConfig({
    sandbox_paths: [""],
  });
  assert.equal(result, null);
});

// ─── Happy path: valid config returns populated object ────────────────────

test("happy path: valid config returns populated object", () => {
  const result = loadSandboxConfig({
    sandbox_paths: ["/tmp/", "/var/tmp/"],
    sandbox_allowed_commands: ["npm install", "npm test", "tsc --noEmit"],
  });
  assert.deepEqual(result, {
    sandboxPaths: ["/tmp/", "/var/tmp/"],
    sandboxAllowedCommands: ["npm install", "npm test", "tsc --noEmit"],
  });
});

test("happy path: sandbox_paths set but sandbox_allowed_commands missing → empty allowed commands", () => {
  const result = loadSandboxConfig({
    sandbox_paths: ["/tmp/"],
  });
  assert.deepEqual(result, {
    sandboxPaths: ["/tmp/"],
    sandboxAllowedCommands: [],
  });
});

// ─── Type robustness ──────────────────────────────────────────────────────

test("non-array sandbox_paths → null (validation failure)", () => {
  assert.equal(loadSandboxConfig({ sandbox_paths: "/tmp/" }), null);
  assert.equal(loadSandboxConfig({ sandbox_paths: 42 }), null);
  assert.equal(loadSandboxConfig({ sandbox_paths: { 0: "/tmp/" } }), null);
});

test("non-string entry in sandbox_paths → null (validation failure)", () => {
  assert.equal(loadSandboxConfig({ sandbox_paths: ["/tmp/", 42] }), null);
  assert.equal(loadSandboxConfig({ sandbox_paths: [null] }), null);
  assert.equal(loadSandboxConfig({ sandbox_paths: ["/tmp/", { evil: true }] }), null);
});

test("non-array sandbox_allowed_commands → null (validation failure)", () => {
  assert.equal(
    loadSandboxConfig({ sandbox_paths: ["/tmp/"], sandbox_allowed_commands: "npm install" }),
    null
  );
});

test("non-string entry in sandbox_allowed_commands → null (validation failure)", () => {
  assert.equal(
    loadSandboxConfig({ sandbox_paths: ["/tmp/"], sandbox_allowed_commands: ["npm install", 42] }),
    null
  );
});
