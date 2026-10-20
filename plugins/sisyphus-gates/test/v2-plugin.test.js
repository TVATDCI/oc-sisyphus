/**
 * test/v2-plugin.test.js — V2 setup(ctx) surface tests for the dual-export port.
 *
 * The V1 `server()` path is covered by the existing suite (untouched,
 * must stay green — that IS the V1 byte-equivalence proof). This file
 * covers the NEW V2 surface added in fm/oc-v2-adapt:
 *
 *   - dist entry exports the dual shape (named server + default
 *     definition carrying id/setup/server per the official dual-support
 *     form)
 *   - setup(ctx) registers the six mapped hooks on the right domains
 *   - each registered hook enforces the SAME gates.js decisions the V1
 *     hook object enforces (block on fail-closed, allow safe reads,
 *     sandbox-allow audit, permission escalation, compaction preserve,
 *     command wrapper + prompt net)
 *   - options resolution: ctx.options wins, opencode.json(c) fallback
 *     fills (2.1.0 auto-discovery delivers no options)
 *
 * Test framework: node:test (built-in), matching the repo pattern.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

import v2DefinitionDist from "../dist/index.js";
import { server as namedServer } from "../dist/index.js";
import { v2Definition, GATED_COMMAND_NAMES, readOptionsFromConfig, resolveOptions } from "../src/v2.js";
import { withTempHome, writeStateFile, removeStateFile, createMockState } from "./helpers.js";
import { clearWorkflowCache } from "../src/workflow-loader.js";
import { clearEvents } from "../src/metrics.js";
import { signVerdict } from "../src/verdict-signing.js";

const TEST_SIGN_KEY = "v2-port-test-key";

/**
 * Write real signed verdict files (prd + plan) under the temp HOME's
 * notepads tree so loadSignedVerdicts maps gate status from decisions.
 * Mirrors the fixture recipe from test/load-signed-verdicts.test.js.
 */
function writeSignedVerdicts(home, prdDecision, planDecision) {
  const sessionDir = join(home, ".sisyphus", "notepads", "ses_v2test");
  mkdirSync(sessionDir, { recursive: true });
  for (const [kind, decision] of [["prd", prdDecision], ["plan", planDecision]]) {
    const payload = {
      kind,
      decision,
      id: "v2-test-id",
      schema_version: "2.0.0",
      signed_at: "2026-10-20T12:00:00.000Z",
      sessionID: "ses_v2test",
      operator: "primary",
    };
    const sig = signVerdict(payload, TEST_SIGN_KEY);
    const fname = `momus-${kind}-review-2026-10-20T12-00-00-000Z.md`;
    writeFileSync(
      join(sessionDir, fname),
      `<!-- SISYPHUS_GATE ${JSON.stringify(payload)} -->\n` +
        `<!-- SISYPHUS_GATE_SIG ${JSON.stringify(sig)} -->\n`,
      "utf-8"
    );
  }
}

/** Options that arm verdict signing inside tests. */
const SIGNING_OPTIONS = { verdict_key_command: `echo ${TEST_SIGN_KEY}` };

/**
 * Mock V2 plugin context capturing registrations. Mirrors the domain
 * shapes from the official plugin reference: ctx.tool.hook,
 * ctx.permission.hook, ctx.session.hook, ctx.command.transform,
 * ctx.session.prompt, ctx.options, ctx.location.
 */
