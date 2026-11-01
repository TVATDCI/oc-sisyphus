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
import {
  isDestructiveCommand,
  isSafeReadOnlyCommand,
  isAskTierCommand,
  _internal,
} from "../src/command-policy.js";

const { SUBCOMMAND_BD, BD_TIER_READ, BD_TIER_ASK, BD_TIER_GATED, BD_TIER_PHASE_AGNOSTIC_WRITE } = _internal;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// `bd --help` verb inventory (bd 2.x, captured 2026-11-01 on this desk).
const BD_HELP_VERBS = [
  // Working With Issues
  "assign", "children", "close", "comment", "comments", "create", "create-form",
  "delete", "edit", "gate", "label", "link", "list", "merge-slot", "note",
  "priority", "promote", "q", "query", "reopen", "search", "set-state", "show",
  "state", "tag", "todo", "update",
  // Views & Reports
  "count", "diff", "find-duplicates", "history", "lint", "stale", "status",
  "statuses", "types",
  // Dependencies & Structure
  "dep", "duplicate", "duplicates", "epic", "graph", "supersede",
  // Sync & Data
  "backup", "branch", "export", "federation", "import", "restore", "vc",
  // Setup & Configuration
  "bootstrap", "config", "context", "dolt", "forget", "hooks", "human", "info",
  "init", "init-safety", "kv", "memories", "onboard", "prime", "quickstart",
  "recall", "remember", "setup", "where",
  // Maintenance
  "batch", "compact", "doctor", "flatten", "gc", "migrate", "ping",
  "preflight", "prune", "purge", "rename-prefix", "rules", "sql", "upgrade",
  // Integrations & Advanced
  "admin", "jira", "linear", "repo",
  // Additional Commands
  "ado", "audit", "blocked", "completion", "cook", "defer", "formula",
  "github", "gitlab", "help", "human", "init-safety", "mol", "notion",
  "orphans", "ready", "rename", "ship", "undefer", "version",
];

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
    const readPlusAgnostic = new Set([...BD_TIER_READ, ...BD_TIER_PHASE_AGNOSTIC_WRITE]);
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
    assert.ok(readPlusAgnostic.size > 0);
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
