/**
 * test/helpers.js — shared test utilities for sisyphus-gates tests.
 *
 * Strategy: redirect process.env.HOME to a temp directory for the duration
 * of each test so the plugin's getCanonicalStatePath() resolves to a
 * sandboxed location. The plugin's `dist/index.js` re-exports `server`
 * from `src/plugin.js`, which uses paths.js — and paths.js reads HOME at
 * call time (not at module load time), so the redirection works.
 *
 * W1.E: also writes a default workflow.yaml under $HOME/.sisyphus/ so
 * the yaml-driven phase machine has a config to consume. Tests that
 * exercise the "yaml missing" code path can rmSync that file inside
 * their withTempHome callback.
 *
 * Each test should:
 *   1. await withTempHome(async (home) => { ... });
 *   2. Inside, set up state files or not, run assertions, clean up is auto.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { clearWorkflowCache, loadWorkflowConfig } from "../src/workflow-loader.js";

/**
 * Default workflow.yaml content written into every withTempHome sandbox.
 * Matches the real ~/.sisyphus/workflow.yaml structure so the yaml-driven
 * phase machine and gate prompt have all the transitions and phase
 * descriptions they need. Tests that need a custom yaml can overwrite
 * this file inside their callback.
 */
const DEFAULT_TEST_WORKFLOW_YAML = `workflow:
  name: sisyphus-7-phase-test
  version: "1.0.0"
  description: "Test workflow for sisyphus-gates"
  state_file: "~/.sisyphus/state.json"
  phases:
    - id: discovery
      description: "Explore the problem space freely."
      next_action: "Invoke /skill:prd-writer to begin PRD creation."
    - id: prd-writing
      description: "Write the Product Requirements Document."
      next_action: "Invoke /skill:momus-prd-reviewer for gate review."
    - id: prd-review
      description: "PRD review gate. Do NOT modify the PRD during review."
      next_action: "Mark PRD as approved and advance to issue-creation."
    - id: issue-creation
      description: "Create vertical slice issues from the approved PRD."
      next_action: "Invoke /skill:plan-writer."
    - id: plan-writing
      description: "Write the execution plan from approved issues."
      next_action: "Invoke /skill:momus-plan-reviewer for gate review."
    - id: plan-review
      description: "Plan review gate. Do NOT modify the plan during review."
      next_action: "Mark plan as approved and advance to execution."
    - id: execution
      description: "Full tool access. Implement waves sequentially."
      next_action: "Run /skill:auditor after each slice."
    - id: validation
      description: "Verify all slices pass acceptance criteria."
      next_action: "Run regression checks between waves."
    - id: close
      description: "Archive state, close beads issues, push to remote."
      next_action: "Ensure all evidence is logged before closing."
  auto_advance:
    - from: prd-writing
      to: prd-review
      'on':
        type: file_write
        path_contains: "prd"
      case_sensitive: false
      set_state:
        last_checkpoint: "prd-written"
    - from: prd-review
      to: issue-creation
      'on':
        type: output_contains
        text: "PRD review PASS"
      set_state:
        prd_gate: "PASS"
        prd_approved: true
        last_checkpoint: "prd-approved"
    - from: issue-creation
      to: plan-writing
      'on':
        type: file_write
        path_contains: "plan"
      case_sensitive: false
      set_state:
        last_checkpoint: "plan-written"
    - from: plan-writing
      to: plan-review
      'on':
        type: output_contains
        text: "Plan content"
      set_state:
        last_checkpoint: "plan-written"
        plan_written: true
    - from: plan-review
      to: execution
      'on':
        type: output_contains
        text: "Plan review PASS"
      set_state:
        plan_gate: "PASS"
        plan_approved: true
        last_checkpoint: "plan-approved"
        approval_status: "approved"
    - from: execution
      to: execution
      'on':
        tool: write
        path_matches: ".sisyphus/evidence/"
      set_state:
        evidence_logged: true
  state:
    version: "3.0.0"
    persistent_fields: []
  blocking:
    global_rules: []
`;

/**
 * Create a temp directory and set process.env.HOME to it for the duration
 * of `fn(homePath)`. Restores the original HOME after. Also creates the
 * $HOME/.sisyphus/ subdirectory ready for the plugin to use.
 *
 * W1.E: writes a default workflow.yaml so the yaml-driven phase machine
 * has a config to consume. Tests for "yaml missing" code path can remove
 * that file via rmSync.
 */