function makeMockCtx(overrides = {}) {
  const reg = {
    tool: {},
    permission: {},
    session: {},
    commandTransform: null,
    commands: [],
    prompts: [],
  };
  const ctx = {
    options: overrides.options ?? {},
    location: {
      directory: overrides.directory ?? "/nonexistent-config-dir",
      project: { id: "test-project", directory: "/tmp", canonical: "/tmp" },
    },
    tool: {
      async hook(name, cb) {
        reg.tool[name] = cb;
        return { dispose: async () => {} };
      },
    },
    permission: {
      async hook(name, cb) {
        reg.permission[name] = cb;
        return { dispose: async () => {} };
      },
    },
    session: {
      async hook(name, cb) {
        reg.session[name] = cb;
        return { dispose: async () => {} };
      },
      async prompt(input) {
        reg.prompts.push(input);
      },
    },
    command: {
      async transform(cb) {
        reg.commandTransform = cb;
        // Emulate the V2 CommandEditor: later add() with the same name
        // overrides the earlier registration (transform replay rule).
        return { dispose: async () => {} };
      },
    },
  };
  return { ctx, reg };
}

/** Boot the V2 definition against a mock ctx inside a temp HOME. */
async function bootV2(overrides = {}) {
  const mock = makeMockCtx(overrides);
  await v2Definition.setup(mock.ctx);
  if (mock.reg.commandTransform) {
    const editor = {
      add: (def) => mock.reg.commands.push(def),
    };
    mock.reg.commandTransform(editor);
  }
  return mock;
}

