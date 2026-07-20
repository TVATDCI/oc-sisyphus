/**
 * test/adversarial/g7-routing.test.js — G7 routing adversarial corpus.
 *
 * Ported from remote opencode-config repo. Adapted for our flat src/ structure.
 *
 * PHASE 1 EXPLORATION NOTE:
 *   MCP classification tests (G7-ε-*) are SKIPPED because we don't have
 *   mcp-classifier.js yet. They will be enabled in Phase 2.3 when we add
 *   the MCP classifier module.
 *
 *   setMemoryKey is stubbed as a no-op because our state.js doesn't export
 *   it yet. It will be replaced with a real import in Phase 3.4.
 *
 *   Trust-root tests (G7-trust-*) and task blocking tests (G7-task-*) WILL
 *   FAIL against our current code because we don't have Layer 0 or task
 *   blocking. These failures are the specification for Phase 2.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { shouldBlockTool } from "../../src/gates.js";
import {
  loadWorkflowConfig,
  clearWorkflowCache,
} from "../../src/workflow-loader.js";
import {
  getMcpClassification,
  _internal as mcpInternal,
} from "../../src/mcp-classifier.js";

// ─── Stub for setMemoryKey ──────────────────────────────────────────────────
// Our state.js doesn't export setMemoryKey yet (Phase 3 adds it).
// This no-op stub allows tests that call setMemoryKey(null) to run without
// errors. The stub does nothing — which is correct because our current
// state.js doesn't use MEMORY_KEY at all.
function setMemoryKey(_key) {
  /* no-op stub — replaced in Phase 3 */
}

// ─── Workflow config loader (CI fallback) ───────────────────────────────────
// Same pattern as remote: if no workflow.yaml in HOME, create a temp one.
const MINIMAL_WORKFLOW_YAML = `workflow:
  name: g7-routing-test
  version: "1.0.0"
  description: "Minimal workflow for CI fallback"
  state_file: "~/.sisyphus/state.json"
  phases:
    - id: discovery
      description: "Explore"
      next_action: "advance"
    - id: plan-review
      description: "Review plan"
      next_action: "advance"
    - id: execution
      description: "Execute"
      next_action: "advance"
  auto_advance: []
  state:
    version: "3.0.0"
    persistent_fields: []
  blocking:
    global_rules: []
`;

clearWorkflowCache();
let _workflowCfg = null;
try {
  _workflowCfg = loadWorkflowConfig();
} catch {
  /* no yaml in this HOME */
}
if (!_workflowCfg) {
  const _ciHome = mkdtempSync(join(tmpdir(), "g7-routing-ci-"));
  mkdirSync(join(_ciHome, ".sisyphus"), { recursive: true });
  writeFileSync(
    join(_ciHome, ".sisyphus", "workflow.yaml"),
    MINIMAL_WORKFLOW_YAML,
  );
  process.env.HOME = _ciHome;
  clearWorkflowCache();
  loadWorkflowConfig();
  process.on("exit", () => {
    try {
      rmSync(_ciHome, { recursive: true, force: true });
    } catch {}
  });
}

// ─── Test helpers ───────────────────────────────────────────────────────────

function freshSessionState() {
  return {
    phase: "discovery",
    prdApproved: false,
    planApproved: false,
    approvalStatus: "pending",
    prdGateStatus: "unknown",
    planGateStatus: "unknown",
    stateFileExists: false,
    evidenceLogged: false,
    lastCheckpoint: "session-start",
  };
}

function approvedExecutionState() {
  return {
    phase: "execution",
    prdApproved: true,
    planApproved: true,
    approvalStatus: "approved",
    prdGateStatus: "PASS",
    planGateStatus: "PASS",
    stateFileExists: true,
    evidenceLogged: true,
    lastCheckpoint: "plan-approved",
  };
}

// ─── G7-ε: MCP classification ───────────────────────────────────────────────

function setupMcpPrefixes() {
  mcpInternal.setPrefixes(["myfiles_", "semble_"]);
}

test("G7-ε-a: myfiles_write_file classified as MCP write", () => {
  setupMcpPrefixes();
  const result = getMcpClassification("myfiles_write_file");
  assert.equal(result.type, "mcp");
  assert.equal(result.classification, "write");
  assert.equal(result.server, "myfiles");
});

