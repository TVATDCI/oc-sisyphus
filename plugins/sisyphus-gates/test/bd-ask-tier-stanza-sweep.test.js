/**
 * bd-ask-tier-stanza-sweep.test.js — fleet-wide stanza coherence for the
 * bd ask tier (fm/phase-agnostic-ask-fix).
 *
 * The twin desk's third finding (live seat, merged head, zero saved
 * grants, bd create/update/corrective-update all ran SILENT — repro:
 * data/phase-agnostic-ask-fix/repro/red-bdgrant-pre31): the Finding-A-era
 * stanza design granted `bd *` ALLOW to lane agents (writer-bd generator
 * profile → issue-creator.md; hand-maintained archivist.md). A stanza
 * allow computes allow at the permission layer AHEAD of the ask tier, so
 * in any window where the plugin's escalation hook is not live in the
 * seat process (stale generation after a pull), bd writes ran silent.
 * PR 31's hook governs only when it is loaded; the STANZA is the layer
 * that must not pre-empt the ask.
 *
 * Phase-agnostic means not PHASE-blocked (Layer 4 keeps bd record writes
 * plugin-pass-through so fail-closed phases keep them working — pinned in
 * bd-classification.test.js), never permission-skipped: no fleet agent
 * stanza may allow a mutating bd verb. Reads stay silent via enumerated
 * read-tier allows; every mutating verb falls to the blanket shell ask
 * and is governed by the ask tier under PURE RULE RESOLUTION — no hook
 * required.
 *
 * Run: `npm test` or `node --test test/bd-ask-tier-stanza-sweep.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bdAskTierEscalation, _internal } from "../src/command-policy.js";

const { BD_TIER_READ, BD_TIER_PHASE_AGNOSTIC_WRITE } = _internal;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const AGENTS_DIR = join(REPO_ROOT, "agents");

/**
 * Parse the `permissions:` rules array out of an agent file (generator
 * house style: `  - action: <name>` / `    resource: "<glob>"` /
 * `    effect: allow|ask|deny`). Returns null when the file carries no
 * permissions block (caller decides whether that is legal for the file).
 */
function parsePermissionRules(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^permissions:$/.test(l));
  if (start === -1) return null;
  const rules = [];
  let cur = null;
  for (const line of lines.slice(start + 1)) {
    if (/^[a-z_]+:/.test(line)) break; // next frontmatter key — block ended
    const entry = line.match(/^  - action: (\S+)$/);
    if (entry) {
      if (cur) rules.push(cur);
      cur = { action: entry[1], resource: undefined, effect: undefined };
      continue;
    }
    if (!cur) continue;
    const res = line.match(/^    resource: ("(?:[^"\\]|\\.)*"|\S+)$/);
    if (res) {
      cur.resource = res[1].replace(/^"(.*)"$/, "$1");
      continue;
    }
    const eff = line.match(/^    effect: (\w+)$/);
    if (eff) cur.effect = eff[1];
  }
  if (cur) rules.push(cur);
  return rules.filter((r) => r.resource !== undefined && r.effect !== undefined);
}

/** The bd subcommand a stanza resource pattern grants, or null if not bd. */
function bdSubOf(resource) {
  const m = resource.match(/^bd(?:\s+(.*))?$/);
  if (!m) return null;
  const rest = (m[1] ?? "").trim();
  if (rest === "" || rest === "*") return "*"; // blanket bd * — never a read tier
  return rest.split(/\s+/)[0];
}