/** Read the recorded metrics jsonl (sandboxed HOME) as parsed lines. */
function readMetrics(home) {
  const path = join(home, ".sisyphus", "metrics", "gate-events.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

beforeEach(() => {
  clearEvents();
  clearWorkflowCache();
});

// ─── Dual-export shape ─────────────────────────────────────────────────────

test("dual export: default definition carries id + setup + server (official dual-support shape)", () => {
  assert.equal(v2DefinitionDist.id, "sisyphus-gates", "dist default is the V2 definition");
  assert.equal(v2Definition.id, "sisyphus-gates");
  assert.equal(typeof v2Definition.setup, "function");
  assert.equal(typeof v2Definition.server, "function");
  assert.equal(typeof namedServer, "function", "named server export must survive (V1 path)");
});

test("dual export: default.server() delegates to the untouched V1 implementation", async () => {
  await withTempHome(async () => {
    const hooks = await v2Definition.server({}, {});
    const expectedKeys = [
      "tool.execute.before",
      "command.execute.before",
      "experimental.chat.system.transform",
      "experimental.session.compacting",
      "tool.execute.after",
      "permission.ask",
    ].sort();
    assert.deepEqual(Object.keys(hooks).sort(), expectedKeys);
  });
});

// ─── setup() registration surface ──────────────────────────────────────────

test("setup registers all six mapped V2 surfaces", async () => {
  await withTempHome(async () => {
    const mock = await bootV2();
    assert.ok(mock.reg.tool["execute.before"], "tool execute.before registered");
    assert.ok(mock.reg.tool["execute.after"], "tool execute.after registered");
    assert.ok(mock.reg.permission["evaluate"], "permission evaluate registered");
    assert.ok(mock.reg.session["context"], "session context registered");
    assert.ok(mock.reg.session["compaction"], "session compaction registered");
    assert.ok(mock.reg.session["prompt"], "session prompt registered (command safety net)");
    assert.ok(mock.reg.commandTransform, "command transform registered");
    assert.equal(mock.reg.commands.length, GATED_COMMAND_NAMES.length);
    const names = mock.reg.commands.map((c) => c.name).sort();
    assert.deepEqual(names, [...GATED_COMMAND_NAMES].sort());
  });
});

// ─── tool execute.before parity ────────────────────────────────────────────

test("execute.before blocks a write when fail-closed (no state file) and annotates input", async () => {
  await withTempHome(async (home) => {
    removeStateFile(home);
    const mock = await bootV2();
    const event = {
      tool: "write",
      sessionID: "v2test-block-1",
      input: { filePath: "/tmp/v2test/out.md", content: "x" },
    };
    await assert.rejects(
      () => mock.reg.tool["execute.before"](event),
      (err) => {
        assert.match(err.message, /⛔ Gate blocked/);
        return true;
      },
      "must throw the enforcement error"
    );
    assert.match(event.input._sisyphus_gate_blocked, /State file missing|fail-closed/i);
    const events = readMetrics(home);
    assert.ok(events.some((e) => e.sessionID === "v2test-block-1" && e.reason),
      "block metric recorded");
  });
});

test("execute.before allows safe read-only bash even when fail-closed", async () => {
  await withTempHome(async (home) => {
    removeStateFile(home);
    const mock = await bootV2();
    const event = {
      tool: "bash",
      sessionID: "v2test-read-1",
      input: { command: "git status" },
    };
    await mock.reg.tool["execute.before"](event); // must not throw
    assert.equal(event.input._sisyphus_gate_blocked, undefined);
  });
});

test("execute.before records sandbox-allow audit when Layer 3.7 allows", async (t) => {
  await withTempHome(async (home) => {
    // Sandbox root inside the temp home so the test never depends on
    // machine-global /tmp state.
    const sandboxRoot = join(home, "sbx");
    mkdirSync(sandboxRoot, { recursive: true });
    const prevCwd = process.cwd();
    process.chdir(sandboxRoot);
    t.after(() => process.chdir(prevCwd));

    const mock = await bootV2({
      options: { sandbox_paths: [sandboxRoot + "/"], sandbox_allowed_commands: ["npm test"] },
    });
    const event = {
      tool: "bash",
      sessionID: "v2test-sbx-1",
      input: { command: "npm test" },
    };
    await mock.reg.tool["execute.before"](event); // must not throw
    const events = readMetrics(home);
    const allow = events.find((e) => e.event_subtype === "sandbox-allow");
    assert.ok(allow, "sandbox-allow metric recorded");
    assert.equal(allow.command, "npm test");
  });
});

// ─── tool execute.after parity ─────────────────────────────────────────────

test("execute.after advances the phase machine on output_contains", async () => {
  await withTempHome(async (home) => {
    writeStateFile(home, {
      phase: "prd-review",
      prd_gate: "PENDING",
      plan_gate: "PENDING",
      approval_status: "pending",
      prd_approved: false,
      plan_approved: false,
      evidence_logged: false,
      last_checkpoint: "prd-written",
    });
    const mock = await bootV2();
    await mock.reg.tool["execute.after"]({
      tool: "bash",
      sessionID: "v2test-after-1",
      input: { command: "echo 'PRD review PASS'" },
      status: "completed",
      result: { content: [{ type: "text", text: "PRD review PASS" }] },
    });
    const persisted = JSON.parse(readFileSync(join(home, ".sisyphus", "state.json"), "utf8"));
    assert.equal(persisted.phase, "issue-creation", "prd-review -> issue-creation on PRD review PASS");
    assert.equal(persisted.prd_gate, "PASS");
  });
});

// ─── permission evaluate parity ────────────────────────────────────────────

test("permission evaluate escalates non-read actions to ask during review phases", async () => {
  await withTempHome(async (home) => {
    writeStateFile(home, { phase: "prd-review" });
    const mock = await bootV2();
    const editEvent = { sessionID: "v2test-perm-1", action: "edit", resources: ["/tmp/x"], effect: "allow" };
    await mock.reg.permission["evaluate"](editEvent);
    assert.equal(editEvent.effect, "ask");
    const readEvent = { sessionID: "v2test-perm-1", action: "read", resources: ["/tmp/x"], effect: "allow" };
    await mock.reg.permission["evaluate"](readEvent);
    assert.equal(readEvent.effect, "allow", "read actions stay unescalated");
  });
});

test("permission evaluate leaves execution-phase actions alone", async () => {
  await withTempHome(async (home) => {
    writeStateFile(home, { phase: "execution" });
    const mock = await bootV2();
    const event = { sessionID: "v2test-perm-2", action: "edit", resources: ["/tmp/x"], effect: "allow" };
    await mock.reg.permission["evaluate"](event);
    assert.equal(event.effect, "allow");
  });
});

// ─── session context parity (metrics-only, like V1) ────────────────────────

test("context hook records gate-status metric when a gate FAILED and state file exists", async () => {
  await withTempHome(async (home) => {
    writeSignedVerdicts(home, "FAIL", "PASS");
    writeStateFile(home, {
      phase: "execution",
      approval_status: "approved",
    });
    const mock = await bootV2({ options: SIGNING_OPTIONS });
    await mock.reg.session["context"]({ sessionID: "v2test-ctx-1", system: [], messages: [] });
    const events = readMetrics(home);
    assert.ok(
      events.some((e) => e.tool === "system-transform" && /gate-status-rendered/.test(e.reason)),
      "gate-status-rendered metric recorded"
    );
  });
});

// ─── session compaction parity ─────────────────────────────────────────────

test("compaction injects the preserve-gate-state system part when checkpoint is not allowed", async () => {
  await withTempHome(async (home) => {
    writeStateFile(home, {
      phase: "prd-writing",
    });
    const mock = await bootV2({ options: SIGNING_OPTIONS });
    // Drive lastCheckpoint off the allowed list the same way production
    // does: a file_write transition (prd-writing -> prd-review sets
    // last_checkpoint "prd-written", which compaction must guard).
    await mock.reg.tool["execute.after"]({
      tool: "write",
      sessionID: "v2test-comp-1",
      input: { filePath: join(home, "repo", "docs", "prd.md") },
      status: "completed",
      result: "wrote prd",
    });
    const event = { sessionID: "v2test-comp-1", system: [], messages: [] };
    await mock.reg.session["compaction"](event);
    assert.equal(event.system.length, 1);
    assert.match(event.system[0].text, /CRITICAL: Preserve gate state/);
    assert.match(event.system[0].text, /prd-review|prd-writing/);
  });
});

test("compaction injects nothing at an allowed checkpoint", async () => {
  await withTempHome(async (home) => {
    writeStateFile(home, { phase: "execution", last_checkpoint: "plan-approved" });
    const mock = await bootV2();
    const event = { sessionID: "v2test-comp-2", system: [], messages: [] };
    await mock.reg.session["compaction"](event);
    assert.equal(event.system.length, 0);
  });
});

// ─── command wrapper (command.execute.before replacement) ──────────────────

test("command wrapper blocks 'git commit' when fail-closed and records the metric", async () => {
  await withTempHome(async (home) => {
    removeStateFile(home);
    const mock = await bootV2();
    const wrapper = mock.reg.commands.find((c) => c.name === "git commit");
    assert.ok(wrapper, "git commit wrapper registered");
    await assert.rejects(
      () => wrapper.execute({
        sessionID: "v2test-cmd-1",
        prompt: { text: "commit the work" },
        delivery: "steer",
      }),
      (err) => {
        assert.match(err.message, /⛔ Gate blocked/);
        return true;
      }
    );
    const events = readMetrics(home);
    assert.ok(events.some((e) => e.tool === "command" && e.command === "git commit"),
      "command block metric recorded");
  });
});

test("command wrapper forwards to session.prompt when the gate allows", async () => {
  await withTempHome(async (home) => {
    writeSignedVerdicts(home, "PASS", "PASS");
    writeStateFile(home, {
      phase: "execution",
      approval_status: "approved",
      evidence_logged: true,
      last_checkpoint: "plan-approved",
    });
    const mock = await bootV2({ options: SIGNING_OPTIONS });
    const wrapper = mock.reg.commands.find((c) => c.name === "git commit");
    await wrapper.execute({
      sessionID: "v2test-cmd-2",
      prompt: { text: "commit the work" },
      delivery: "queue",
    });
    assert.equal(mock.reg.prompts.length, 1, "forwarded exactly one prompt");
    assert.equal(mock.reg.prompts[0].text, "commit the work");
    assert.equal(mock.reg.prompts[0].delivery, "queue");
    assert.equal(mock.reg.prompts[0].sessionID, "v2test-cmd-2");
  });
});

// ─── prompt-hook safety net ────────────────────────────────────────────────

test("prompt net blocks admission when metadata identifies a gated command out of phase", async () => {
  await withTempHome(async (home) => {
    removeStateFile(home);
    const mock = await bootV2();
    const event = {
      sessionID: "v2test-net-1",
      prompt: { text: "close the bead" },
      metadata: { command: "bd close" },
      delivery: "steer",
    };
    await assert.rejects(
      () => mock.reg.session["prompt"](event),
      (err) => {
        assert.match(err.message, /⛔ Gate blocked/);
        return true;
      }
    );
  });
});

test("prompt net is inert when metadata carries no command identity", async () => {
  await withTempHome(async (home) => {
    removeStateFile(home);
    const mock = await bootV2();
    const event = {
      sessionID: "v2test-net-2",
      prompt: { text: "hello" },
      metadata: {},
      delivery: "steer",
    };
    await mock.reg.session["prompt"](event); // must not throw
  });
});

// ─── options resolution (2.1.0 auto-discovery delivers no ctx.options) ─────

test("readOptionsFromConfig parses the V1 tuple form", async () => {
  await withTempHome(async (home) => {
    const dir = join(home, "cfg");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "opencode.json"), JSON.stringify({
      plugin: [
        ["./plugins/sisyphus-gates", { verdict_key_command: "cat key", sandbox_paths: ["/tmp/"] }],
      ],
    }));
    const opts = readOptionsFromConfig(dir);
    assert.equal(opts.verdict_key_command, "cat key");
    assert.deepEqual(opts.sandbox_paths, ["/tmp/"]);
  });
});

