/**
 * test/bd-ask-tier.test.js — the bd verb-tier map and the mutation-boundary
 * ask tier (fm/sis-gates-zai-verb-ship, 2026-11-01).
 *
 * Twin-desk mutation-boundary finding, proven live on 2.2.2 (scratch repro,
 * firstmate task data): bd write-class verbs landed with NO boundary on the
 * primary seat — `bd create *` was an explicit stanza ALLOW, and one "always"
 * click on any bd ask saves the ARITY-fallback pattern `bd *` project-wide,
 * silently allowing the whole verb family afterward.
 *
 * This pins:
 *   - tier totality: every enumerated `bd --help` verb lands in EXACTLY one
 *     disposition (read / ask / gated / phase-agnostic write);
 *   - the PR-27 standing law: ask-tier verbs are disjoint from the plugin's
 *     destructive set (the gate must pass them to the permission layer, not
 *     throw) and from the read set;
 *   - the Finding A co-membership: create/update stay Layer-4-safe by design
 *     (fail-closed bd tracking), with the permission stanza as their ask
 *     boundary;
 *   - stanza coherence: agents/sisyphus.md allows exactly read-class bd
 *     verbs and carries NO allow for any mutating verb.
 *
 * Run: `npm test` or `node --test test/bd-ask-tier.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  isDestructiveCommand,
  isSafeReadOnlyCommand,
  isAskTierCommand,
  _internal,
} from "../src/command-policy.js";

const {
  SUBCOMMAND_BD,
  BD_TIER_READ,
  BD_TIER_ASK,
  BD_TIER_GATED,
  BD_TIER_PHASE_AGNOSTIC_WRITE,
  BD_NESTED_ASK_CHILDREN,
  BD_NESTED_GATED_CHILDREN,
  BD_ASK_FLAGS,
} = _internal;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// `bd --help` verb inventory (bd 1.3.2 / 9b65b9e, captured 2026-11-03 on
// this desk from the scratch-built tag binary under the isolation envelope;
// fm/bd-132-rehearsal-policy). Sorted live parse — 119 verbs: the 1.0.3
// snapshot minus `stats` (verb retired upstream) plus conflicts, events,
// heartbeat, metrics, migrate-personal, provenance, reclaim,
// recompute-blocked, schema, serve, sync, unclaim. Frozen snapshot for
// portability; the totality test ALSO diffs the LIVE `bd --help` against the
// map when the binary is present — the frozen list alone passed vacuously
// once (B1: swarm/worktree/mail were missing from BOTH list and map, so they
// agreed with each other and with neither with reality).
const BD_HELP_VERBS = [
  "admin", "ado", "assign", "audit", "backup", "batch", "blocked",
  "bootstrap", "branch", "children", "close", "comment", "comments",
  "compact", "completion", "config", "conflicts", "context", "cook",
  "count", "create", "create-form", "defer", "delete", "dep", "diff",
  "doctor", "dolt", "duplicate", "duplicates", "edit", "epic", "events",
  "export", "federation", "find-duplicates", "flatten", "forget",
  "formula", "gate", "gc", "github", "gitlab", "graph", "heartbeat",
  "help", "history", "hooks", "human", "import", "info", "init",
  "init-safety", "jira", "kv", "label", "linear", "link", "lint", "list",
  "mail", "memories", "merge-slot", "metrics", "migrate",
  "migrate-personal", "mol", "note", "notion", "onboard", "orphans",
  "ping", "preflight", "prime", "priority", "promote", "provenance",
  "prune", "purge", "q", "query", "quickstart", "ready", "recall",
  "reclaim", "recompute-blocked", "remember", "rename", "rename-prefix",
  "reopen", "repo", "restore", "rules", "schema", "search", "serve",
  "set-state", "setup", "ship", "show", "sql", "stale", "state", "status",
  "statuses", "supersede", "swarm", "sync", "tag", "todo", "types",
  "unclaim", "undefer", "update", "upgrade", "vc", "version", "where",
  "worktree",
];

/**
 * Parse the verb inventory out of live `bd --help` output (indented
 * "  verb        Description" lines). Returns null when bd is absent or the
 * output shape is unrecognized — callers must treat null as "live diff
 * skipped", never as an empty (vacuous) inventory.
 */
