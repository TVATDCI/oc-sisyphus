/**
 * test/bd-ask-tier-enforcement.test.js — the ask-tier ENFORCEMENT wiring
 * (fm/sis-gates-ask-enforcement).
 *
 * PR 30 landed the bd verb-tier map (data); this round wires the
 * enforcement. Ground truth it closes:
 *   - the twin desk's live re-test (evidence-1-tnt-retest.md): bd update
 *     --status closed and bd create ran SILENT on a fresh-boot session —
 *     zero asks fired all session — because PR 30's tier map had no
 *     enforcement hook and the computed permission effect for those
 *     commands was "allow" (computed-allow defaults / saved grants).
 *   - the saved-grant bypass (verb-ship REPRO-NOTES): one always-click on
 *     any bd ask saves the ARITY-fallback pattern `bd *` project-wide;
 *     opencode appends PermissionSaved rules AFTER configured rules and
 *     resolves findLast-wins — every later bd verb silently allowed.
 *
 * The enforcement owner is bdAskTierEscalation() in src/command-policy.js
 * (one law, both generations): a shell permission over resources carrying
 * an ask-tier bd verb escalates to "ask" REGARDLESS of the computed
 * effect. Wired at:
 *   - src/v2.js ctx.permission.hook("evaluate") — the live 2.2.2 surface
 *     (the host triggers "permission","evaluate" AFTER configured rules +
 *     saved grants computed the effect; the hook mutates event.effect).
 *   - src/plugin.js "permission.ask" — the pinned 1.18 rollback surface
 *     (additive consult; absent event fields degrade to a no-op).
 *
 * Scenarios pinned here = every TNT re-test scenario, at the classifier
 * and hook layers:
 *   bd create asks · bd update --status closed asks · saved-grant-then-
 *   bd-verb STILL asks · rm -f still blocks (plugin layer, untouched —
 *   pinned as escalation-null) · plain reads still clean · allowlisted
 *   commands still allow.
 *
 * Plus the PR-27 standing-law riders: the Layer-4 allow path must not
 * outrank the new ask (a bd-create compound is Layer-4.5-safe AND
 * ask-tier at the permission layer), and the ask tier stays disjoint
 * from the destructive classifier.
 *
 * Run: `npm test` or `node --test test/bd-ask-tier-enforcement.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  askTierCommandPresent,
  bdAskTierEscalation,
  isAskTierCommand,
  isSafeReadOnlyCommand,
  isSafeCompoundCommand,
  isDestructiveCommand,
} from "../src/command-policy.js";
import { server as v1Server } from "../src/plugin.js";
import { v2Definition } from "../src/v2.js";
import { withTempHome, writeStateFile } from "./helpers.js";
import { clearEvents } from "../src/metrics.js";
import { clearWorkflowCache } from "../src/workflow-loader.js";
import { beforeEach } from "node:test";

beforeEach(() => {
  clearEvents();
  clearWorkflowCache();
});

// ─── classifier layer: askTierCommandPresent ───────────────────────────────

describe("askTierCommandPresent — compound-aware ask-tier detection", () => {
  test("TNT R2: bd create is ask-tier", () => {
    assert.equal(askTierCommandPresent(`bd create --title "probe"`), true);
  });

  test("TNT R1: bd update --status closed is ask-tier", () => {
    assert.equal(askTierCommandPresent("bd update brain-ecf --status closed"), true);
  });

  test("retired read-allow ferry: bd ready && bd create --title x is ask-tier", () => {
    // The stanza's `bd ready *` allow (or a saved `bd *` grant) matches
    // the WHOLE compound string by prefix — the write verb rides the
    // second segment. The split must surface it.
    assert.equal(askTierCommandPresent("bd ready && bd create --title x"), true);
    assert.equal(askTierCommandPresent("bd list; bd update x --status closed"), true);
    assert.equal(askTierCommandPresent("bd ready || bd remember k v"), true);
  });

  test("reads stay clean — single and compound", () => {
    assert.equal(askTierCommandPresent("bd ready"), false);
    assert.equal(askTierCommandPresent("bd list --json"), false);
    assert.equal(askTierCommandPresent("bd ready && bd show x"), false);
    assert.equal(askTierCommandPresent("bd list && bd stats"), false);
  });

  test("non-bd commands are never ask-tier", () => {
    assert.equal(askTierCommandPresent("git status --short"), false);
    assert.equal(askTierCommandPresent("gh pr view 30"), false);
    assert.equal(askTierCommandPresent("echo bd create x"), false, "bd is not the invoked binary");
    assert.equal(askTierCommandPresent("cat file && git log"), false);
  });

  test("near-misses stay denied (prefix sloppiness)", () => {
    assert.equal(askTierCommandPresent("bdx update x"), false);
    assert.equal(askTierCommandPresent("bd updater x"), false);
    assert.equal(askTierCommandPresent("bd"), false);
    assert.equal(askTierCommandPresent(""), false);
    assert.equal(askTierCommandPresent(undefined), false);
  });

  test("gated verbs are NOT ask-tier (the plugin blocks those itself)", () => {
    assert.equal(askTierCommandPresent("bd close x"), false);
    assert.equal(askTierCommandPresent("bd forget key"), false);
    assert.equal(askTierCommandPresent("bd dolt push"), false);
  });

  test("isAskTierCommand keeps its exact single-command semantics", () => {
    // the PR-30 contract the enforcement layer builds on
    assert.equal(isAskTierCommand("bd update x --status closed"), true);
    assert.equal(isAskTierCommand("bd create --title x"), true);
    assert.equal(isAskTierCommand("bd ready"), false);
  });
});

// ─── classifier layer: bdAskTierEscalation (the decision owner) ────────────

describe("bdAskTierEscalation — the permission-layer decision", () => {
  test("shell event over an ask-tier bd command → ask", () => {
    assert.equal(bdAskTierEscalation("shell", ["bd create --title x"]), "ask");
    assert.equal(bdTierCase("bd update x --status closed"), "ask");
  });

  test("bash action alias gets the same boundary (V1-era naming)", () => {
    assert.equal(bdAskTierEscalation("bash", ["bd create --title x"]), "ask");
  });

  test("allowlisted commands still allow (no opinion)", () => {
    assert.equal(bdAskTierEscalation("shell", ["git status --short"]), null);
    assert.equal(bdAskTierEscalation("shell", ["gh pr view 30 --json number"]), null);
    assert.equal(bdAskTierEscalation("shell", ["bd ready"]), null);
    assert.equal(bdAskTierEscalation("shell", ["bd list --json"]), null);
  });

  test("read compounds keep today's clean behavior", () => {
    assert.equal(bdAskTierEscalation("shell", ["bd ready && bd show x"]), null);
  });

  test("non-shell actions get no opinion (edit/read/MCP untouched)", () => {
    assert.equal(bdAskTierEscalation("edit", ["bd create --title x"]), null);
    assert.equal(bdAskTierEscalation("read", ["/tmp/x"]), null);
    assert.equal(bdAskTierEscalation(undefined, ["bd create"]), null);
    assert.equal(bdAskTierEscalation("shell", undefined), null);
  });

  test("string (non-array) resources are accepted", () => {
    assert.equal(bdAskTierEscalation("shell", "bd create --title x"), "ask");
  });

  test("rm -f still blocks at the plugin layer — escalation expresses no opinion", () => {
    // TNT R3: the destructive block is the plugin's own gate, which throws
    // in tool.execute.before BEFORE permission evaluation runs. The ask
    // layer must never weaken it: rm -f is destructive-classified and the
    // escalation function is not even consulted on a blocked command —
    // pinned here as classifier disjointness (PR-27 law).
    assert.equal(isDestructiveCommand("rm -f /tmp/x"), true);
    assert.equal(bdAskTierEscalation("shell", ["rm -f /tmp/x"]), null);
  });
});

function bdTierCase(cmd) {
  return bdAskTierEscalation("shell", [cmd]);
}

// ─── standing law: Layer-4 allow path must not outrank the ask ─────────────

describe("standing law — Layer 4 allow and the permission ask are independent layers", () => {
  test("bd create/update stay Layer-4-safe by design (Finding A) AND ask-tier", () => {
    assert.equal(isSafeReadOnlyCommand("bd create --title x"), true);
    assert.equal(isSafeReadOnlyCommand("bd update x --status closed"), true);
    assert.equal(bdAskTierEscalation("shell", ["bd create --title x"]), "ask");
  });

  test("a bd-create compound passes Layer 4.5 AND still asks at the permission layer", () => {
    const cmd = "bd ready && bd create --title x";
    assert.equal(isSafeCompoundCommand(cmd), true, "Layer 4.5 allow-path data");
    assert.equal(bdAskTierEscalation("shell", [cmd]), "ask", "permission layer re-raises the ask");
  });

  test("ask tier stays disjoint from the destructive classifier (PR-27 law)", () => {
    for (const verb of ["create", "update", "remember", "assign", "label"]) {
      assert.equal(isDestructiveCommand(`bd ${verb} x`), false, `bd ${verb} must not be destructive`);
      assert.equal(askTierCommandPresent(`bd ${verb} x`), true);
    }
  });
});

// ─── V2 enforcement: permission.evaluate hook (the live 2.2.2 surface) ─────

/**
 * Minimal mock of the V2 plugin ctx (same shape as v2-plugin.test.js's
 * makeMockCtx — only the permission surface is needed here).
 */
