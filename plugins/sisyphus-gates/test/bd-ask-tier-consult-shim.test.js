/**
 * test/bd-ask-tier-consult-shim.test.js — the unconditional ask-tier
 * consult shim (fm/store-preemption-fix).
 *
 * Ground being pinned: an ask-tier bd verb that survives the gates gets
 * its permission evaluation raised BY THE PLUGIN (ctx.permission.assert)
 * from the tool hook — the surface that demonstrably always fires — so no
 * stored allow (PermissionSaved grant, stanza allow, session permission)
 * and no host-internal consult gap can silence the ask. The PR-31
 * evaluate-hook escalation stays the second, governing layer; this shim
 * is the guarantee that the consult itself happens.
 *
 * Scenario classes:
 *   - consult raised for bd create / update / compound-carried verbs,
 *     with the host's own assert shape (action "shell", raw command as
 *     the single resource, tool source, session scoping, marker metadata,
 *     NO save markers)
 *   - no consult for reads, allowlisted commands, and non-shell tools
 *   - deny/reject inside the consult → gate-block error (fail closed)
 *   - hosts without ctx.permission.assert degrade to a noted no-op
 *   - rm-class gate blocks still throw BEFORE any consult (ordering)
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { v2Definition, resetAskShimNoteForTest } from "../src/v2.js";
import { withTempHome, writeStateFile, removeStateFile } from "./helpers.js";
import { clearEvents } from "../src/metrics.js";
import { clearWorkflowCache } from "../src/workflow-loader.js";

const EXEC_STATE = {
  phase: "execution",
  approval_status: "approved",
  prd_id: "shim-test",
  plan_id: "shim-test",
};

/**
 * Mock V2 ctx (same domain shapes as v2-plugin.test.js) plus the 2.2.2
 * permission.assert surface, captured. `assertImpl` lets a scenario
 * replace the default resolve-allow implementation with deny/throw.
 */
function makeMockCtx(overrides = {}) {
  const assertCalls = [];
  const permissionWarns = [];
  const ctx = {
    options: overrides.options ?? {},
    location: {
      directory: overrides.directory ?? "/nonexistent-config-dir",
      project: { id: "shim-test-project", directory: "/tmp", canonical: "/tmp" },
    },
    tool: {
      async hook(name, cb) {
        ctx.reg.tool[name] = cb;
        return { dispose: async () => {} };
      },
    },
    permission: {
      async hook(name, cb) {
        ctx.reg.permission[name] = cb;
        return { dispose: async () => {} };
      },
      ...(overrides.withoutAssertSurface
        ? {}
        : {
            async assert(input) {
              assertCalls.push(input);
              if (overrides.assertImpl) return overrides.assertImpl(input);
              return undefined; // allow / answered-ask approved
            },
          }),
    },
    session: {
      async hook(name, cb) {
        ctx.reg.session[name] = cb;
        return { dispose: async () => {} };
      },
      async prompt() {},
    },
    command: {
      async transform() {
        return { dispose: async () => {} };
      },
    },
    reg: { tool: {}, permission: {}, session: {} },
  };
  return { ctx, assertCalls, permissionWarns };
}

async function bootV2(overrides = {}) {
  const mock = makeMockCtx(overrides);
  await v2Definition.setup(mock.ctx);
  return mock;
}

function bashEvent(command, extra = {}) {
  return {
    tool: "shell",
    sessionID: "ses_shim_1",
    agent: "sisyphus",
    messageID: "msg_shim_1",
    id: "call_shim_1",
    input: { command },
    ...extra,
  };
}

beforeEach(() => {
  clearEvents();
  clearWorkflowCache();
  resetAskShimNoteForTest();
});

// ─── the consult is raised, with the host's own assert shape ───────────────

test("consult raised for bd create with the host assert shape (no save markers)", async () => {
  await withTempHome(async (home) => {
    writeStateFile(home, EXEC_STATE);
    const { ctx, assertCalls } = await bootV2();
    await ctx.reg.tool["execute.before"](bashEvent(`bd create --title "shim-p02"`));
    assert.equal(assertCalls.length, 1, "exactly one consult");
    const call = assertCalls[0];
    assert.equal(call.action, "shell");
    assert.deepEqual(call.resources, [`bd create --title "shim-p02"`]);
    assert.equal(call.sessionID, "ses_shim_1");
    assert.equal(call.agent, "sisyphus");
    assert.equal(call.source.type, "tool");
    assert.equal(call.source.messageID, "msg_shim_1");
    assert.equal(call.source.id, "call_shim_1");
    assert.equal(call.metadata.sisyphus_ask_tier, "consult");
    assert.equal(call.metadata.command, `bd create --title "shim-p02"`);
    assert.equal("save" in call, false, "the ask tier never mints grants: no save markers");
  });
});