function liveBdVerbs() {
  try {
    const out = execFileSync("bd", ["--help"], { encoding: "utf8", timeout: 15000 });
    const verbs = new Set();
    for (const line of out.split("\n")) {
      // F1/F2 (re-audit 2026-11-01): \S must be the non-whitespace class (a
      // literal backslash-S matches nothing → 0 verbs → vacuous skip), and
      // the gap must be \s+ — bd renders single-space gaps after long verb
      // names (find-duplicates), which \s{2,} silently drops. The Usage
      // block's `bd [flags]` / `bd [command]` lines parse as a fake verb
      // named after the binary — excluded explicitly.
      const m = line.match(/^\s{2,}([a-z][a-z0-9-]*)\s+\S/);
      if (m && m[1] !== "bd") verbs.add(m[1]);
    }
    if (verbs.size < 20) return null; // parsed shape looks wrong — refuse to assert on it
    return [...verbs].sort();
  } catch {
    return null;
  }
}

function parseSisyphusBdShellRules() {
  const text = readFileSync(join(REPO_ROOT, "agents", "sisyphus.md"), "utf8");
  const rules = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s+action:\s+shell\s*$/);
    if (!m) continue;
    let resource = null;
    let effect = null;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const rm = lines[j].match(/^\s+resource:\s+"([^"]*)"\s*$/);
      if (rm) resource = rm[1];
      const em = lines[j].match(/^\s+effect:\s+(\S+)\s*$/);
      if (em) effect = em[1];
    }
    if (resource !== null && effect !== null) rules.push({ resource, effect });
  }
  return rules.filter((r) => r.resource.startsWith("bd "));
}