async function bootV2Permission() {
  const reg = { permission: {} };
  const ctx = {
    options: {},
    location: { directory: "/nonexistent-config-dir" },
    tool: { async hook() { return { dispose: async () => {} }; } },
    permission: {
      async hook(name, cb) {
        reg.permission[name] = cb;
        return { dispose: async () => {} };
      },
    },
    session: {
      async hook() { return { dispose: async () => {} }; },
      async prompt() {},
    },
    command: { async transform() { return { dispose: async () => {} }; } },
  };
  await v2Definition.setup(ctx);
  return reg.permission["evaluate"];
}

describe("v2 permission.evaluate — ask-tier enforcement in live-shape events", () => {
  test("bd create asks in execution phase even when rules computed allow", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, { phase: "execution", approval_status: "approved" });
      const evaluate = await bootV2Permission();
      // effect "allow" = what the host computed (saved grant, subagent
      // default `shell * allow`, or absent rules — the class is the same)
      const event = { sessionID: "enforce-1", action: "shell", resources: [`bd create --title "bdcanary-p02"`], effect: "allow" };
      evaluate(event);
      assert.equal(event.effect, "ask", "TNT R2: bd create must ask");
    });
  });

  test("bd update --status closed asks in execution phase even when rules computed allow", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, { phase: "execution", approval_status: "approved" });
      const evaluate = await bootV2Permission();
      const event = { sessionID: "enforce-2", action: "shell", resources: ["bd update brain-ecf --status closed"], effect: "allow" };
      evaluate(event);
      assert.equal(event.effect, "ask", "TNT R1: bd update --status closed must ask");
    });
  });

  test("saved-grant shape: computed allow from an earlier always-click STILL asks", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, { phase: "execution", approval_status: "approved" });
      const evaluate = await bootV2Permission();
      // P10/P11 verb-ship residual: after one always-click saved `bd *`,
      // every later bd verb computed allow. The ask must re-raise.
      const remember = { sessionID: "enforce-3", action: "shell", resources: ["bd remember bdcanary-key bdcanary-value"], effect: "allow" };
      evaluate(remember);
      assert.equal(remember.effect, "ask", "saved grant must not silence bd remember");
      const update = { sessionID: "enforce-3", action: "shell", resources: ["bd update bdcanary-p11 --status closed"], effect: "allow" };
      evaluate(update);
      assert.equal(update.effect, "ask", "saved grant must not silence bd update");
    });
  });

  test("computed ask is preserved (never weakened to allow)", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, { phase: "execution", approval_status: "approved" });
      const evaluate = await bootV2Permission();
      const event = { sessionID: "enforce-4", action: "shell", resources: ["touch /tmp/x"], effect: "ask" };
      evaluate(event);
      assert.equal(event.effect, "ask");
    });
  });

  test("plain reads still clean: bd ready + git status stay allow in execution phase", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, { phase: "execution", approval_status: "approved" });
      const evaluate = await bootV2Permission();
      const read = { sessionID: "enforce-5", action: "shell", resources: ["bd ready"], effect: "allow" };
      evaluate(read);
      assert.equal(read.effect, "allow", "TNT R4: reads stay clean");
      const allowlisted = { sessionID: "enforce-5", action: "shell", resources: ["git status --short"], effect: "allow" };
      evaluate(allowlisted);
      assert.equal(allowlisted.effect, "allow", "allowlisted commands still allow");
    });
  });

  test("compound smuggling a write verb behind a read allow asks", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, { phase: "execution", approval_status: "approved" });
      const evaluate = await bootV2Permission();
      const event = { sessionID: "enforce-6", action: "shell", resources: ["bd ready && bd create --title x"], effect: "allow" };
      evaluate(event);
      assert.equal(event.effect, "ask");
    });
  });
});

