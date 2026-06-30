/**
 * test/session-close-cli-subprocess.test.js — Phase 1.5 regression test.
 *
 * Spawns `node cli.js protocol <action> session-close` as a real subprocess
 * and verifies the state transition lands in state.json. Catches the exact
 * gap that shipped in Phase 1: cmdProtocol was exported and unit-tested but
 * NOT wired into the main() dispatch, so `node cli.js protocol ...` was a
 * no-op despite tests 7-8 in session-close-gate.test.js passing.
 *
 * These tests would have failed pre-Phase-1.5 (dispatch fell through to the
 * `default:` branch which calls fail() → exit 2). They pass once Patch 2 of
 * patch-cli-protocol.mjs is applied.
 *
 * Test framework: node:test
 * Run: `npm test` or `node --test test/session-close-cli-subprocess.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const PLUGIN_ROOT = resolve(import.meta.dirname, "..");
const CLI_PATH = join(PLUGIN_ROOT, "cli.js");
const TEST_KEY_COMMAND = "echo test-key-do-not-use-in-prod";

/**
 * Spawn the CLI in a sandboxed temp HOME with a seed state, return the
 * resulting state (or null if state.json wasn't created/written).
 *
 * Mirrors the sandbox layout used by test/helpers.js withTempHome so
 * writePersistentState resolves to ${HOME}/.sisyphus/state.json.
 */
function runCliWithTempHome(args, seedState = null) {
  const home = mkdtempSync(join(tmpdir(), "sisyphus-cli-subprocess-"));
  mkdirSync(join(home, ".sisyphus"), { recursive: true });
  mkdirSync(join(home, ".sisyphus", "evidence"), { recursive: true });
  mkdirSync(join(home, ".config", "opencode", ".sisyphus"), { recursive: true });

  if (seedState !== null) {
    writeFileSync(
      join(home, ".sisyphus", "state.json"),
      JSON.stringify({ schema_version: "3.0.0", ...seedState }, null, 2)
    );
  }

  let exitCode = 0;
  let stdout = "";
  let stderr = "";
  try {
    stdout = execFileSync(process.execPath, [CLI_PATH, ...args], {
      env: {
        ...process.env,
        HOME: home,
        SISYPHUS_VERDICT_KEY_COMMAND: TEST_KEY_COMMAND,
      },
      cwd: home,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    });
  } catch (err) {
    exitCode = err.status ?? 1;
    stdout = err.stdout?.toString() ?? "";
    stderr = err.stderr?.toString() ?? "";
  }

  const statePath = join(home, ".sisyphus", "state.json");
  const state = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf-8"))
    : null;

  // Cleanup (best-effort).
  try {
    rmSync(home, { recursive: true, force: true });
  } catch {
    // ignore
  }

  return { state, exitCode, stdout, stderr };
}

describe("Session-close CLI subprocess (Phase 1.5 regression)", () => {
  test("protocol start session-close → state.session_close.status === 'open'", () => {
    const { state, exitCode, stderr } = runCliWithTempHome([
      "protocol", "start", "session-close",
    ]);

    assert.equal(exitCode, 0, `CLI exited ${exitCode}; stderr: ${stderr}`);
    assert.ok(state, "state.json must be written by the CLI invocation");
    assert.equal(
      state.session_close?.status,
      "open",
      "status must transition to 'open' after start"
    );
    assert.ok(
      state.session_close?.started_at,
      "started_at must be set to an ISO timestamp"
    );
  });

  test("protocol complete session-close → state.session_close.status === 'complete'", () => {
    const { state, exitCode, stderr } = runCliWithTempHome(
      ["protocol", "complete", "session-close"],
      {
        session_close: {
          status: "open",
          started_at: "2026-06-30T00:00:00.000Z",
        },
      }
    );

    assert.equal(exitCode, 0, `CLI exited ${exitCode}; stderr: ${stderr}`);
    assert.ok(state, "state.json must exist (seeded)");
    assert.equal(state.session_close?.status, "complete");
    assert.ok(
      state.session_close?.completed_at,
      "completed_at must be set to an ISO timestamp"
    );
    // Audit-trail invariant: completing must preserve started_at.
    assert.equal(
      state.session_close?.started_at,
      "2026-06-30T00:00:00.000Z",
      "started_at must survive the complete transition"
    );
  });

  test("protocol override session-close --reason X → status 'overridden' + reason recorded", () => {
    const { state, exitCode, stderr } = runCliWithTempHome(
      [
        "protocol", "override", "session-close",
        "--reason", "quick typo fix",
      ],
      {
        session_close: {
          status: "open",
          started_at: "2026-06-30T00:00:00.000Z",
        },
      }
    );

    assert.equal(exitCode, 0, `CLI exited ${exitCode}; stderr: ${stderr}`);
    assert.ok(state);
    assert.equal(state.session_close?.status, "overridden");
    assert.equal(
      state.session_close?.override_reason,
      "quick typo fix",
      "override_reason must match the --reason flag value"
    );
    assert.ok(
      state.session_close?.override_at,
      "override_at must be set to an ISO timestamp"
    );
  });

  test("protocol override WITHOUT --reason → exits non-zero, state unchanged", () => {
    const seed = {
      session_close: {
        status: "open",
        started_at: "2026-06-30T00:00:00.000Z",
      },
    };
    const { state, exitCode } = runCliWithTempHome(
      ["protocol", "override", "session-close"],
      seed
    );

    assert.notEqual(exitCode, 0, "override without --reason must exit non-zero");
    // State must be unchanged (seeded status preserved, no write happened).
    assert.equal(
      state?.session_close?.status,
      "open",
      "seeded state must be preserved when override fails validation"
    );
    assert.equal(
      state?.session_close?.override_reason,
      undefined,
      "no override_reason must be recorded when validation fails"
    );
  });

  test("protocol unknown-action → exits non-zero with usage error", () => {
    // Confirms the dispatch IS reaching cmdProtocol (which validates action).
    // Pre-Phase-1.5 this test would also exit non-zero, but via the
    // `default:` branch ("Unknown subcommand: protocol") — different code
    // path. Post-Phase-1.5 it reaches cmdProtocol's action validation.
    const { exitCode, stderr } = runCliWithTempHome([
      "protocol", "frobnicate", "session-close",
    ]);

    assert.notEqual(exitCode, 0, "unknown action must exit non-zero");
    assert.match(
      stderr,
      /Unknown protocol action/,
      "stderr must come from cmdProtocol's action validation (proves dispatch is wired)"
    );
  });

  test("regression: sign-verdict still routes to cmdSignVerdict", () => {
    // Guards against Patch 2 accidentally breaking the existing dispatch
    // (the original Phase 1 wiring attempt reportedly broke cmdApprove).
    const { stderr } = runCliWithTempHome([
      "sign-verdict", "plan", "subprocess-test", "PASS",
    ]);

    assert.doesNotMatch(
      stderr,
      /Unknown subcommand/,
      "sign-verdict must still route to cmdSignVerdict (Patch 2 must not break existing dispatch)"
    );
  });

  test("regression: approve still routes to cmdApprove", () => {
    const { stderr } = runCliWithTempHome([
      "approve", "subprocess-test-plan",
    ]);

    assert.doesNotMatch(
      stderr,
      /Unknown subcommand/,
      "approve must still route to cmdApprove (Patch 2 must not break existing dispatch)"
    );
  });
});