function agentFiles() {
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

describe("fleet-wide stanza coherence — no agent stanza allows a mutating bd verb", () => {
  const files = agentFiles();

  test("the sweep is non-vacuous: it covers the two files that carried the retired grant", () => {
    assert.ok(files.includes("archivist.md"), "agents/archivist.md must exist (hand-maintained stanza)");
    assert.ok(files.includes("issue-creator.md"), "agents/issue-creator.md must exist (writer-bd generator profile)");
    assert.ok(files.length >= 15, `expected the full fleet cast, got ${files.length} files`);
  });

  for (const file of files) {
    test(`${file}: every bd shell ALLOW is read-tier (mutating verbs ask)`, () => {
      const text = readFileSync(join(AGENTS_DIR, file), "utf8");
      const rules = parsePermissionRules(text);
      if (rules === null) return; // no permissions block — not a stanza carrier
      for (const { action, resource, effect } of rules) {
        if (action !== "shell" || effect !== "allow") continue;
        const sub = bdSubOf(resource);
        if (sub === null) continue;
        assert.ok(
          BD_TIER_READ.has(sub),
          `${file} allows "bd ${sub}" — mutating bd verbs must never carry a stanza allow ` +
            `(resource: ${resource}); phase-agnostic verbs are Layer-4-safe at the plugin ` +
            `gate but their boundary is the ask tier (${resource})`,
        );
      }
    });
  }

  test("the blanket bd * allow is retired from EVERY agent stanza", () => {
    for (const file of files) {
      const text = readFileSync(join(AGENTS_DIR, file), "utf8");
      assert.ok(
        !/resource: "bd \*"\s*\n\s*effect: allow/.test(text),
        `${file} carries a blanket "bd *" ALLOW — the grant-exempt short-circuit that ran ` +
          `bd writes silent on the twin desk (third finding); retired fm/phase-agnostic-ask-fix`,
      );
    }
  });

  test("phase-agnostic verbs carry no stanza allow on ANY fleet agent", () => {
    for (const file of files) {
      const text = readFileSync(join(AGENTS_DIR, file), "utf8");
      const rules = parsePermissionRules(text);
      if (rules === null) continue;
      for (const verb of BD_TIER_PHASE_AGNOSTIC_WRITE) {
        const offending = rules.filter(
          (r) => r.action === "shell" && r.effect === "allow" && r.resource.startsWith(`bd ${verb}`),
        );
        assert.equal(offending.length, 0, `${file} must not allow "bd ${verb}*" (found ${offending.map((r) => r.resource).join(", ")})`);
      }
    }
  });

  test("archivist.md + issue-creator.md: blanket ask survives ahead of the read-tier allows", () => {
    for (const file of ["archivist.md", "issue-creator.md"]) {
      const rules = parsePermissionRules(readFileSync(join(AGENTS_DIR, file), "utf8"));
      assert.ok(rules !== null, `${file} must carry a permissions block`);
      const blanketAsk = rules.find((r) => r.action === "shell" && r.resource === "*" && r.effect === "ask");
      assert.ok(blanketAsk, `${file} must keep the blanket shell ask (the ask boundary for mutating bd verbs under pure rule resolution)`);
    }
  });
});

describe("the ask-tier decision owner is grant-blind (four-combination law)", () => {
  // The four combinations (create/update × grant-present/grant-absent) are
  // proven LIVE by the canary driver (repro/bd-ask-tier-canary.mjs: N01/N02
  // + N05/N06 on the zero-rule tier, G01/G02 + G05/G06 on the stanza-grant
  // tier, S01's always-click saving the bd * grant). At the unit layer the
  // law pins the shape that makes that possible: bdAskTierEscalation takes
  // no grant input — ask follows from the verb alone, so no grant state can
  // weaken it, and the stanza sweep above removes the configured-grant
  // class structurally.
  for (const verb of [...BD_TIER_PHASE_AGNOSTIC_WRITE]) {
    test(`bd ${verb} asks with no grant in sight (grant-absent half)`, () => {
      assert.equal(bdAskTierEscalation("shell", [`bd ${verb} --title x`]), "ask");
    });
    test(`bd ${verb} asks under a grant-shaped resource string (grant-present half)`, () => {
      // The saved-grant store resolves BELOW this decision: the hook
      // re-raises ask regardless of the effect the host computed from
      // configured rules + saved grants (PR 31). Pin the verb-side here.
      assert.equal(bdAskTierEscalation("shell", [`bd ${verb} bdcanary-g --status closed`]), "ask");
    });
  }
});
