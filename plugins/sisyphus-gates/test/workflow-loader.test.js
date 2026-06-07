/**
 * test/workflow-loader.test.js — W1.E workflow loader tests.
 *
 * The workflow loader reads $HOME/.sisyphus/workflow.yaml and exposes it
 * as a parsed object. The plugin's phase-machine, gate prompt, and
 * mustBlockExecution all consume the cached config. This file proves:
 *
 *   1. loadWorkflowConfig returns parsed config when yaml exists and is valid
 *   2. loadWorkflowConfig returns null when yaml does not exist (ENOENT)
 *   3. loadWorkflowConfig throws on malformed yaml
 *   4. loadWorkflowConfig throws on future schema_version
 *   5. loadWorkflowConfig throws on missing required field (e.g., no phases)
 *   6. validateWorkflowConfig returns valid:true for correct config
 *   7. validateWorkflowConfig returns valid:false with errors for missing fields
 *   8. validateWorkflowConfig returns valid:false for future schema_version
 *   9. getCachedWorkflowConfig returns null before first load
 *  10. getCachedWorkflowConfig returns config after load
 *  11. clearWorkflowCache resets the cache
 *  12. Two parallel loadWorkflowConfig calls return the same instance (no race)
 *
 * Test framework: node:test (built-in)
 * Assertions:    node:assert/strict
 * Run: `npm test` or `node --test test/workflow-loader.test.js`
 */

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { withTempHome } from "./helpers.js";
import {
  loadWorkflowConfig,
  getCachedWorkflowConfig,
  clearWorkflowCache,
  validateWorkflowConfig,
  WORKFLOW_SCHEMA_VERSION,
} from "../src/workflow-loader.js";

/**
 * Build a minimal but VALID workflow.yaml content for tests.
 * Has all required fields with safe defaults.
 */
function buildValidWorkflowYaml(overrides = {}) {
  return `workflow:
  name: sisyphus-7-phase
  version: "1.0.0"
  description: "Test workflow"
  phases:
    - id: discovery
      description: "Explore"
      next_action: "Begin PRD"
    - id: prd-writing
      description: "Write PRD"
      next_action: "Submit for review"
  auto_advance:
    - from: prd-writing
      to: prd-review
      'on':
        type: file_write
        path_contains: "prd"
  state:
    version: "3.0.0"
    persistent_fields: []
  blocking:
    global_rules: []
${overrides.extra || ""}
`;
}

/**
 * Write a workflow.yaml at the temp $HOME/.sisyphus/workflow.yaml.
 */
function writeWorkflowYaml(home, content) {
  const path = join(home, ".sisyphus", "workflow.yaml");
  mkdirSync(join(home, ".sisyphus"), { recursive: true });
  writeFileSync(path, content);
  return path;
}

// ─── Test 1: loadWorkflowConfig returns parsed config when valid ───────────

describe("W1.E — workflow-loader: loadWorkflowConfig happy path", () => {
  test("returns parsed config when yaml exists and is valid", async () => {
    await withTempHome(async (home) => {
      clearWorkflowCache();
      writeWorkflowYaml(home, buildValidWorkflowYaml());

      const config = loadWorkflowConfig();
      assert.ok(config, "config must not be null when yaml exists");
      assert.equal(typeof config, "object");
      assert.ok(config.workflow, "config must have a workflow root");
      assert.equal(config.workflow.name, "sisyphus-7-phase");
      assert.equal(config.workflow.version, "1.0.0");
      assert.ok(Array.isArray(config.workflow.phases));
      assert.ok(Array.isArray(config.workflow.auto_advance));
      assert.ok(typeof config.workflow.state === "object");
      assert.ok(typeof config.workflow.blocking === "object");
    });
  });
});

// ─── Test 2: ENOENT returns null ───────────────────────────────────────────

