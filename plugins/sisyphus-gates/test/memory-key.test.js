/**
 * test/memory-key.test.js — tests for src/memory-key.js (P0b Step 1).
 *
 * Verifies the 6 spec criteria plus defensive edge cases for the security
 * invariants (never throws, handles null/undefined options, guards against
 * bare "!").
 *
 * Note on "Mock execSync" (spec test column): these tests use REAL commands
 * (`echo`, `nonexistent-command-xyz`) rather than mocking execSync. The
 * spec's test cases are all portable — `echo` exists on every platform
 * opencode targets, and the nonexistent-command case throws deterministically.
 * Real execution is simpler and more reliable than mocking for these cases.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMemoryKey } from "../src/memory-key.js";

// ─── Spec criteria (6) ──────────────────────────────────────────────────────

test("resolveMemoryKey: '!echo testkey123' → 'testkey123'", () => {
  const key = resolveMemoryKey({ verdict_key_command: "!echo testkey123" });
  assert.equal(key, "testkey123");
});

test("resolveMemoryKey: 'echo testkey123' (no ! prefix) → 'testkey123'", () => {
  const key = resolveMemoryKey({ verdict_key_command: "echo testkey123" });
  assert.equal(key, "testkey123");
});

test("resolveMemoryKey: {} (no command) → null", () => {
  const key = resolveMemoryKey({});
  assert.equal(key, null);
});

test("resolveMemoryKey: '!nonexistent-command-xyz' → null (command fails)", () => {
  const key = resolveMemoryKey({ verdict_key_command: "!nonexistent-command-xyz" });
  assert.equal(key, null);
});

test("resolveMemoryKey: '!echo ' → null (empty output after trim)", () => {
  const key = resolveMemoryKey({ verdict_key_command: "!echo " });
  assert.equal(key, null);
});

test("resolveMemoryKey: verdict_key_command: 123 → null (not a string)", () => {
  const key = resolveMemoryKey({ verdict_key_command: 123 });
  assert.equal(key, null);
});

// ─── Defensive edge cases (security invariants) ─────────────────────────────

test("resolveMemoryKey: null options → null (no throw)", () => {
  const key = resolveMemoryKey(null);
  assert.equal(key, null);
});

test("resolveMemoryKey: undefined options → null (no throw)", () => {
  const key = resolveMemoryKey(undefined);
  assert.equal(key, null);
});

test("resolveMemoryKey: verdict_key_command: '!' (bare bang) → null", () => {
  // After stripping "!", command is empty — must not exec empty string
  const key = resolveMemoryKey({ verdict_key_command: "!" });
  assert.equal(key, null);
});

test("resolveMemoryKey: verdict_key_command: '' (empty string) → null", () => {
  const key = resolveMemoryKey({ verdict_key_command: "" });
  assert.equal(key, null);
});

test("resolveMemoryKey: verdict_key_command: null → null (not a string)", () => {
  const key = resolveMemoryKey({ verdict_key_command: null });
  assert.equal(key, null);
});

test("resolveMemoryKey: never throws on any input (invariant)", () => {
  // The module must NEVER throw — keyring failures must not crash the plugin.
  // Verify across hostile inputs.
  const hostile = [
    null,
    undefined,
    {},
    { verdict_key_command: null },
    { verdict_key_command: 123 },
    { verdict_key_command: {} },
    { verdict_key_command: [] },
    { verdict_key_command: "!sleep 999" }, // would timeout, but 5s cap + catch
  ];
  for (const opt of hostile) {
    // Each must return null (or a string), never throw
    let result;
    assert.doesNotThrow(() => { result = resolveMemoryKey(opt); },
      `resolveMemoryKey threw on input: ${JSON.stringify(opt)}`);
    assert.ok(result === null || typeof result === "string",
      `resolveMemoryKey returned non-string/non-null on: ${JSON.stringify(opt)}`);
  }
});
