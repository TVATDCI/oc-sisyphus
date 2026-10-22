/**
 * model-fallback/test/model-fallback.test.js — P2-b unit tests.
 *
 * Pure-decision tests (ladder reading, ref parsing, rung advancement,
 * fallback-worthiness) plus setup(ctx) wiring tests with a mock context:
 * the retry hook switches the session model on a worthy error, advances on
 * repeated failures, and never switches on request-shape errors or when the
 * ladder is exhausted.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  FALLBACK_WORTHY_TYPES,
  fallbackConfigSearchPath,
  readLadders,
  parseModelRef,
  refString,
  nextRung,
  modelFallbackDefinition,
} from "../src/index.js";

function makeConfigTree(root, ladders) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "opencode.json"),
    JSON.stringify({ model_fallback: ladders }, null, 2),
    "utf-8"
  );
  return root;
}

function makeMockCtx(configRoot) {
  const reg = { session: {}, switched: [] };
  const ctx = {
    location: { directory: configRoot },
    session: {
      async hook(name, cb) {
        reg.session[name] = cb;
        return { dispose: async () => {} };
      },
      async switchModel(input) {
        reg.switched.push(input);
      },
    },
  };
  return { ctx, reg };
}

beforeEach(() => {
  // fresh module state per test would need import reset; the definition is
  // stateless at module scope except rungIndex inside setup() — each test
  // boots a fresh setup, so per-session state is isolated already.
});

// ─── Pure helpers ──────────────────────────────────────────────────────────

test("readLadders finds the model_fallback map on the search path (json + jsonc)", () => {
  const root = makeConfigTree(join(tmpdir(), "mf-json"), {
    "zai-coding-plan/glm-5.3": ["opencode-go/glm-5.3", "opencode/glm-5.3"],
  });
  const ladders = readLadders(root);
  assert.deepEqual(ladders["zai-coding-plan/glm-5.3"], ["opencode-go/glm-5.3", "opencode/glm-5.3"]);

  const jsoncRoot = join(tmpdir(), "mf-jsonc");
  rmSync(jsoncRoot, { recursive: true, force: true });
  mkdirSync(jsoncRoot, { recursive: true });
  writeFileSync(
    join(jsoncRoot, "opencode.jsonc"),
    "{\n  // ladder\n  \"model_fallback\": { \"a/b\": [\"c/d\"] }\n}\n",
    "utf-8"
  );
  assert.deepEqual(readLadders(jsoncRoot)["a/b"], ["c/d"]);
});

test("readLadders returns {} when no config carries the block (never throws)", () => {
  assert.deepEqual(readLadders("/nonexistent-mf-dir"), {});
});

test("parseModelRef handles base, variant, and invalid shapes", () => {
  assert.deepEqual(parseModelRef("zai-coding-plan/glm-5.3"), {
    providerID: "zai-coding-plan",
    id: "glm-5.3",
  });
  assert.deepEqual(parseModelRef("opencode-go/glm-5.3#max"), {
    providerID: "opencode-go",
    id: "glm-5.3",
    variant: "max",
  });
  assert.equal(parseModelRef("no-slash"), null);
  assert.equal(parseModelRef(null), null);
});

test("nextRung: head entry, advancement, exhaustion, no-ladder", () => {
  const ladders = { "zai-coding-plan/glm-5.3": ["opencode-go/glm-5.3", "opencode/glm-5.3"] };
  const head = { providerID: "zai-coding-plan", id: "glm-5.3", variant: "max" };
  assert.equal(nextRung(ladders, head, undefined), "opencode-go/glm-5.3");
  // parked on rung 0, failing rung 0 -> rung 1
  const rung0 = { providerID: "opencode-go", id: "glm-5.3" };
  assert.equal(nextRung(ladders, rung0, { head: "zai-coding-plan/glm-5.3", index: 0 }), "opencode/glm-5.3");
  // parked on the last rung, failing it -> exhausted
  const rung1 = { providerID: "opencode", id: "glm-5.3" };
  assert.equal(nextRung(ladders, rung1, { head: "zai-coding-plan/glm-5.3", index: 1 }), null);
  // parked but failing the head again (session re-pinned) -> rung 0
  assert.equal(nextRung(ladders, head, { head: "zai-coding-plan/glm-5.3", index: 1 }), "opencode-go/glm-5.3");
  // unknown model -> no ladder
  assert.equal(nextRung(ladders, { providerID: "x", id: "y" }, undefined), null);
});

test("fallback-worthiness covers provider failures, not request-shape errors", () => {
  for (const worthy of ["provider.rate-limit", "provider.auth", "provider.quota", "provider.transport", "provider.internal", "provider.timeout"]) {
    assert.ok(FALLBACK_WORTHY_TYPES.has(worthy), worthy);
  }
  for (const unworthy of ["provider.invalid-request", "provider.content-filter", "provider.invalid-output", "provider.unsupported-operation"]) {
    assert.ok(!FALLBACK_WORTHY_TYPES.has(unworthy), unworthy);
  }
});

// ─── setup(ctx) wiring ─────────────────────────────────────────────────────

test("retry hook switches to the next rung on a worthy error and reports the served model", async () => {
  const root = makeConfigTree(join(tmpdir(), "mf-live1"), {
    "stub/fail": ["stub/ok"],
  });
  const { ctx, reg } = makeMockCtx(root);
  await modelFallbackDefinition.setup(ctx);
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(" "));
  const event = {
    sessionID: "ses-mf-1",
    model: { providerID: "stub", id: "fail" },
    error: { type: "provider.rate-limit", message: "429" },
    decision: { retry: true, delay: 100 },
  };
  try {
    await reg.session.retry(event);
  } finally {
    console.warn = origWarn;
  }
  assert.equal(reg.switched.length, 1);
  assert.deepEqual(reg.switched[0].model, { providerID: "stub", id: "ok" });
  assert.equal(event.decision.retry, true);
  assert.ok(event.decision.delay >= 750);
  assert.ok(warnings.some((w) => w.includes("serving stub/ok")), `report line missing: ${warnings}`);
});

test("retry hook advances rungs on repeated failures and stops at exhaustion", async () => {
  const root = makeConfigTree(join(tmpdir(), "mf-live2"), {
    "stub/fail": ["stub/mid", "stub/ok"],
  });
  const { ctx, reg } = makeMockCtx(root);
  await modelFallbackDefinition.setup(ctx);
  console.warn = () => {};
  const fire = (model, type = "provider.internal") =>
    reg.session.retry({
      sessionID: "ses-mf-2",
      model,
      error: { type, message: "x" },
      decision: { retry: true, delay: 0 },
    });
  await fire({ providerID: "stub", id: "fail" });
  await fire({ providerID: "stub", id: "mid" });
  await fire({ providerID: "stub", id: "ok" });
  assert.deepEqual(
    reg.switched.map((s) => `${s.model.providerID}/${s.model.id}`),
    ["stub/mid", "stub/ok"]
  );
  // a 4th failure with the ladder exhausted switches nothing more
  const before = reg.switched.length;
  await fire({ providerID: "stub", id: "ok" });
  assert.equal(reg.switched.length, before);
});

test("retry hook never switches on request-shape errors or retry=false", async () => {
  const root = makeConfigTree(join(tmpdir(), "mf-live3"), {
    "stub/fail": ["stub/ok"],
  });
  const { ctx, reg } = makeMockCtx(root);
  await modelFallbackDefinition.setup(ctx);
  console.warn = () => {};
  await reg.session.retry({
    sessionID: "ses-mf-3",
    model: { providerID: "stub", id: "fail" },
    error: { type: "provider.invalid-request", message: "x" },
    decision: { retry: true, delay: 0 },
  });
  await reg.session.retry({
    sessionID: "ses-mf-3",
    model: { providerID: "stub", id: "fail" },
    error: { type: "provider.rate-limit", message: "x" },
    decision: { retry: false },
  });
  assert.equal(reg.switched.length, 0);
});

test("switchModel failure keeps the session on the current model", async () => {
  const root = makeConfigTree(join(tmpdir(), "mf-live4"), {
    "stub/fail": ["stub/ok"],
  });
  const { ctx, reg } = makeMockCtx(root);
  ctx.session.switchModel = async () => {
    throw new Error("switch refused");
  };
  await modelFallbackDefinition.setup(ctx);
  console.warn = () => {};
  const event = {
    sessionID: "ses-mf-4",
    model: { providerID: "stub", id: "fail" },
    error: { type: "provider.rate-limit", message: "x" },
    decision: { retry: true, delay: 0 },
  };
  await reg.session.retry(event);
  // decision untouched by us (the switch never landed)
  assert.equal(event.decision.delay, 0);
});