describe("W1.E — workflow-loader: loadWorkflowConfig ENOENT", () => {
  test("returns null when yaml does not exist (ENOENT)", async () => {
    await withTempHome(async (home) => {
      clearWorkflowCache();
      // withTempHome writes a default workflow.yaml; remove it for this test.
      rmSync(join(home, ".sisyphus", "workflow.yaml"));
      const path = resolve(process.env.HOME, ".sisyphus", "workflow.yaml");
      assert.equal(existsSync(path), false, "precondition: yaml must not exist");

      const config = loadWorkflowConfig();
      assert.equal(config, null, "loadWorkflowConfig must return null on ENOENT");
    });
  });
});

// ─── Test 3: malformed yaml throws ─────────────────────────────────────────

describe("W1.E — workflow-loader: malformed yaml", () => {
  test("throws on malformed yaml", async () => {
    await withTempHome(async (home) => {
      clearWorkflowCache();
      writeWorkflowYaml(home, buildValidWorkflowYaml().slice(0, 50) + "\n  bad: : : not yaml\n: : :");

      let threw = null;
      try {
        loadWorkflowConfig();
      } catch (err) {
        threw = err;
      }
      assert.ok(threw, "loadWorkflowConfig must throw on malformed yaml");
      assert.ok(
        /yaml|parse|syntax/i.test(threw.message),
        `error message must mention yaml/parse/syntax. Got: ${threw.message}`
      );
    });
  });
});

// ─── Test 4: future schema_version throws ─────────────────────────────────

describe("W1.E — workflow-loader: future schema_version", () => {
  test("throws on future schema_version (2.0.0 > 1.0.0)", async () => {
    await withTempHome(async (home) => {
      clearWorkflowCache();
      writeWorkflowYaml(
        home,
        `workflow:
  name: future-workflow
  version: "2.0.0"
  phases:
    - id: discovery
      description: "x"
  auto_advance: []
  state:
    version: "3.0.0"
  blocking: {}
`
      );

      let threw = null;
      try {
        loadWorkflowConfig();
      } catch (err) {
        threw = err;
      }
      assert.ok(threw, "loadWorkflowConfig must throw on future schema_version");
      assert.ok(
        /version|schema/i.test(threw.message),
        `error must mention version/schema. Got: ${threw.message}`
      );
    });
  });
});

// ─── Test 5: missing required field throws ────────────────────────────────

describe("W1.E — workflow-loader: missing required fields", () => {
  test("throws when phases is missing", async () => {
    await withTempHome(async (home) => {
      clearWorkflowCache();
      writeWorkflowYaml(
        home,
        `workflow:
  name: no-phases
  version: "1.0.0"
  auto_advance: []
  state:
    version: "3.0.0"
  blocking: {}
`
      );

      let threw = null;
      try {
        loadWorkflowConfig();
      } catch (err) {
        threw = err;
      }
      assert.ok(threw, "loadWorkflowConfig must throw when phases is missing");
      assert.ok(/phases/i.test(threw.message), `error must mention phases. Got: ${threw.message}`);
    });
  });

  test("throws when auto_advance is missing", async () => {
    await withTempHome(async (home) => {
      clearWorkflowCache();
      writeWorkflowYaml(
        home,
        `workflow:
  name: no-auto
  version: "1.0.0"
  phases:
    - id: discovery
      description: "x"
  state:
    version: "3.0.0"
  blocking: {}
`
      );

      let threw = null;
      try {
        loadWorkflowConfig();
      } catch (err) {
        threw = err;
      }
      assert.ok(threw, "loadWorkflowConfig must throw when auto_advance is missing");
      assert.ok(/auto_advance/i.test(threw.message), `error must mention auto_advance. Got: ${threw.message}`);
    });
  });
});

// ─── Test 6: validateWorkflowConfig valid:true ─────────────────────────────

describe("W1.E — workflow-loader: validateWorkflowConfig valid", () => {
  test("returns valid:true for a correct config", () => {
    const config = {
      workflow: {
        name: "ok",
        version: WORKFLOW_SCHEMA_VERSION,
        phases: [{ id: "discovery", description: "x" }],
        auto_advance: [],
        state: { version: "3.0.0" },
        blocking: {},
      },
    };
    const result = validateWorkflowConfig(config);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });
});

// ─── Test 7: validateWorkflowConfig valid:false with errors ────────────────