describe("bd verb-tier map (mutation-boundary ask tier)", () => {
  test("tier totality: every bd --help verb lands in exactly one disposition", () => {
    const missing = BD_HELP_VERBS.filter(
      (v) => !BD_TIER_READ.has(v) && !BD_TIER_ASK.has(v) && !BD_TIER_GATED.has(v) && !BD_TIER_PHASE_AGNOSTIC_WRITE.has(v),
    );
    assert.deepEqual(missing, [], `verbs missing from the tier map: ${missing.join(", ")}`);
    // no double-membership
    for (const v of BD_HELP_VERBS) {
      const memberships = [
        BD_TIER_READ.has(v) && "read",
        BD_TIER_ASK.has(v) && "ask",
        BD_TIER_GATED.has(v) && "gated",
        BD_TIER_PHASE_AGNOSTIC_WRITE.has(v) && "phase-agnostic",
      ].filter(Boolean);
      assert.equal(memberships.length, 1, `${v} must land in exactly one tier, got: ${memberships.join(",")}`);
    }
  });

  test("live inventory diff: every verb the installed bd exposes is classified (B1 non-vacuous guard)", (t) => {
    const live = liveBdVerbs();
    if (live === null) {
      // bd absent or unparseable: the frozen snapshot above still ran; the
      // skip is COUNTED by the runner (t.skip), never a silent green.
      t.skip("live bd inventory unavailable — frozen snapshot asserted by the totality test only");
      return;
    }
    const unclassified = live.filter(
      (v) => !BD_TIER_READ.has(v) && !BD_TIER_ASK.has(v) && !BD_TIER_GATED.has(v) && !BD_TIER_PHASE_AGNOSTIC_WRITE.has(v),
    );
    assert.deepEqual(
      unclassified,
      [],
      `installed bd exposes verbs the tier map does not classify (bd shipped new verbs?) — add them with a tier ruling: ${unclassified.join(", ")}`,
    );
    // rot the other way: a frozen-snapshot verb that live bd no longer has
    // means the inventory (or the parser) drifted.
    const liveSet = new Set(live);
    const vanished = BD_HELP_VERBS.filter((v) => !liveSet.has(v));
    assert.deepEqual(
      vanished,
      [],
      `frozen inventory carries verbs the installed bd no longer exposes — refresh BD_HELP_VERBS: ${vanished.join(", ")}`,
    );
    // the guard must be able to CATCH its own defect class (re-audit 2026-11-01):
    // clone the map minus one live verb and assert the diff surfaces it. If
    // this ever fails, the live diff has gone vacuous again and the test is
    // lying about coverage.
    const holeyAsk = new Set([...BD_TIER_ASK].filter((v) => v !== "swarm"));
    const holeyUnclassified = live.filter(
      (v) => !BD_TIER_READ.has(v) && !holeyAsk.has(v) && !BD_TIER_GATED.has(v) && !BD_TIER_PHASE_AGNOSTIC_WRITE.has(v),
    );
    assert.ok(
      holeyUnclassified.includes("swarm"),
      "self-check failed: removing swarm from the map did NOT surface it in the live diff — the guard is vacuous",
    );
  });

  test("ask tier is disjoint from the gated tier and the read tier", () => {
    for (const v of BD_TIER_ASK) {
      assert.ok(!BD_TIER_GATED.has(v), `ask verb ${v} must not be gated`);
      assert.ok(!BD_TIER_READ.has(v), `ask verb ${v} must not be read`);
    }
  });

  test("PR-27 law: the plugin must not block ask-tier verbs (they belong to the permission ask boundary)", () => {
    for (const v of BD_TIER_ASK) {
      const cmd = `bd ${v} arg`;
      assert.equal(
        isDestructiveCommand(cmd),
        false,
        `bd ${v} must not be destructive-classified — the permission stanza is its boundary`,
      );
      assert.ok(!SUBCOMMAND_BD.destructive.has(v), `bd ${v} must not join SUBCOMMAND_BD.destructive`);
    }
  });

  test("Finding A co-membership: create/update stay Layer-4-safe by design", () => {
    for (const v of BD_TIER_PHASE_AGNOSTIC_WRITE) {
      assert.ok(SUBCOMMAND_BD.safe.has(v), `bd ${v} must stay in SUBCOMMAND_BD.safe (fail-closed bd tracking)`);
      assert.equal(isSafeReadOnlyCommand(`bd ${v} --flag x`), true);
      assert.equal(isDestructiveCommand(`bd ${v} --flag x`), false);
      assert.equal(isAskTierCommand(`bd ${v} --flag x`), true, `bd ${v} is a mutating verb — ask tier`);
    }
  });

  test("isAskTierCommand: exact-subcommand match, near-misses denied", () => {
    assert.equal(isAskTierCommand("bd update bdcanary-p03 --status closed"), true);
    assert.equal(isAskTierCommand("bd create --title x"), true);
    assert.equal(isAskTierCommand("bd remember some insight"), true);
    assert.equal(isAskTierCommand("bdx update x"), false, "near-miss binary");
    assert.equal(isAskTierCommand("bd updatex x"), false, "prefix sloppiness");
    assert.equal(isAskTierCommand("bd updater x"), false, "prefix sloppiness");
    assert.equal(isAskTierCommand("bd ready"), false, "read verb");
    assert.equal(isAskTierCommand("bd forget key"), false, "gated verb — plugin blocks it instead");
    assert.equal(isAskTierCommand("bd close x"), false, "gated verb");
    assert.equal(isAskTierCommand("bd"), false, "bare invocation");
    assert.equal(isAskTierCommand("git status"), false, "non-bd");
  });

  test("bd 1.3.2 adopted rulings land in the adopted tiers (fm/bd-132-rehearsal-policy, 2026-11-03)", () => {
    // READ: verified inspect-only parent forms only.
    for (const v of ["events", "metrics", "provenance", "schema"]) {
      assert.ok(BD_TIER_READ.has(v), `${v} must be READ`);
    }
    // ASK: recompute-blocked is a repair write and must NEVER be
    // phase-agnostic or safe-set (pinned here by name, per the ruling).
    for (const v of ["recompute-blocked", "heartbeat", "reclaim", "unclaim", "conflicts"]) {
      assert.ok(BD_TIER_ASK.has(v), `${v} must be ASK`);
      assert.ok(!SUBCOMMAND_BD.safe.has(v), `${v} must never join the phase-agnostic safe set`);
      assert.ok(!BD_TIER_PHASE_AGNOSTIC_WRITE.has(v), `${v} must never be phase-agnostic`);
    }
    // GATED: sync + migrate-personal tightened UP from the scout's ask
    // proposal; serve operationally non-adopted. GATED = plugin-blocked.
    for (const v of ["serve", "sync", "migrate-personal"]) {
      assert.ok(BD_TIER_GATED.has(v), `${v} must be GATED`);
      assert.ok(SUBCOMMAND_BD.destructive.has(v), `${v} must join SUBCOMMAND_BD.destructive`);
    }
    // RETIRED: stats left the CLI in 1.3.2 — no tier membership, no stanza
    // allow, no safe-set entry.
    for (const set of [BD_TIER_READ, BD_TIER_ASK, BD_TIER_GATED, BD_TIER_PHASE_AGNOSTIC_WRITE, SUBCOMMAND_BD.safe, SUBCOMMAND_BD.destructive]) {
      assert.ok(!set.has("stats"), "stats must be fully retired from every bd set");
    }
    // No newly introduced write became phase-agnostic.
    for (const v of ["events", "metrics", "provenance", "schema", "serve", "sync", "migrate-personal", "recompute-blocked", "heartbeat", "reclaim", "unclaim", "conflicts"]) {
      assert.ok(!BD_TIER_PHASE_AGNOSTIC_WRITE.has(v), `${v} must not be phase-agnostic`);
    }
  });

  test("nested-subcommand/flag audit: a READ parent must not blanket-allow a mutating child (oracle condition, 2026-11-03)", () => {
    // ASK-class children under READ parents: ask tier + never safe-read-only.
    const nestedAsk = [
      "bd metrics on",
      "bd metrics off",
      "bd events prune",
      "bd provenance record",
    ];
    for (const cmd of nestedAsk) {
      assert.equal(isAskTierCommand(cmd), true, `${cmd} must ride the ask boundary`);
      assert.equal(isSafeReadOnlyCommand(cmd), false, `${cmd} must never pass as safe read-only`);
      assert.equal(isDestructiveCommand(cmd), false, `${cmd} is ask-class, not gated`);
    }
    // GATED-class nested form: plugin-blocked like the destructive set.
    assert.equal(isDestructiveCommand("bd migrate schema"), true, "bd migrate schema must be gated");
    assert.equal(isDestructiveCommand("bd migrate"), false, "bd migrate (bare) stays ask-tier");
    assert.equal(isAskTierCommand("bd migrate schema"), true, "bd migrate schema also tightens to ask at the permission layer");
    // ASK-class flags on stanza-allowed READ parents.
    const flagAsk = [
      "bd doctor --fix",
      "bd doctor --fix --yes",
      "bd doctor --fix-child-parent",
      "bd doctor --source=jsonl",
      "bd doctor --force",
      "bd orphans --fix",
      "bd orphans -f",
      "bd preflight --fix",
    ];
    for (const cmd of flagAsk) {
      assert.equal(isAskTierCommand(cmd), true, `${cmd} must ride the ask boundary`);
      assert.equal(isSafeReadOnlyCommand(cmd), false, `${cmd} must never pass as safe read-only`);
    }
    // The inspect-only parent forms STAY read/safe — the demotion must not
    // over-tighten the legitimate reads.
    const stillRead = [
      "bd events",
      "bd events tail",
      "bd events export",
      "bd metrics",
      "bd metrics example",
      "bd provenance log bd-123",
      "bd provenance by-ref abc",
      "bd schema",
      "bd doctor",
      "bd doctor --check=artifacts",
      "bd orphans",
      "bd preflight",
    ];
    for (const cmd of stillRead) {
      assert.equal(isAskTierCommand(cmd), false, `${cmd} is an inspect-only form — must stay read`);
      assert.equal(isSafeReadOnlyCommand(cmd), true, `${cmd} must stay safe read-only`);
    }
    // The demotion tables themselves are non-empty — this test must not go
    // vacuous if the maps are ever emptied.
    assert.ok(Object.keys(BD_NESTED_ASK_CHILDREN).length >= 3, "nested-ask children table must stay populated");
    assert.ok(Object.keys(BD_NESTED_GATED_CHILDREN).length >= 1, "nested-gated children table must stay populated");
    assert.ok(BD_ASK_FLAGS.length >= 3, "ask-flag table must stay populated");
  });
});

