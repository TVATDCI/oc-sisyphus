/**
 * test/sandbox-integration.test.js — Slice D (brain-61r)
 *
 * Integration tests for Layer 3.7 in shouldBlockTool.
 *
 * Verifies:
 *   AC-3.1: npm install allowed in sandbox cwd (non-Execution phase)
 *   AC-3.2: NOT allowed when cwd is outside sandbox
 *   AC-3.3: rm -rf / still blocked (Layer 1 catastrophic fires first)
 *   AC-3.4: sudo apt update still blocked (Layer 2 fires first)
 *   AC-3.5: write to state.json still blocked (Layer 0 fires first)
 *   AC-3.21: Layer 3.7 returns null for non-bash tools (write/edit/task)
 *
 * Uses process.chdir() to simulate the agent's cwd being in/out of sandbox.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldBlockTool } from "../src/gates.js";

const originalCwd = process.cwd();

before(() => {
  // Save original cwd — tests will chdir as needed
});

after(() => {
  process.chdir(originalCwd);
});

// ─── Helper: state with sandbox config enabled ────────────────────────────

function stateWithSandbox(overrides = {}) {
  return {
    phase: "execution",
    prdApproved: true,
    planApproved: true,
    evidenceLogged: true,
    lastCheckpoint: "session-start",
    prdGateStatus: "PASS",
    planGateStatus: "PASS",
    approvalStatus: "approved",
    stateFileExists: true,
    planId: null,
    repairBriefPath: null,
    sandboxConfig: {
      sandboxPaths: ["/tmp/"],
      sandboxAllowedCommands: ["npm install", "npm test", "node "],
    },
    ...overrides,
  };
}

function stateWithoutSandbox(overrides = {}) {
  return {
    ...stateWithSandbox(),
    sandboxConfig: null,
    ...overrides,
  };
}

// Helper: chdir to a temp dir under /tmp/, return cleanup fn
function inSandboxCwd() {
  const dir = mkdtempSync(join(tmpdir(), "integration-sandbox-"));
  process.chdir(dir);
  return () => {
    process.chdir(originalCwd);
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  };
}

// Helper: chdir to a non-sandbox path
function inProdCwd() {
  // Use a path NOT under /tmp/ — the plugin's own dir or HOME
  process.chdir(originalCwd);
  return () => {};
}

// ─── AC-3.1: npm install allowed in sandbox cwd ──────────────────────────

test("AC-3.1: npm install allowed when cwd is in sandbox (non-Execution phase OK)", () => {
  const cleanup = inSandboxCwd();
  try {
    // Even in a non-Execution phase, Layer 3.7 should fire BEFORE Layer 5
    const state = stateWithSandbox({ phase: "discovery" });
    const result = shouldBlockTool("bash", { command: "npm install" }, state);
    assert.equal(result.blocked, false, "must be allowed by Layer 3.7");
    assert.ok(result.sandboxAllow, "must include sandboxAllow audit metadata");
    assert.equal(result.sandboxAllow.matchedPattern, "npm install");
    assert.equal(result.sandboxAllow.matchedSandboxPath, "/tmp/");
  } finally {
    cleanup();
  }
});

test("AC-3.1: npm test also allowed in sandbox", () => {
  const cleanup = inSandboxCwd();
  try {
    const state = stateWithSandbox();
    const result = shouldBlockTool("bash", { command: "npm test" }, state);
    assert.equal(result.blocked, false);
    assert.ok(result.sandboxAllow);
  } finally {
    cleanup();
  }
});

// ─── AC-3.2: NOT allowed when cwd is outside sandbox ─────────────────────

test("AC-3.2: npm install NOT allowed when cwd is outside sandbox", () => {
  const cleanup = inProdCwd();
  try {
    const state = stateWithSandbox();
    const result = shouldBlockTool("bash", { command: "npm install" }, state);
    // Layer 3.7 doesn't fire (cwd not in sandbox). Falls through to Layer 5/6.
    // Result depends on phase — but must NOT have sandboxAllow.
    assert.equal(result.sandboxAllow, undefined, "must NOT include sandboxAllow — cwd is outside sandbox");
  } finally {
    cleanup();
  }
});

test("AC-3.2: sandboxConfig null → Layer 3.7 skipped entirely", () => {
  const cleanup = inSandboxCwd();
  try {
    const state = stateWithoutSandbox();
    const result = shouldBlockTool("bash", { command: "npm install" }, state);
    assert.equal(result.sandboxAllow, undefined);
  } finally {
    cleanup();
  }
});

// ─── AC-3.3: rm -rf / still blocked (Layer 1 catastrophic) ───────────────

test("AC-3.3: rm -rf / blocked even in sandbox cwd (Layer 1 fires first)", () => {
  const cleanup = inSandboxCwd();
  try {
    const state = stateWithSandbox();
    const result = shouldBlockTool("bash", { command: "rm -rf /" }, state);
    assert.equal(result.blocked, true, "must be blocked by Layer 1 catastrophic");
    assert.ok(result.reason.includes("Catastrophic"), "reason must mention catastrophic");
    assert.equal(result.sandboxAllow, undefined, "Layer 3.7 must NOT have fired");
  } finally {
    cleanup();
  }
});

// ─── AC-3.4: sudo apt update still blocked (Layer 2) ─────────────────────

test("AC-3.4: sudo apt update blocked even in sandbox cwd (Layer 2 fires first)", () => {
  const cleanup = inSandboxCwd();
  try {
    const state = stateWithSandbox();
    const result = shouldBlockTool("bash", { command: "sudo apt update" }, state);
    assert.equal(result.blocked, true, "must be blocked by Layer 2 sudo");
    assert.ok(result.reason.includes("sudo"), "reason must mention sudo");
    assert.equal(result.sandboxAllow, undefined);
  } finally {
    cleanup();
  }
});

// ─── AC-3.5: write to state.json still blocked (Layer 0) ─────────────────

test("AC-3.5: write to state.json blocked even from sandbox cwd (Layer 0 fires first)", () => {
  const cleanup = inSandboxCwd();
  try {
    const state = stateWithSandbox();
    const result = shouldBlockTool("write", {
      filePath: "/home/vladi/.sisyphus/state.json",
    }, state);
    assert.equal(result.blocked, true, "must be blocked by Layer 0 trust-root");
    assert.ok(result.reason.includes("Trust-root"), "reason must mention trust-root");
    assert.equal(result.sandboxAllow, undefined);
  } finally {
    cleanup();
  }
});

// ─── AC-3.21: Layer 3.7 returns null for non-bash tools ──────────────────

test("AC-3.21: write tool does NOT trigger Layer 3.7 (no sandboxAllow in result)", () => {
  const cleanup = inSandboxCwd();
  try {
    const state = stateWithSandbox({ phase: "discovery" });
    const result = shouldBlockTool("write", {
      filePath: "/tmp/some-file.txt",
    }, state);
    assert.equal(result.sandboxAllow, undefined,
      "Layer 3.7 must NOT fire for write tool — only bash gets sandbox relaxation");
  } finally {
    cleanup();
  }
});

test("AC-3.21: edit tool does NOT trigger Layer 3.7", () => {
  const cleanup = inSandboxCwd();
  try {
    const state = stateWithSandbox({ phase: "discovery" });
    const result = shouldBlockTool("edit", {
      filePath: "/tmp/some-file.txt",
    }, state);
    assert.equal(result.sandboxAllow, undefined);
  } finally {
    cleanup();
  }
});

test("AC-3.21: task tool does NOT trigger Layer 3.7", () => {
  const cleanup = inSandboxCwd();
  try {
    const state = stateWithSandbox({ phase: "discovery" });
    const result = shouldBlockTool("task", {
      command: "test",
    }, state);
    assert.equal(result.sandboxAllow, undefined);
  } finally {
    cleanup();
  }
});

// ─── Layer ordering: bash with shell metacharacters denied before Layer 3.7 ──

test("ordering: bash with redirect denied before Layer 3.7 evaluates", () => {
  const cleanup = inSandboxCwd();
  try {
    const state = stateWithSandbox();
    // 'npm install > /tmp/log' — redirect detected by hasShellMetachar
    // inside isSandboxCommand → returns null → Layer 3.7 doesn't fire
    const result = shouldBlockTool("bash", {
      command: "npm install > /tmp/log",
    }, state);
    assert.equal(result.sandboxAllow, undefined,
      "redirect command must not get sandbox relaxation");
  } finally {
    cleanup();
  }
});

// ─── Sandbox audit metadata shape ─────────────────────────────────────────

test("audit: sandboxAllow includes cwd, realpathCwd, command, matchedPattern, matchedSandboxPath", () => {
  const cleanup = inSandboxCwd();
  try {
    const state = stateWithSandbox();
    const result = shouldBlockTool("bash", { command: "npm install" }, state);
    assert.ok(result.sandboxAllow);
    assert.ok(typeof result.sandboxAllow.cwd === "string");
    assert.ok(typeof result.sandboxAllow.realpathCwd === "string");
    assert.equal(result.sandboxAllow.command, "npm install");
    assert.equal(result.sandboxAllow.matchedPattern, "npm install");
    assert.equal(result.sandboxAllow.matchedSandboxPath, "/tmp/");
  } finally {
    cleanup();
  }
});