describe("W1.E — workflow-loader: validateWorkflowConfig invalid", () => {
  test("returns valid:false with errors when phases is missing", () => {
    const config = {
      workflow: {
        name: "incomplete",
        version: WORKFLOW_SCHEMA_VERSION,
        auto_advance: [],
        state: {},
        blocking: {},
      },
    };
    const result = validateWorkflowConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0, "errors array must be non-empty");
    assert.ok(result.errors.some((e) => /phases/i.test(e)), `errors must mention phases. Got: ${JSON.stringify(result.errors)}`);
  });

  test("returns valid:false with errors when workflow root is missing", () => {
    const config = { notWorkflow: true };
    const result = validateWorkflowConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  test("returns valid:false with multiple errors for multiple missing fields", () => {
    const config = { workflow: { name: "partial" } };
    const result = validateWorkflowConfig(config);
    assert.equal(result.valid, false);
    // Should report multiple missing fields
    assert.ok(result.errors.length >= 3, `expected >= 3 errors, got: ${JSON.stringify(result.errors)}`);
  });
});

// ─── Test 8: validateWorkflowConfig future schema_version ─────────────────

describe("W1.E — workflow-loader: validateWorkflowConfig future schema", () => {
  test("returns valid:false for future schema_version", () => {
    const config = {
      workflow: {
        name: "future",
        version: "99.0.0",
        phases: [],
        auto_advance: [],
        state: {},
        blocking: {},
      },
    };
    const result = validateWorkflowConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /version/i.test(e)), `errors must mention version. Got: ${JSON.stringify(result.errors)}`);
  });
});

// ─── Test 9: getCachedWorkflowConfig returns null before load ─────────────

describe("W1.E — workflow-loader: getCachedWorkflowConfig", () => {
  test("returns null before any loadWorkflowConfig call", async () => {
    await withTempHome(async (home) => {
      clearWorkflowCache();
      // No yaml file written
      const cached = getCachedWorkflowConfig();
      assert.equal(cached, null, "cache must be null before any load");
    });
  });
});

// ─── Test 10: getCachedWorkflowConfig returns config after load ───────────

describe("W1.E — workflow-loader: getCachedWorkflowConfig after load", () => {
  test("returns config after loadWorkflowConfig", async () => {
    await withTempHome(async (home) => {
      clearWorkflowCache();
      writeWorkflowYaml(home, buildValidWorkflowYaml());

      const loaded = loadWorkflowConfig();
      assert.ok(loaded, "loadWorkflowConfig must return config");
      const cached = getCachedWorkflowConfig();
      assert.ok(cached, "getCachedWorkflowConfig must return the loaded config");
      assert.strictEqual(cached, loaded, "cache must be the exact same instance");
    });
  });
});

// ─── Test 11: clearWorkflowCache resets the cache ─────────────────────────

describe("W1.E — workflow-loader: clearWorkflowCache", () => {
  test("clears the cache so getCachedWorkflowConfig returns null again", async () => {
    await withTempHome(async (home) => {
      clearWorkflowCache();
      writeWorkflowYaml(home, buildValidWorkflowYaml());

      loadWorkflowConfig();
      assert.ok(getCachedWorkflowConfig(), "cache must be set after load");

      clearWorkflowCache();
      assert.equal(getCachedWorkflowConfig(), null, "cache must be null after clear");
    });
  });
});

// ─── Test 12: two parallel loadWorkflowConfig calls return same instance ──

describe("W1.E — workflow-loader: parallel load race-safety", () => {
  test("two parallel loadWorkflowConfig calls return the same instance (no race)", async () => {
    await withTempHome(async (home) => {
      clearWorkflowCache();
      writeWorkflowYaml(home, buildValidWorkflowYaml());

      const [a, b] = await Promise.all([Promise.resolve(loadWorkflowConfig()), Promise.resolve(loadWorkflowConfig())]);

      assert.ok(a, "first call must return config");
      assert.ok(b, "second call must return config");
      assert.strictEqual(a, b, "parallel loads must return the same instance (cached)");
    });
  });
});