test("G7-ε-b: myfiles_read_file classified as MCP read", () => {
  setupMcpPrefixes();
  const result = getMcpClassification("myfiles_read_file");
  assert.equal(result.type, "mcp");
  assert.equal(result.classification, "read");
});

test("G7-ε-c: semble_search classified as MCP read", () => {
  setupMcpPrefixes();
  const result = getMcpClassification("semble_search");
  assert.equal(result.type, "mcp");
  assert.equal(result.classification, "read");
});

test("G7-ε-d: built-in 'write' tool NOT classified as MCP", () => {
  setupMcpPrefixes();
  const result = getMcpClassification("write");
  assert.equal(result, null);
});

test("G7-ε-e: myfiles_write_file blocked when fail-closed (was bypassed pre-P0a)", () => {
  setupMcpPrefixes();
  const st = freshSessionState();
  const d = shouldBlockTool(
    "myfiles_write_file",
    { path: "/tmp/foo.txt", content: "x" },
    st,
  );
  assert.equal(d.blocked, true);
});

test("G7-ε-f: myfiles_write_file to trust-root → blocked even in approved state", () => {
  setupMcpPrefixes();
  const st = approvedExecutionState();
  const d = shouldBlockTool(
    "myfiles_write_file",
    { path: `${homedir()}/.sisyphus/state.json`, content: "{}" },
    st,
  );
  assert.equal(d.blocked, true);
  assert.match(d.reason, /trust-root/i);
});

test("G7-ε-g: unknown MCP verb (myfiles_transmogrify) → denied by default", () => {
  setupMcpPrefixes();
  const st = approvedExecutionState();
  const d = shouldBlockTool("myfiles_transmogrify", { path: "/tmp/x" }, st);
  assert.equal(d.blocked, true);
  assert.match(d.reason, /unknown/i);
});

test("G7-ε-h: myfiles_read_file to /tmp → allowed in approved state", () => {
  setupMcpPrefixes();
  const st = approvedExecutionState();
  const d = shouldBlockTool("myfiles_read_file", { path: "/tmp/foo.txt" }, st);
  assert.equal(d.blocked, false);
});

// ─── G7-task: task blocked during fail-closed ───────────────────────────────

test("G7-task: task tool blocked when fail-closed (subagent escape prevention)", () => {
  const st = freshSessionState();
  const d = shouldBlockTool("task", { prompt: "anything" }, st);
  assert.equal(d.blocked, true);
});

test("G7-task: task tool allowed when gates passed + approved", () => {
  setMemoryKey(null);
  const st = approvedExecutionState();
  const d = shouldBlockTool(
    "task",
    { prompt: "hello", subagent_type: "explore" },
    st,
  );
  // In execution phase, task is allowed (not destructive bash)
  assert.equal(d.blocked, false);
});

// ─── G7 trust-root path-denylist (Layer 0) ──────────────────────────────────
// These tests WILL FAIL against our current code (no Layer 0 yet).
// The failures identify exactly what Phase 2.2 needs to add.

test("G7-trust-a: write tool to state.json → blocked", () => {
  const st = approvedExecutionState();
  const d = shouldBlockTool(
    "write",
    { filePath: `${homedir()}/.sisyphus/state.json`, content: "{}" },
    st,
  );
  assert.equal(d.blocked, true);
  assert.match(d.reason, /trust-root/i);
});

test("G7-trust-b: write tool to workflow.yaml → blocked", () => {
  const st = approvedExecutionState();
  const d = shouldBlockTool(
    "write",
    { filePath: `${homedir()}/.sisyphus/workflow.yaml`, content: "evil" },
    st,
  );
  assert.equal(d.blocked, true);
});

test("G7-trust-c: write tool to momus-plan-review path → blocked", () => {
  const st = approvedExecutionState();
  const d = shouldBlockTool(
    "write",
    {
      filePath: `${homedir()}/.sisyphus/notepads/x/momus-plan-review-evil.md`,
      content: "...",
    },
    st,
  );
  assert.equal(d.blocked, true);
});