describe("agents/sisyphus.md stanza coherence with the bd tier map", () => {
  const rules = parseSisyphusBdShellRules();

  test("stanza parses and carries bd shell rules", () => {
    assert.ok(rules.length >= 10, `expected the enumerated read allows, got ${rules.length}`);
  });

  test("no stanza ALLOW for any mutating bd verb (ask/gated/phase-agnostic)", () => {
    for (const { resource, effect } of rules) {
      if (effect !== "allow") continue;
      const sub = resource.replace(/^bd\s+/, "").split(/\s+/)[0];
      assert.ok(
        BD_TIER_READ.has(sub),
        `stanza allows "bd ${sub}" — mutating verbs must never carry an allow (resource: ${resource})`,
      );
    }
  });

  test("the retired blanket write allows are gone", () => {
    const resources = rules.map((r) => r.resource);
    assert.ok(!resources.includes("bd create *"), "bd create * allow must stay retired");
    assert.ok(!resources.includes("bd update * --claim"), "bd update * --claim allow must stay retired");
    assert.ok(!resources.includes("bd *"), "no blanket bd * allow on the primary seat");
  });

  test("the sanctioned close-commit door rules survive", () => {
    const text = readFileSync(join(REPO_ROOT, "agents", "sisyphus.md"), "utf8");
    assert.match(text, /resource: "bash scripts\/session-close-commit\.sh \*"/);
    assert.match(text, /resource: "scripts\/session-close-commit\.sh \*"/);
  });
});