// ─── V1 enforcement: permission.ask hook (the pinned rollback surface) ─────

describe("v1 permission.ask — bd ask-tier consult on the 1.18 shape", () => {
  async function bootV1Permission() {
    const hooks = await v1Server({}, {});
    return hooks["permission.ask"];
  }

  test("bd create via metadata.command → status ask", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, { phase: "execution", approval_status: "approved" });
      const ask = await bootV1Permission();
      const output = { status: "allow" };
      await ask({ sessionID: "v1-1", type: "bash", pattern: "bd *", metadata: { command: "bd create --title x" } }, output);
      assert.equal(output.status, "ask");
    });
  });

  test("bd create via matched pattern resource → status ask", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, { phase: "execution", approval_status: "approved" });
      const ask = await bootV1Permission();
      const output = { status: "allow" };
      await ask({ sessionID: "v1-2", type: "bash", pattern: "bd create --title x", metadata: {} }, output);
      assert.equal(output.status, "ask");
    });
  });

  test("reads and allowlisted commands stay untouched", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, { phase: "execution", approval_status: "approved" });
      const ask = await bootV1Permission();
      const out1 = { status: "allow" };
      await ask({ sessionID: "v1-3", type: "bash", pattern: "bd ready *", metadata: { command: "bd ready" } }, out1);
      assert.equal(out1.status, "allow");
      const out2 = { status: "allow" };
      await ask({ sessionID: "v1-3", type: "bash", pattern: "git status *", metadata: { command: "git status --short" } }, out2);
      assert.equal(out2.status, "allow");
    });
  });

  test("absent command fields degrade to a no-op (rollback-surface safety)", async () => {
    await withTempHome(async (home) => {
      writeStateFile(home, { phase: "execution", approval_status: "approved" });
      const ask = await bootV1Permission();
      const output = { status: "allow" };
      await ask({ sessionID: "v1-4", type: "bash", pattern: "bd *", metadata: {} }, output);
      assert.equal(output.status, "allow", "matched pattern without a command must not fabricate an ask");
    });
  });
});