test("readOptionsFromConfig parses the V2 object form and tolerates .jsonc comments", async () => {
  await withTempHome(async (home) => {
    const dir = join(home, "cfg2");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "opencode.jsonc"), [
      "// fleet config (comment tolerated)",
      "{",
      "  \"plugins\": [",
      "    { \"package\": \"./plugins/sisyphus-gates\", \"options\": { \"verdict_key_command\": \"cat k2\" } }",
      "  ]",
      "}",
    ].join("\n"));
    const opts = readOptionsFromConfig(dir);
    assert.equal(opts.verdict_key_command, "cat k2");
  });
});

test("resolveOptions: ctx.options wins per key over the config fallback", async () => {
  await withTempHome(async (home) => {
    const dir = join(home, "cfg3");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "opencode.json"), JSON.stringify({
      plugin: [["./plugins/sisyphus-gates", { verdict_key_command: "cat config", sandbox_paths: ["/tmp/"] }]],
    }));
    const merged = resolveOptions({
      options: { verdict_key_command: "cat host" },
      location: { directory: dir },
    });
    assert.equal(merged.verdict_key_command, "cat host", "host-delivered option wins");
    assert.deepEqual(merged.sandbox_paths, ["/tmp/"], "config fallback fills missing keys");
  });
});

test("resolveOptions: empty ctx.options falls back to config entirely", async () => {
  await withTempHome(async (home) => {
    const dir = join(home, "cfg4");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "opencode.json"), JSON.stringify({
      plugin: [["./plugins/sisyphus-gates", { verdict_key_command: "cat cfg" }]],
    }));
    const merged = resolveOptions({ options: {}, location: { directory: dir } });
    assert.equal(merged.verdict_key_command, "cat cfg");
  });
});

// resultToText tolerance across observed V2 result shapes
test("resultToText handles string, content-string, and content-parts shapes", async () => {
  await withTempHome(async () => {
    const { } = { };
    const mod = await import("../src/v2.js");
    assert.equal(mod.resultToText("plain"), "plain");
    assert.equal(mod.resultToText({ content: "str" }), "str");
    assert.equal(
      mod.resultToText({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }),
      "a\nb"
    );
    assert.equal(mod.resultToText(null), "");
    assert.equal(mod.resultToText(undefined), "");
  });
});
