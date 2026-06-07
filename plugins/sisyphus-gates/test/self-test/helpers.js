/**
 * test/self-test/helpers.js — sandbox + boot + hook simulator for self-test.
 *
 * Built on the same pattern as test/helpers.js (withTempHome) but adds:
 *   - bootServer(): invokes src/plugin.js server() in the sandbox.
 *   - callToolExecuteBefore(): simulates opencode's "tool.execute.before" hook.
 *   - callCommandExecuteBefore(): simulates opencode's "command.execute.before" hook.
 *   - callChatSystemTransform(): simulates the chat system transform hook.
 *   - assertBlocked() / assertAllowed(): assertion helpers.
 *   - DEFAULT_WORKFLOW_YAML: a minimal valid yaml for the sandbox.
 *   - clearAllCaches(): resets module-level state between scenarios.
 *
 * Important: each scenario MUST use a unique sessionID (e.g. "selftest-{n}")
 * because the plugin's session state is a module-level Map that persists
 * across the process lifetime.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { server } from "../../src/plugin.js";
import { clearWorkflowCache, loadWorkflowConfig } from "../../src/workflow-loader.js";

/**
 * Minimal valid workflow.yaml that the plugin's workflow-loader.js will accept.
 * Mirrors the structure of ~/.sisyphus/workflow.yaml but with shorter phase
 * descriptions. Self-test scenarios do not exercise phase transitions, so
 * auto_advance is minimal.
 */
export const DEFAULT_WORKFLOW_YAML = `workflow:
  name: sisyphus-self-test
  version: "1.0.0"
  description: "Self-test workflow for sisyphus-gates"
  state_file: "~/.sisyphus/state.json"
  phases:
    - id: discovery
      description: "Explore the problem space freely."
      next_action: "advance"
    - id: execution
      description: "Full tool access."
      next_action: "advance"
  auto_advance: []
  state:
    version: "3.0.0"
    persistent_fields: []
  blocking:
    global_rules: []
`;

/**
 * Reset module-level caches so the next scenario starts fresh.
 *   - clearWorkflowCache() forces workflow-loader.js to re-read from $HOME
 *   - sessionState is a Map in state.js; we cannot clear it directly, so
 *     we rely on unique sessionIDs per scenario.
 */
export function clearAllCaches() {
  clearWorkflowCache();
}

/**
 * Create a temp HOME with the standard sisyphus directory tree.
 * Returns { home, cleanup } where cleanup() restores HOME and rmSyncs the dir.
 */
export function createSandbox() {
  const originalHome = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "sisyphus-selftest-"));
  mkdirSync(join(home, ".sisyphus"), { recursive: true });
  mkdirSync(join(home, ".sisyphus", "evidence"), { recursive: true });
  // Write a default workflow.yaml so the plugin does not enter fail-closed
  // mode by default. Scenarios that need yaml-missing can rmSync it.
  writeFileSync(join(home, ".sisyphus", "workflow.yaml"), DEFAULT_WORKFLOW_YAML);
  process.env.HOME = home;
  return {
    home,
    cleanup() {
      process.env.HOME = originalHome;
      try {
        rmSync(home, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    },
  };
}

/**
 * Write a state file at the canonical path with the given fields.
 * Adds schema_version "3.0.0" automatically.
 */
export function writeState(home, fields) {
  const path = join(home, ".sisyphus", "state.json");
  mkdirSync(dirname(path), { recursive: true });
  const state = {
    schema_version: "3.0.0",
    project: "selftest",
    ...fields,
  };
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
  return path;
}

/**
 * Write invalid JSON to the state file (for corruption scenarios).
 */
export function corruptStateFile(home) {
  const path = join(home, ".sisyphus", "state.json");
  writeFileSync(path, "{ this is not valid JSON ");
  return path;
}

/**
 * Remove the state file entirely (for state-missing scenarios).
 */
export function removeState(home) {
  const path = join(home, ".sisyphus", "state.json");
  if (existsSync(path)) rmSync(path);
}

/**
 * Remove the workflow.yaml (for workflow-missing scenarios).
 */
export function removeWorkflow(home) {
  const path = join(home, ".sisyphus", "workflow.yaml");
  if (existsSync(path)) rmSync(path);
}

/**
 * Write a custom workflow.yaml (e.g., invalid YAML for the invalid-yaml scenario).
 */
export function writeWorkflow(home, content) {
  const path = join(home, ".sisyphus", "workflow.yaml");
  writeFileSync(path, content);
  return path;
}

/**
 * Boot the plugin server in the current sandbox. Returns the hooks object
 * (the second value from server()'s return).
 *
 * Resets the workflow cache first so server() loads from the current HOME.
 */
export async function bootServer() {
  clearAllCaches();
  return await server({}, {});
}

/**
 * Simulate opencode's "tool.execute.before" hook. Returns the mutated output
 * so the scenario can assert on output.parts and output.args.
 */
export async function callToolExecuteBefore(hooks, { tool, args, sessionID }) {
  const output = { args: { ...args }, parts: undefined };
  await hooks["tool.execute.before"](
    { tool, sessionID, callID: "selftest-call" },
    output
  );
  return output;
}

/**
 * Simulate opencode's "command.execute.before" hook. Returns the mutated output.
 */
export async function callCommandExecuteBefore(hooks, { command, args = [], sessionID }) {
  const output = { parts: [] };
  await hooks["command.execute.before"](
    { command, sessionID, arguments: args },
    output
  );
  return output;
}

/**
 * Simulate opencode's "experimental.chat.system.transform" hook. The hook
 * expects output to be an object with a `system` array (opencode pushes
 * extra system-prompt fragments there). Returns the mutated output.
 */
export async function callChatSystemTransform(hooks, { sessionID }) {
  const output = { system: [] };
  await hooks["experimental.chat.system.transform"](
    { sessionID },
    output
  );
  return output;
}

/**
 * Assert that output.parts contains a block message.
 * Returns { ok, reason }.
 */
export function assertBlocked(output) {
  if (output.parts && Array.isArray(output.parts) && output.parts.length > 0) {
    const first = output.parts[0];
    if (first.type === "text" && /⛔ Gate blocked/.test(first.content || "")) {
      return { ok: true, reason: output.args?._sisyphus_gate_blocked || first.content };
    }
  }
  return { ok: false, reason: "no block message in output.parts" };
}

/**
 * Assert that output was NOT blocked.
 * Returns { ok, reason }.
 */
export function assertAllowed(output) {
  const blocked = output.parts && output.parts.length > 0 &&
    output.parts[0]?.type === "text" &&
    /⛔ Gate blocked/.test(output.parts[0]?.content || "");
  if (blocked) {
    return { ok: false, reason: `unexpectedly blocked: ${output.parts[0].content}` };
  }
  if (output.args?._sisyphus_gate_blocked) {
    return { ok: false, reason: `unexpectedly annotated: ${output.args._sisyphus_gate_blocked}` };
  }
  return { ok: true };
}

// ─── Metrics helpers (Wave 4D) ─────────────────────────────────────────────

/**
 * Read all metrics events from the sandboxed HOME.
 * Returns [] if no metrics file exists.
 */
export function readMetricsEvents(home) {
  const path = join(home, ".sisyphus", "metrics", "gate-events.jsonl");
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

/**
 * Remove the metrics file from the sandboxed HOME.
 * Useful at the start of a metrics scenario for a clean slate.
 */
export function clearMetricsFile(home) {
  const path = join(home, ".sisyphus", "metrics", "gate-events.jsonl");
  if (existsSync(path)) unlinkSync(path);
}