export async function withTempHome(fn) {
  const originalHome = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "sisyphus-gates-test-"));
  // Pre-create the canonical state directory so the plugin can write into it.
  mkdirSync(join(home, ".sisyphus"), { recursive: true });
  // The plugin also writes evidence files to .sisyphus/evidence/
  mkdirSync(join(home, ".sisyphus", "evidence"), { recursive: true });
  // Some tests create the legacy sidecar too
  mkdirSync(join(home, ".config", "opencode", ".sisyphus"), { recursive: true });
  // W1.E: write a default workflow.yaml so the yaml-driven code has a config.
  writeFileSync(
    join(home, ".sisyphus", "workflow.yaml"),
    DEFAULT_TEST_WORKFLOW_YAML
  );

  process.env.HOME = home;
  // W1.E + 4C-CI fix: the workflow-loader module caches its parsed config at
  // module scope. After changing HOME we MUST clear+reload so the cache
  // reflects the temp-home workflow.yaml. Without this, tests inherit a
  // stale cache from the original HOME — in CI that HOME has no yaml, so
  // mustBlockExecution fail-closes with "Workflow config unavailable" and
  // every test that needs phase rules or gate evaluation fails.
  clearWorkflowCache();
  loadWorkflowConfig();
  try {
    return await fn(home);
  } finally {
    // Restore cache to "cleared" so the next test starts fresh (the
    // test's own beforeEach will reload from whatever HOME it sets up).
    clearWorkflowCache();
    process.env.HOME = originalHome;
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Create a fresh temp home without a callback wrapper. Caller is responsible
 * for cleanup (or use withTempHome for automatic).
 */
export function createTempHome() {
  const home = mkdtempSync(join(tmpdir(), "sisyphus-gates-test-"));
  mkdirSync(join(home, ".sisyphus"), { recursive: true });
  mkdirSync(join(home, ".sisyphus", "evidence"), { recursive: true });
  mkdirSync(join(home, ".config", "opencode", ".sisyphus"), { recursive: true });
  return home;
}

/**
 * Build a mock session state object with sensible defaults plus any
 * field overrides. Use to construct the `state` argument to gates.js
 * functions without touching disk.
 */
export function createMockState(overrides = {}) {
  return {
    phase: "execution",
    prdApproved: false,
    planApproved: false,
    evidenceLogged: false,
    lastCheckpoint: "session-start",
    prdGateStatus: "unknown",
    planGateStatus: "unknown",
    approvalStatus: "pending",
    stateFileExists: false,
    ...overrides,
  };
}

/**
 * Write a state file to $home/.sisyphus/state.json with the given state object.
 * Adds schema_version "3.0.0" automatically (can be overridden via overrides).
 */
export function writeStateFile(home, state) {
  const stateWithSchema = {
    schema_version: "3.0.0",
    ...state,
  };
  const path = join(home, ".sisyphus", "state.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(stateWithSchema, null, 2) + "\n");
  return path;
}

/**
 * Remove the canonical state file at $home/.sisyphus/state.json.
 */
export function removeStateFile(home) {
  const path = join(home, ".sisyphus", "state.json");
  if (existsSync(path)) {
    rmSync(path);
  }
}

/**
 * Write a state file at the LEGACY sidecar location
 * $home/.config/opencode/.sisyphus/state.json.
 * Used to test that the plugin does NOT read from this path.
 */
export function writeLegacyStateFile(home, state) {
  const path = join(home, ".config", "opencode", ".sisyphus", "state.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
  return path;
}

/**
 * Resolve the canonical state path for a given HOME.
 * Convenience: mirrors getCanonicalStatePath() from src/paths.js
 * without having to import ESM modules into the test.
 */
export function canonicalStatePath(home) {
  return resolve(home, ".sisyphus", "state.json");
}

/**
 * Resolve the legacy sidecar state path for a given HOME.
 */
export function legacyStatePath(home) {
  return resolve(home, ".config", "opencode", ".sisyphus", "state.json");
}

/**
 * Run `fn(home)` with a sandboxed HOME that also has the repairs directory
 * pre-created. Composes on top of withTempHome so the workflow.yaml is
 * present, the metrics/evidence subdirs exist, and the workflow cache is
 * cleared/reloaded. Use this for tests that exercise the G1 repair-brief
 * pipeline ($HOME/.sisyphus/repairs/).
 */
export async function withTempRepairsDir(fn) {
  return withTempHome(async (home) => {
    mkdirSync(join(home, ".sisyphus", "repairs"), { recursive: true });
    return fn(home);
  });
}
