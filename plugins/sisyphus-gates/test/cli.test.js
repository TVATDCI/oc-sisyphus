/**
 * test/cli.test.js — full coverage for the operator signing CLI (cli.js).
 *
 * Tests parseArgs, resolveKeyCommand, cmdSignVerdict, and cmdApprove
 * directly (no subprocess spawning). Uses withTempHome for disk isolation
 * and process.env.SISYPHUS_VERDICT_KEY_COMMAND for HMAC key resolution
 * without touching state.js's module-level setMemoryKey.
 *
 * Cross-module integration: verifies that artifacts written by the CLI
 * are readable by loadSignedVerdicts from src/review-scanner.js — the
 * load-bearing security property that CLI artifacts land on the homedir
 * path that the scanner reads.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { parseArgs, resolveKeyCommand, cmdSignVerdict, cmdApprove } from "../cli.js";
import { loadSignedVerdicts, _internal as scannerInternal } from "../src/review-scanner.js";
import { verifyVerdict } from "../src/verdict-signing.js";
import { withTempHome } from "./helpers.js";

const TEST_KEY = "test-key-do-not-use-in-prod";
const TEST_KEY_COMMAND = "echo test-key-do-not-use-in-prod";

// ─── Helpers ─────────────────────────────────────────────────────────────────

class ExitError extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.name = "ExitError";
    this.exitCode = code;
  }
}

function withExitMock(fn) {
  const origExit = process.exit;
  process.exit = (code) => { throw new ExitError(code); };
  try {
    return fn();
  } finally {
    process.exit = origExit;
  }
}

function expectExit(code, fn) {
  assert.throws(
    () => withExitMock(fn),
    (err) => err instanceof ExitError && err.exitCode === code,
    `Expected process.exit(${code})`
  );
}

function captureOutput(fn) {
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);
  let stdout = "";
  let stderr = "";
  process.stdout.write = (chunk) => { stdout += chunk; return true; };
  process.stderr.write = (chunk) => { stderr += chunk; return true; };
  try {
    fn();
  } finally {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
  }
  return { stdout, stderr };
}

function readState(home) {
  const p = join(home, ".sisyphus", "state.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

function findArtifacts(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.includes(pattern));
}

function parseGateBlocks(content) {
  const gateMatch = content.match(/SISYPHUS_GATE\s+(\{[\s\S]*?\})\s*-->/);
  const sigMatch = content.match(/SISYPHUS_GATE_SIG\s+(\{[\s\S]*?\})\s*-->/);
  return {
    payload: gateMatch ? JSON.parse(gateMatch[1]) : null,
    sig: sigMatch ? JSON.parse(sigMatch[1]) : null,
  };
}

function parseApproveBlocks(content) {
  const approveMatch = content.match(/SISYPHUS_APPROVE\s+(\{[\s\S]*?\})\s*-->/);
  const sigMatch = content.match(/SISYPHUS_APPROVE_SIG\s+(\{[\s\S]*?\})\s*-->/);
  return {
    payload: approveMatch ? JSON.parse(approveMatch[1]) : null,
    sig: sigMatch ? JSON.parse(sigMatch[1]) : null,
  };
}

function defaultOpts(overrides = {}) {
  return { keyCommand: null, cwd: null, dryRun: false, help: false, ...overrides };
}

// ─── Global setup/teardown ──────────────────────────────────────────────────

beforeEach(() => {
  process.env.SISYPHUS_VERDICT_KEY_COMMAND = TEST_KEY_COMMAND;
});

afterEach(() => {
  delete process.env.SISYPHUS_VERDICT_KEY_COMMAND;
});

// ─── parseArgs unit tests ───────────────────────────────────────────────────

describe("parseArgs", () => {
  test("--key-command <cmd> sets opts.keyCommand", () => {
    const { opts } = parseArgs(["node", "cli.js", "--key-command", "echo secret"]);
    assert.equal(opts.keyCommand, "echo secret");
  });

  test("--cwd <path> sets opts.cwd", () => {
    const { opts } = parseArgs(["node", "cli.js", "--cwd", "/tmp/work"]);
    assert.equal(opts.cwd, "/tmp/work");
  });

  test("--dry-run sets opts.dryRun = true", () => {
    const { opts } = parseArgs(["node", "cli.js", "--dry-run"]);
    assert.equal(opts.dryRun, true);
  });

  test("-h sets opts.help = true", () => {
    const { opts } = parseArgs(["node", "cli.js", "-h"]);
    assert.equal(opts.help, true);
  });

  test("--help sets opts.help = true", () => {
    const { opts } = parseArgs(["node", "cli.js", "--help"]);
    assert.equal(opts.help, true);
  });

  test("positional arguments accumulate in order", () => {
    const { positional } = parseArgs(["node", "cli.js", "sign-verdict", "plan", "id-1", "PASS"]);
    assert.deepEqual(positional, ["sign-verdict", "plan", "id-1", "PASS"]);
  });

  test("multiple flags combine with positionals", () => {
    const { opts, positional } = parseArgs([
      "node", "cli.js", "--dry-run", "sign-verdict",
      "--key-command", "echo k", "plan", "id-1", "PASS",
    ]);
    assert.equal(opts.dryRun, true);
    assert.equal(opts.keyCommand, "echo k");
    assert.deepEqual(positional, ["sign-verdict", "plan", "id-1", "PASS"]);
  });

  test("defaults: no flags → all opts null/false, positional empty", () => {
    const { opts, positional } = parseArgs(["node", "cli.js"]);
    assert.equal(opts.keyCommand, null);
    assert.equal(opts.cwd, null);
    assert.equal(opts.dryRun, false);
    assert.equal(opts.help, false);
    assert.deepEqual(positional, []);
  });

  test("--key-command without value → exit code 2", () => {
    expectExit(2, () => parseArgs(["node", "cli.js", "--key-command"]));
  });

  test("--cwd without value → exit code 2", () => {
    expectExit(2, () => parseArgs(["node", "cli.js", "--cwd"]));
  });

  test("unknown --option → exit code 2", () => {
    expectExit(2, () => parseArgs(["node", "cli.js", "--unknown-flag"]));
  });
});

// ─── resolveKeyCommand tests ────────────────────────────────────────────────

describe("resolveKeyCommand", () => {
  test("--key-command flag takes priority over env var", () => {
    const result = resolveKeyCommand({ keyCommand: "echo flag-wins" });
    assert.equal(result, "echo flag-wins");
  });

  test("env var takes priority over opencode.json config", async () => {
    await withTempHome(async (home) => {
      const configDir = join(home, ".config", "opencode");
      mkdirSync(configDir, { recursive: true });
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(configDir, "opencode.json"), JSON.stringify({
        plugin: [["sisyphus-gates", { verdict_key_command: "echo from-config" }]],
      }));
      const result = resolveKeyCommand({ keyCommand: null });
      assert.equal(result, TEST_KEY_COMMAND);
    });
  });

  test("opencode.json config used when no flag or env", async () => {
    await withTempHome(async (home) => {
      delete process.env.SISYPHUS_VERDICT_KEY_COMMAND;
      const configDir = join(home, ".config", "opencode");
      mkdirSync(configDir, { recursive: true });
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(configDir, "opencode.json"), JSON.stringify({
        plugin: [["sisyphus-gates", { verdict_key_command: "echo from-config" }]],
      }));
      const result = resolveKeyCommand({ keyCommand: null });
      assert.equal(result, "echo from-config");
    });
  });

  test("opencode.json.full takes priority over opencode.json", async () => {
    await withTempHome(async (home) => {
      delete process.env.SISYPHUS_VERDICT_KEY_COMMAND;
      const configDir = join(home, ".config", "opencode");
      mkdirSync(configDir, { recursive: true });
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(configDir, "opencode.json.full"), JSON.stringify({
        plugin: [["sisyphus-gates", { verdict_key_command: "echo from-full" }]],
      }));
      writeFileSync(join(configDir, "opencode.json"), JSON.stringify({
        plugin: [["sisyphus-gates", { verdict_key_command: "echo from-regular" }]],
      }));
      const result = resolveKeyCommand({ keyCommand: null });
      assert.equal(result, "echo from-full");
    });
  });

  test("falls back to default when nothing is set", async () => {
    await withTempHome(async () => {
      delete process.env.SISYPHUS_VERDICT_KEY_COMMAND;
      const result = resolveKeyCommand({ keyCommand: null });
      assert.equal(result, "cat ~/.local/share/sisyphus-gate-key");
    });
  });
});

// ─── cmdSignVerdict integration tests ───────────────────────────────────────

describe("cmdSignVerdict", () => {
  test("prd PASS: artifact written, state mutated (phase=issue-creation, prd_gate=PASS), audit log written", async () => {
    await withTempHome(async (home) => {
      const cliDir = join(home, ".sisyphus", "notepads", "cli");

      captureOutput(() => {
        cmdSignVerdict(["prd", "test-prd-001", "PASS"], defaultOpts());
      });

      const artifacts = findArtifacts(cliDir, "momus-prd-review-");
      assert.equal(artifacts.length, 1, "one prd artifact should exist");
      const content = readFileSync(join(cliDir, artifacts[0]), "utf-8");
      assert.match(content, /SISYPHUS_GATE/);
      assert.match(content, /SISYPHUS_GATE_SIG/);

      const state = readState(home);
      assert.ok(state, "state.json should exist");
      assert.equal(state.phase, "issue-creation");
      assert.equal(state.prd_gate, "PASS");
      assert.equal(state.prd_id, "test-prd-001");

      const auditPath = join(home, ".config", "sisyphus-verdicts.log");
      assert.ok(existsSync(auditPath), "audit log should exist");
      const log = readFileSync(auditPath, "utf-8");
      assert.match(log, /kind=prd.*id=test-prd-001.*decision=PASS.*result=SUCCESS/);
    });
  });

  test("plan PASS: artifact written, state mutated (plan_gate=PASS, plan_id set), audit log written", async () => {
    await withTempHome(async (home) => {
      const cliDir = join(home, ".sisyphus", "notepads", "cli");

      captureOutput(() => {
        cmdSignVerdict(["plan", "test-plan-001", "PASS"], defaultOpts());
      });

      const artifacts = findArtifacts(cliDir, "momus-plan-review-");
      assert.equal(artifacts.length, 1);

      const state = readState(home);
      assert.ok(state);
      assert.equal(state.plan_gate, "PASS");
      assert.equal(state.plan_id, "test-plan-001");

      const auditPath = join(home, ".config", "sisyphus-verdicts.log");
      const log = readFileSync(auditPath, "utf-8");
      assert.match(log, /kind=plan.*id=test-plan-001.*decision=PASS.*result=SUCCESS/);
    });
  });

  test("FAIL decision: artifact written, state NOT mutated", async () => {
    await withTempHome(async (home) => {
      const cliDir = join(home, ".sisyphus", "notepads", "cli");

      captureOutput(() => {
        cmdSignVerdict(["plan", "fail-001", "FAIL"], defaultOpts());
      });

      const artifacts = findArtifacts(cliDir, "momus-plan-review-");
      assert.equal(artifacts.length, 1, "FAIL artifact should exist");
      const content = readFileSync(join(cliDir, artifacts[0]), "utf-8");
      assert.match(content, /"decision":"FAIL"/);

      assert.equal(readState(home), null, "no state.json — writePersistentState not called for FAIL");
    });
  });

  test("WARN decision: artifact written, state NOT mutated", async () => {
    await withTempHome(async (home) => {
      const cliDir = join(home, ".sisyphus", "notepads", "cli");

      captureOutput(() => {
        cmdSignVerdict(["plan", "warn-001", "WARN"], defaultOpts());
      });

      const artifacts = findArtifacts(cliDir, "momus-plan-review-");
      assert.equal(artifacts.length, 1);
      const content = readFileSync(join(cliDir, artifacts[0]), "utf-8");
      assert.match(content, /"decision":"WARN"/);

      assert.equal(readState(home), null, "no state.json — writePersistentState not called for WARN");
    });
  });

  test("invalid kind 'blob' → exit code 2", async () => {
    await withTempHome(async () => {
      expectExit(2, () => cmdSignVerdict(["blob", "id", "PASS"], defaultOpts()));
    });
  });

  test("invalid decision 'MAYBE' → exit code 2", async () => {
    await withTempHome(async () => {
      expectExit(2, () => cmdSignVerdict(["plan", "id", "MAYBE"], defaultOpts()));
    });
  });

  test("missing args (no kind/id/decision) → exit code 2", async () => {
    await withTempHome(async () => {
      expectExit(2, () => cmdSignVerdict([], defaultOpts()));
    });
  });

  test("--dry-run: NO artifact written, NO state mutation, stdout has [dry-run]", async () => {
    await withTempHome(async (home) => {
      const cliDir = join(home, ".sisyphus", "notepads", "cli");

      const { stdout } = captureOutput(() => {
        cmdSignVerdict(["plan", "dry-001", "PASS"], defaultOpts({ dryRun: true }));
      });

      assert.ok(
        !existsSync(cliDir) || findArtifacts(cliDir, "momus-").length === 0,
        "no artifacts in dry-run mode"
      );
      assert.equal(readState(home), null, "no state mutation in dry-run");
      assert.match(stdout, /\[dry-run\]/);
    });
  });

  test("--dry-run for prd PASS: stdout describes would-be state mutation", async () => {
    await withTempHome(async () => {
      const { stdout } = captureOutput(() => {
        cmdSignVerdict(["prd", "dry-prd-001", "PASS"], defaultOpts({ dryRun: true }));
      });
      assert.match(stdout, /\[dry-run\].*prd_gate=PASS/s);
      assert.match(stdout, /phase=issue-creation/);
    });
  });
});

// ─── cmdApprove integration tests ───────────────────────────────────────────

describe("cmdApprove", () => {
  test("happy path: approval artifact written, state advanced (phase=execution, approval=approved), audit log written", async () => {
    await withTempHome(async (home) => {
      const cliDir = join(home, ".sisyphus", "notepads", "cli");

      captureOutput(() => {
        cmdApprove(["plan-approve-001"], defaultOpts());
      });

      const artifacts = findArtifacts(cliDir, "momus-plan-approval-");
      assert.equal(artifacts.length, 1);
      const content = readFileSync(join(cliDir, artifacts[0]), "utf-8");
      assert.match(content, /SISYPHUS_APPROVE/);
      assert.match(content, /SISYPHUS_APPROVE_SIG/);

      const state = readState(home);
      assert.ok(state);
      assert.equal(state.phase, "execution");
      assert.equal(state.approval_status, "approved");
      assert.equal(state.plan_id, "plan-approve-001");

      const auditPath = join(home, ".config", "sisyphus-approvals.log");
      assert.ok(existsSync(auditPath));
      const log = readFileSync(auditPath, "utf-8");
      assert.match(log, /plan_id=plan-approve-001.*result=SUCCESS/);
    });
  });

  test("missing planId → exit code 2", async () => {
    await withTempHome(async () => {
      expectExit(2, () => cmdApprove([], defaultOpts()));
    });
  });

  test("--dry-run: NO artifact written, NO state mutation, stdout has [dry-run]", async () => {
    await withTempHome(async (home) => {
      const cliDir = join(home, ".sisyphus", "notepads", "cli");

      const { stdout } = captureOutput(() => {
        cmdApprove(["dry-approve-001"], defaultOpts({ dryRun: true }));
      });

      assert.ok(
        !existsSync(cliDir) || findArtifacts(cliDir, "momus-").length === 0,
        "no artifacts in dry-run mode"
      );
      assert.equal(readState(home), null);
      assert.match(stdout, /\[dry-run\]/);
    });
  });
});

// ─── Key resolution failure ─────────────────────────────────────────────────

describe("key resolution failure", () => {
  test("cmdSignVerdict with bad key command → exit code 3", async () => {
    await withTempHome(async () => {
      process.env.SISYPHUS_VERDICT_KEY_COMMAND = "nonexistent-cli-binary-xyz";
      expectExit(3, () => cmdSignVerdict(["plan", "id", "PASS"], defaultOpts()));
    });
  });

  test("cmdApprove with bad key command → exit code 3", async () => {
    await withTempHome(async () => {
      process.env.SISYPHUS_VERDICT_KEY_COMMAND = "nonexistent-cli-binary-xyz";
      expectExit(3, () => cmdApprove(["plan-id"], defaultOpts()));
    });
  });
});

// ─── Cross-module integration ───────────────────────────────────────────────

describe("cross-module integration", () => {
  test("loadSignedVerdicts reads and verifies CLI-written plan verdict (HMAC round-trip)", async () => {
    await withTempHome(async () => {
      captureOutput(() => {
        cmdSignVerdict(["plan", "cross-check-id", "PASS"], defaultOpts());
      });

      scannerInternal.resetBaseDir();
      const result = loadSignedVerdicts("plan", "cross-check-id", TEST_KEY);
      assert.equal(result.gate, "PASS");
      assert.equal(result.id, "cross-check-id");
      assert.equal(result.valid, true);
    });
  });

  test("loadSignedVerdicts reads and verifies CLI-written prd verdict", async () => {
    await withTempHome(async () => {
      captureOutput(() => {
        cmdSignVerdict(["prd", "cross-prd-id", "PASS"], defaultOpts());
      });

      scannerInternal.resetBaseDir();
      const result = loadSignedVerdicts("prd", "cross-prd-id", TEST_KEY);
      assert.equal(result.gate, "PASS");
      assert.equal(result.id, "cross-prd-id");
      assert.equal(result.valid, true);
    });
  });

  test("loadSignedVerdicts reads CLI-written FAIL verdict (audit trail)", async () => {
    await withTempHome(async () => {
      captureOutput(() => {
        cmdSignVerdict(["plan", "cross-fail-id", "FAIL"], defaultOpts());
      });

      scannerInternal.resetBaseDir();
      const result = loadSignedVerdicts("plan", "cross-fail-id", TEST_KEY);
      assert.equal(result.gate, "FAIL");
      assert.equal(result.id, "cross-fail-id");
      assert.equal(result.valid, true);
    });
  });

  test("approval artifact HMAC round-trips via verifyVerdict", async () => {
    await withTempHome(async (home) => {
      const cliDir = join(home, ".sisyphus", "notepads", "cli");

      captureOutput(() => {
        cmdApprove(["approval-roundtrip"], defaultOpts());
      });

      const artifacts = findArtifacts(cliDir, "momus-plan-approval-");
      assert.equal(artifacts.length, 1);
      const content = readFileSync(join(cliDir, artifacts[0]), "utf-8");

      const { payload, sig } = parseApproveBlocks(content);
      assert.ok(payload, "payload must be present");
      assert.ok(sig, "signature must be present");
      assert.equal(
        verifyVerdict(payload, sig, TEST_KEY),
        true,
        "approval HMAC must verify with the same key"
      );
      assert.equal(payload.decision, "approved");
      assert.equal(payload.plan_id, "approval-roundtrip");
      assert.equal(payload.schema_version, "1.0.0");
    });
  });

  test("path alignment invariant: artifact lands in homedir notepads/cli/, NOT cwd", async () => {
    await withTempHome(async (home) => {
      const subdir = join(home, "subdir");
      mkdirSync(subdir, { recursive: true });
      const origCwd = process.cwd();
      process.chdir(subdir);
      try {
        captureOutput(() => {
          cmdSignVerdict(["plan", "path-align-id", "PASS"], defaultOpts());
        });

        const homeCliDir = join(home, ".sisyphus", "notepads", "cli");
        const cwdCliDir = join(subdir, ".sisyphus", "notepads", "cli");

        const homeArtifacts = findArtifacts(homeCliDir, "momus-plan-review-");
        assert.ok(
          homeArtifacts.length >= 1,
          "artifact must be in homedir-based notepads/cli/"
        );
        assert.ok(
          !existsSync(cwdCliDir),
          "artifact must NOT land in cwd-based path"
        );
      } finally {
        process.chdir(origCwd);
      }
    });
  });

  test("verdict artifact payload matches expected schema (kind, decision, id, schema_version, sessionID=cli)", async () => {
    await withTempHome(async (home) => {
      const cliDir = join(home, ".sisyphus", "notepads", "cli");

      captureOutput(() => {
        cmdSignVerdict(["plan", "schema-check-id", "PASS"], defaultOpts());
      });

      const artifacts = findArtifacts(cliDir, "momus-plan-review-");
      assert.equal(artifacts.length, 1);
      const content = readFileSync(join(cliDir, artifacts[0]), "utf-8");
      const { payload } = parseGateBlocks(content);

      assert.equal(payload.kind, "plan");
      assert.equal(payload.decision, "PASS");
      assert.equal(payload.id, "schema-check-id");
      assert.equal(payload.schema_version, "2.0.0");
      assert.equal(payload.sessionID, "cli");
      assert.equal(payload.operator, "primary");
    });
  });
});
