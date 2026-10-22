/**
 * test/registry-guard.test.js — P1-b silent-default guard tests.
 *
 * Covers the two fleet-side mitigations added in fm/backlog-impl:
 *   - the module's pure helpers (configured set collection, guard
 *     verdicts, divergence reporting) against real temp config trees
 *   - the v2.js execute.before wiring: unregistered agent labels and
 *     subagent spawn types are REFUSED loudly; configured and built-in
 *     names pass through to the normal gates; label-less events pass
 *   - the one-time startup validation logs divergence loudly and never
 *     throws (warn-and-continue)
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  BUILTIN_AGENT_IDS,
  configuredAgentsIn,
  allowedAgents,
  unregisteredAgentReason,
  registryDivergence,
} from "../src/registry-guard.js";
import { v2Definition, resetRegistryGuardCaches } from "../src/v2.js";
import { clearWorkflowCache } from "../src/workflow-loader.js";
import { clearEvents } from "../src/metrics.js";

function makeConfigTree(root, { agentMap = {}, agentFiles = [] } = {}) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "agents"), { recursive: true });
  writeFileSync(
    join(root, "opencode.json"),
    JSON.stringify({ agent: agentMap }, null, 2),
    "utf-8"
  );
  for (const name of agentFiles) {
    writeFileSync(join(root, "agents", `${name}.md`), "---\ndescription: t\n---\nbody\n", "utf-8");
  }
  return root;
}

beforeEach(() => {
  clearEvents();
  clearWorkflowCache();
  resetRegistryGuardCaches();
});

// ─── Pure helpers ──────────────────────────────────────────────────────────

test("configuredAgentsIn: agent-map keys + agents/*.md stems, both config spellings", () => {
  const root = join(tmpdir(), "reg-guard-json");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "opencode.json"),
    JSON.stringify({
      agent: { sisyphus: { model: "zai-coding-plan/glm-5.3" } },
      agents: { "native-v2-seat": { model: "p/m" } },
    }),
    "utf-8"
  );
  mkdirSync(join(root, "agents"), { recursive: true });
  writeFileSync(join(root, "agents", "reviewer.md"), "x", "utf-8");
  writeFileSync(join(root, "agents", "notes.txt"), "x", "utf-8"); // not markdown
  const names = configuredAgentsIn(root);
  assert.ok(names.has("sisyphus") && names.has("native-v2-seat") && names.has("reviewer"),
    `both the V1 agent map AND the native V2 agents map must count: ${[...names]}`);
  assert.ok(!names.has("notes"), "non-markdown files must not count");

  const jsoncRoot = join(tmpdir(), "reg-guard-jsonc");
  rmSync(jsoncRoot, { recursive: true, force: true });
  mkdirSync(jsoncRoot, { recursive: true });
  writeFileSync(
    join(jsoncRoot, "opencode.jsonc"),
    "{\n  // fleet config\n  \"agent\": { \"plan\": { \"model\": \"p/m\" } }\n}\n",
    "utf-8"
  );
  assert.ok(configuredAgentsIn(jsoncRoot).has("plan"), "jsonc comments tolerated");
});

test("configuredAgentsIn: missing/absent directory contributes nothing, never throws", () => {
  assert.deepEqual([...configuredAgentsIn("/nonexistent-reg-guard-dir")], []);
});

test("unregisteredAgentReason: built-ins and configured pass, unknown refused, empty passes", () => {
  const allowed = allowedAgents([]);
  for (const id of BUILTIN_AGENT_IDS) {
    assert.equal(unregisteredAgentReason(id, allowed), null, `${id} must pass`);
  }
  assert.ok(unregisteredAgentReason("sisyphus", allowed), "unknown name must be refused");
  assert.match(
    unregisteredAgentReason("typo-persona", allowed),
    /unregistered agent "typo-persona".*silent-default/s
  );
  assert.equal(unregisteredAgentReason(undefined, allowed), null);
  assert.equal(unregisteredAgentReason("", allowed), null);
});

test("registryDivergence: configured-but-unregistered names are reported", () => {
  const { missing } = registryDivergence(["a", "b", "build"], ["build", "b", "general"]);
  assert.deepEqual(missing, ["a"]);
});

// ─── v2.js wiring (mock ctx) ───────────────────────────────────────────────

function makeMockCtx(configRoot, registry = [], options = {}) {
  const reg = { tool: {}, session: {}, prompts: [] };
  const ctx = {
    options,
    location: { directory: configRoot },
    agent: { async list() { return registry.map((id) => ({ id })); } },
    tool: {
      async hook(name, cb) {
        reg.tool[name] = cb;
        return { dispose: async () => {} };
      },
    },
    permission: {
      async hook(name, cb) {
        reg.permission = cb;
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
      async transform() {
        return { dispose: async () => {} };
      },
    },
  };
  return { ctx, reg };
}

test("execute.before refuses a tool call under an unregistered agent label", async () => {
  const root = makeConfigTree(join(tmpdir(), "reg-guard-live1"), {
    agentMap: { sisyphus: { model: "zai-coding-plan/glm-5.3" } },
  });
  const { ctx, reg } = makeMockCtx(root, [], { registry_guard_roots: [root] });
  await v2Definition.setup(ctx);
  await assert.rejects(
    reg.tool["execute.before"]({
      tool: "read",
      sessionID: "ses-rg-1",
      agent: "hallucinated-researcher",
      input: { path: "/tmp/x" },
    }),
    (err) => {
      assert.match(err.message, /⛔ Gate blocked: unregistered agent "hallucinated-researcher"/);
      return true;
    }
  );
});

test("execute.before refuses a subagent spawn with an unregistered type, allows configured", async () => {
  const root = makeConfigTree(join(tmpdir(), "reg-guard-live2"), {
    agentFiles: ["brief-loader", "momus-plan-reviewer"],
  });
  const { ctx, reg } = makeMockCtx(root, [], { registry_guard_roots: [root] });
  await v2Definition.setup(ctx);

  await assert.rejects(
    reg.tool["execute.before"]({
      tool: "subagent",
      sessionID: "ses-rg-2",
      agent: "build",
      input: { subagent_type: "brief-lodr", prompt: "x" },
    }),
    (err) => {
      assert.match(err.message, /unregistered agent "brief-lodr"/);
      return true;
    }
  );

  // The configured spawn proceeds past the IDENTITY guard (the later
  // write gates may still block it under fail-closed — that is their
  // layer, not this one; assert only that no unregistered-agent error
  // fires).
  const err = await reg.tool["execute.before"]({
    tool: "subagent",
    sessionID: "ses-rg-2",
    agent: "build",
    input: { subagent_type: "brief-loader", prompt: "x" },
  }).then(
    () => null,
    (e) => e
  );
  assert.ok(!err || !/unregistered agent/.test(err.message), `identity guard must not fire: ${err?.message}`);
});

test("startup validation logs configured-but-unregistry names once, never throws", async () => {
  const root = makeConfigTree(join(tmpdir(), "reg-guard-live3"), {
    agentMap: { sisyphus: { model: "zai-coding-plan/glm-5.3" }, oracle: { model: "p/m" } },
  });
  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const { ctx, reg } = makeMockCtx(root, [], { registry_guard_roots: [root] });
    await v2Definition.setup(ctx);
    await reg.tool["execute.before"]({
      tool: "read",
      sessionID: "ses-rg-3",
      agent: "sisyphus",
      input: { path: "/tmp/x" },
    });
    await reg.tool["execute.before"]({
      tool: "read",
      sessionID: "ses-rg-3",
      agent: "sisyphus",
      input: { path: "/tmp/x" },
    });
  } finally {
    console.error = origError;
  }
  const divergenceLogs = errors.filter((l) => l.includes("AGENT-REGISTRY DIVERGENCE"));
  assert.equal(divergenceLogs.length, 1, "exactly one divergence log (once per process)");
  assert.match(divergenceLogs[0], /sisyphus/);
  assert.match(divergenceLogs[0], /silent-default guard \(tool execute\.before\) is ARMED/);
});

test("startup validation stays silent when the registry carries the configured set", async () => {
  const root = makeConfigTree(join(tmpdir(), "reg-guard-live4"), {
    agentFiles: ["sisyphus"],
  });
  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const { ctx, reg } = makeMockCtx(root, ["sisyphus", "build"], {
      registry_guard_roots: [root],
    });
    await v2Definition.setup(ctx);
    await reg.tool["execute.before"]({
      tool: "read",
      sessionID: "ses-rg-4",
      agent: "sisyphus",
      input: { path: "/tmp/x" },
    });
  } finally {
    console.error = origError;
  }
  assert.equal(errors.filter((l) => l.includes("AGENT-REGISTRY DIVERGENCE")).length, 0,
    `unexpected divergence logs: ${JSON.stringify(errors)}`);
});