test("G7-trust-d: write tool to evidence/ → ALLOWED (exception)", () => {
  setMemoryKey(null);
  const st = approvedExecutionState();
  const d = shouldBlockTool(
    "write",
    { filePath: `${homedir()}/.sisyphus/evidence/test.md`, content: "ok" },
    st,
  );
  assert.equal(d.blocked, false);
});

test("G7-trust-e: bash 'cp /tmp/x ~/.sisyphus/state.json' → blocked (Tier 2)", () => {
  const st = approvedExecutionState();
  const d = shouldBlockTool(
    "bash",
    { command: `cp /tmp/x ${homedir()}/.sisyphus/state.json` },
    st,
  );
  assert.equal(d.blocked, true);
});

// ─── G7 trust-root READ denylist (HOLE 1f) ─────────────────────────────────

test("G7-read-a: MCP read of state.json → blocked (HOLE 1f)", () => {
  setupMcpPrefixes();
  const st = approvedExecutionState();
  const d = shouldBlockTool(
    "myfiles_read_file",
    { path: `${homedir()}/.sisyphus/state.json` },
    st,
  );
  assert.equal(d.blocked, true);
  assert.match(d.reason, /trust-root/i);
});

test("G7-read-b: MCP read of /proc/<pid>/environ → blocked (HOLE 1f)", () => {
  setupMcpPrefixes();
  const st = approvedExecutionState();
  const d = shouldBlockTool(
    "myfiles_read_file",
    { path: `/proc/${process.pid}/environ` },
    st,
  );
  assert.equal(d.blocked, true);
});

test("G7-read-c: MCP read of plugin dist/index.js → blocked (HOLE 1f)", () => {
  setupMcpPrefixes();
  const st = approvedExecutionState();
  const d = shouldBlockTool(
    "myfiles_read_file",
    {
      path: `${homedir()}/.config/opencode/plugins/sisyphus-gates/dist/index.js`,
    },
    st,
  );
  assert.equal(d.blocked, true);
});

test("G7-read-d: MCP read of /etc/passwd → allowed (not in denylist)", () => {
  setupMcpPrefixes();
  const st = approvedExecutionState();
  const d = shouldBlockTool("myfiles_read_file", { path: "/etc/passwd" }, st);
  assert.equal(d.blocked, false);
});

// ─── Path traversal defense (HOLE 1c) ───────────────────────────────────────

test("G7-traversal-a: '~/Documents/../../.sisyphus/state.json' → blocked after realpath", () => {
  const st = approvedExecutionState();
  const d = shouldBlockTool(
    "write",
    {
      filePath: `${homedir()}/Documents/../../.sisyphus/state.json`,
      content: "x",
    },
    st,
  );
  assert.equal(d.blocked, true);
});

// ─── Regression: existing tools still work correctly ─────────────────────────

test("G7-regression-a: write to /tmp → allowed in approved state", () => {
  setMemoryKey(null);
  const st = approvedExecutionState();
  const d = shouldBlockTool(
    "write",
    { filePath: "/tmp/foo.txt", content: "x" },
    st,
  );
  assert.equal(d.blocked, false);
});

test("G7-regression-b: bash 'ls -la' → allowed in approved state", () => {
  const st = approvedExecutionState();
  const d = shouldBlockTool("bash", { command: "ls -la" }, st);
  assert.equal(d.blocked, false);
});

test("G7-regression-c: bash 'rm -rf /tmp/x' → blocked in execution phase (stricter policy)", () => {
  setMemoryKey(null);
  const st = approvedExecutionState();
  const d = shouldBlockTool("bash", { command: "rm -rf /tmp/x" }, st);
  // Our policy (Decision 4): destructive commands are blocked even in
  // execution phase. Only catastrophic + sudo always block (Layers 1-2),
  // but our stricter policy also blocks destructive commands via Layer 6.
  assert.equal(d.blocked, true);
});

test("G7-regression-d: read tool → always allowed (Layer 3)", () => {
  const st = freshSessionState();
  const d = shouldBlockTool("read", { filePath: "/tmp/foo" }, st);
  assert.equal(d.blocked, false);
});