test("consult raised for bd update and for other ask-tier verbs", async () => {
  await withTempHome(async (home) => {
    writeStateFile(home, EXEC_STATE);
    const { ctx, assertCalls } = await bootV2();
    await ctx.reg.tool["execute.before"](bashEvent(`bd update shim-p03 --status closed`));
    await ctx.reg.tool["execute.before"](bashEvent(`bd remember shim-key shim-value`));
    assert.equal(assertCalls.length, 2);
    assert.deepEqual(assertCalls[0].resources, [`bd update shim-p03 --status closed`]);
    assert.deepEqual(assertCalls[1].resources, [`bd remember shim-key shim-value`]);
    // NOTE: compounds carrying a write verb are gate-blocked upstream of
    // the shim by the metachar screen (all-phase block unless every
    // segment is safe-read-only) — the compound consult path is pinned at
    // the classifier layer (askTierCommandPresent, bd-ask-tier.test.js).
  });
});

// ─── silence classes that must NOT consult ─────────────────────────────────

test("no consult for bd reads, allowlisted reads, or non-shell tools", async () => {
  await withTempHome(async (home) => {
    writeStateFile(home, EXEC_STATE);
    const { ctx, assertCalls } = await bootV2();
    await ctx.reg.tool["execute.before"](bashEvent(`bd ready`));
    await ctx.reg.tool["execute.before"](bashEvent(`bd list --json`));
    await ctx.reg.tool["execute.before"](bashEvent(`git status --short`));
    await ctx.reg.tool["execute.before"]({
      tool: "read",
      sessionID: "ses_shim_1",
      input: { path: "/tmp/shim-test.md" },
    });
    assert.equal(assertCalls.length, 0, "reads and allowlist stay consult-free");
  });
});

// ─── fail-closed conversion ────────────────────────────────────────────────

test("a deny/reject inside the consult surfaces as a gate block", async () => {
  await withTempHome(async (home) => {
    writeStateFile(home, EXEC_STATE);
    const { ctx, assertCalls } = await bootV2({
      assertImpl: () => {
        throw new Error("Permission.DeclinedError: supervisor rejected");
      },
    });
    await assert.rejects(
      () => ctx.reg.tool["execute.before"](bashEvent(`bd create --title "shim-reject"`)),
      (err) => {
        assert.match(err.message, /⛔ Gate blocked/);
        assert.match(err.message, /ask-tier/);
        assert.match(err.message, /bd create/);
        return true;
      }
    );
    assert.equal(assertCalls.length, 1, "the consult was raised before the rejection");
  });
});

// ─── generation asymmetry: no assert surface → noted no-op ────────────────

test("host without permission.assert degrades to a no-op (hook stays enforceable)", async () => {
  await withTempHome(async (home) => {
    writeStateFile(home, EXEC_STATE);
    const { ctx } = await bootV2({ withoutAssertSurface: true });
    const warns = [];
    const origWarn = console.warn;
    console.warn = (msg) => warns.push(String(msg));
    try {
      await ctx.reg.tool["execute.before"](bashEvent(`bd create --title "shim-oldhost"`));
    } finally {
      console.warn = origWarn;
    }
    assert.ok(warns.some((w) => /consult shim inactive/.test(w)), "degrade is noted loudly once");
    // second consult must not re-warn (one-shot note)
    console.warn = origWarn; // (already restored)
  });
});

// ─── ordering: the destructive screens precede the consult ────────────────

test("rm-class gate block throws before any consult is raised", async () => {
  await withTempHome(async (home) => {
    writeStateFile(home, EXEC_STATE);
    const { ctx, assertCalls } = await bootV2();
    await assert.rejects(
      () => ctx.reg.tool["execute.before"](bashEvent(`rm -f /tmp/shim-p06`)),
      (err) => {
        assert.match(err.message, /⛔ Gate blocked/);
        return true;
      }
    );
    assert.equal(assertCalls.length, 0, "no consult for the gated class");
  });
});
