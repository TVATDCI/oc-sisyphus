/**
 * test/v2-proof-canary.test.js — tests for scripts/v2-proof-canary.mjs,
 * the deterministic canary harness behind v2-enforcement-proof.sh.
 *
 * The harness drives the sisyphus-gates enforcement path per generation
 * (V1: dist/index.js named `server`; V2: plugins/sisyphus-gates.js default
 * setup(ctx)) and owns the write tool: no throw means the write happens, so
 * a fail-open gate leaves pwned.txt behind and fails the proof.
 *
 * These tests pin the harness behavior against fixtures:
 *   - both generations' REAL repo entries block a fail-closed write,
 *     leave no artifact, and record exactly one metric verdict;
 *   - stub entries that do not throw are reported as fail-open with the
 *     canary file present (the no-artifact assertion is not vacuous);
 *   - a present state.json voids the proof (fail-closed precondition).
 *
 * Test framework: node:test (built-in)
 * Run: `npm test` or `node --test test/v2-proof-canary.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { runProof } from "../../../scripts/v2-proof-canary.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Fresh scratch: { home, project } with the .sisyphus skeleton, no state. */
function scratch() {
  const base = mkdtempSync(join(tmpdir(), "v2-proof-canary-test-"));
  const home = join(base, "home");
  const project = join(base, "project");
  mkdirSync(join(home, ".sisyphus", "evidence"), { recursive: true });
  mkdirSync(join(home, ".config", "opencode"), { recursive: true });
  mkdirSync(project, { recursive: true });
  return { base, home, project };
}

/** A generation-1-shaped stub entry whose hook does NOT block. */
function stubV1(dir) {
  const path = join(dir, "stub-v1-entry.js");
  writeFileSync(
    path,
    [
      "export const server = async () => {",
      '  console.log("[sisyphus-gates] stub loaded");',
      "  return {",
      '    "tool.execute.before": async () => {},',
      "  };",
      "};",
      "",
    ].join("\n")
  );
  return path;
}

/** A generation-2-shaped stub definition whose hook does NOT block. */
function stubV2(dir) {
  const path = join(dir, "stub-v2-entry.js");
  writeFileSync(
    path,
    [
      "const definition = {",
      '  id: "sisyphus-gates",',
      "  async setup(ctx) {",
      '    console.log("[sisyphus-gates] stub loaded");',
      '    await ctx.tool.hook("execute.before", async () => {});',
      "  },",
      "};",
      "export default definition;",
      "",
    ].join("\n")
  );
  return path;
}

describe("v2-proof-canary — deterministic block on the real entries", () => {
  test("generation 1 entry blocks a fail-closed write, no artifact, one verdict", async () => {
    const s = scratch();
    try {
      const result = await runProof({
        generation: "1",
        configDir: REPO_ROOT,
        project: s.project,
        home: s.home,
      });
      assert.equal(result.ok, true, `fail: ${result.fail}`);
      assert.equal(result.blocked, true);
      assert.match(result.blockMessage, /Gate blocked/);
      assert.match(result.blockMessage, /state file missing/i);
      assert.equal(result.canaryFile, "absent");
      assert.equal(result.metricEvents, 1);
      assert.ok(result.startupMarkers >= 1);
    } finally {
      rmSync(s.base, { recursive: true, force: true });
    }
  });

  test("generation 2 entry blocks a fail-closed write, no artifact, one verdict", async () => {
    const s = scratch();
    try {
      const result = await runProof({
        generation: "2",
        configDir: REPO_ROOT,
        project: s.project,
        home: s.home,
      });
      assert.equal(result.ok, true, `fail: ${result.fail}`);
      assert.equal(result.blocked, true);
      assert.match(result.blockMessage, /Gate blocked/);
      assert.match(result.blockMessage, /state file missing/i);
      assert.equal(result.canaryFile, "absent");
      assert.equal(result.metricEvents, 1);
      assert.ok(result.startupMarkers >= 1);
    } finally {
      rmSync(s.base, { recursive: true, force: true });
    }
  });
});

describe("v2-proof-canary — the no-artifact assertion is real", () => {
  test("a non-throwing generation 1 stub is reported fail-open WITH the canary file", async () => {
    const s = scratch();
    try {
      const result = await runProof({
        generation: "1",
        configDir: REPO_ROOT,
        project: s.project,
        home: s.home,
        entry: stubV1(s.base),
      });
      assert.equal(result.ok, false);
      assert.equal(result.blocked, false);
      assert.equal(result.canaryFile, "present");
      assert.match(result.fail, /did NOT block/);
    } finally {
      rmSync(s.base, { recursive: true, force: true });
    }
  });

  test("a non-throwing generation 2 stub is reported fail-open WITH the canary file", async () => {
    const s = scratch();
    try {
      const result = await runProof({
        generation: "2",
        configDir: REPO_ROOT,
        project: s.project,
        home: s.home,
        entry: stubV2(s.base),
      });
      assert.equal(result.ok, false);
      assert.equal(result.blocked, false);
      assert.equal(result.canaryFile, "present");
      assert.match(result.fail, /did NOT block/);
    } finally {
      rmSync(s.base, { recursive: true, force: true });
    }
  });
});

describe("v2-proof-canary — fail-closed precondition", () => {
  test("a present state.json voids the proof instead of silently passing", async () => {
    const s = scratch();
    try {
      writeFileSync(
        join(s.home, ".sisyphus", "state.json"),
        JSON.stringify({ schema_version: "3.0.0", phase: "execution" })
      );
      const result = await runProof({
        generation: "2",
        configDir: REPO_ROOT,
        project: s.project,
        home: s.home,
      });
      assert.equal(result.ok, false);
      assert.match(result.fail, /fail-closed precondition violated/);
      assert.equal(result.blocked, false);
    } finally {
      rmSync(s.base, { recursive: true, force: true });
    }
  });
});
