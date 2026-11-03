/**
 * test/regenerate-hotcache-determinism.test.js — the deterministic
 * hotcache-regeneration contract (scripts/regenerate_hotcache.py, slice two
 * of the sis-memory implementation; doctrine of record:
 * skills/memory-doctrine/SKILL.md §1/§3).
 *
 * Contract under test — ALWAYS-RUN fixture legs (no bd, no git, no live
 * store; inputs pinned via --from-capture/--state/--no-git):
 *   - schema completeness: the product satisfies the degraded-mode scan's
 *     required sections and carries the deterministic provenance marker
 *     (`**Regenerated from:**`), which check_degraded_mode.py accepts as the
 *     staleness-marker alternative to `**Compacted at:**` (guard NOT
 *     weakened: both markers stripped → TRIGGER).
 *   - DETERMINISM LAW: same inputs → byte-identical output (wall-clock,
 *     randomness, and order instability are absent from the product; a
 *     >1s gap between runs catches time leaks).
 *   - state projection allowlist: last_updated (plugin wall-clock) and
 *     non-allowlisted fields never reach the product.
 *   - contradiction surfacing: same write-law identity, differing values →
 *     both sides verbatim + RESOLUTION REQUIRED; never silently resolved;
 *     same-value duplicates are NOT contradictions (dedupe by identity).
 *   - budget mechanism (T5 fixture half): doctrine priority order
 *     (constraints → dependency/exact → rest), whole-entry fill, BOUND
 *     accounting, deterministic selection.
 *   - zero loss / no phantom at the fixture level.
 *
 * bd-live legs live in test/memory-standing-set.test.js (T1–T6).
 *
 * Run: `npm test` or `node --test test/regenerate-hotcache-determinism.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TEST_DIR, "..", "..", "..");
const REGEN = join(REPO_ROOT, "scripts", "regenerate_hotcache.py");
const SCAN = join(REPO_ROOT, "scripts", "check_degraded_mode.py");

// Deterministic fixture memories (capture = a `bd memories --json` payload).
// The pipe-format records are the wrapper's canonical shape; the slug record
// is the legacy pi-side shape routed by its `category:key — value` prefix.
const CAPTURE = {
  schema_version: 1,
  "global:constraint:never_ship_red": "scope=global|turn=1|category=constraint|key=never_ship_red|value=never ship on a red suite",
  "global:constraint:single_writer": "scope=global|turn=2|category=constraint|key=single_writer|value=one writer per desk store",
  "global:exact:plugin_pin": "scope=global|turn=3|category=exact|key=plugin_pin|value=@opencode-ai/plugin 1.19.5",
  "global:dependency:gate_depends_wrapper": "scope=global|turn=4|category=dependency|key=gate_depends_wrapper|value=gates depend on bd_remember.py argv shape",
  "global:decision:fixtures_only": "scope=global|turn=5|category=decision|key=fixtures_only|value=tests run against scratch fixtures — never the live store",
  "global:next:audit_branch": "scope=global|turn=6|category=next|key=audit_branch|value=fresh-context audit, then the captain's merge word",
  "global:files:gates_js": "scope=global|turn=7|category=files|key=gates_js|value=plugins/sisyphus-gates/src/gates.js — metachar screen",
  "global:intent:trustworthy_memory": "scope=global|turn=8|category=intent|key=trustworthy_memory|value=make the memory's derived layer provably trustworthy",
  "constraint-legacy-pi": "constraint:pi_legacy_rule — pi-side legacy constraint routed by prefix",
};

const STATE = {
  schema_version: 2,
  project: "determinism-fixture",
  phase: "execution",
  prd_gate: "pass",
  plan_gate: "pass",
  approval_status: "approved",
  // the plugin's wall-clock + a decoy: NEVER in the product
  last_updated: "2026-11-03T09:00:00.000Z",
  secret_decoy: "WALLCLOCK-OR-DECOY-CANARY",
};

function fixtureDir(name) {
  const root = mkdtempSync(join(tmpdir(), `regen-${name}-`));
  writeFileSync(join(root, "memories.json"), JSON.stringify(CAPTURE, null, 2));
  writeFileSync(join(root, "state.json"), JSON.stringify(STATE, null, 2));
  return root;
}

function regen(root, args) {
  return spawnSync(
    "python3",
    [REGEN, "--from-capture", join(root, "memories.json"),
     "--state", join(root, "state.json"), "--no-git", "--stdout", ...args],
    { encoding: "utf-8", timeout: 30000 },
  );
}

const SECTION_TITLES = [
  "Session Handoff",
  "Files Modified",
  "Decisions Made",
  "Next Steps",
  "Evidence References",
  "Preserved Constraints",
  "Critical Values",
];

describe("hotcache regeneration — deterministic contract (fixture legs)", () => {

  test("schema completeness: product satisfies the degraded-mode scan's required sections + provenance marker", () => {
    const root = fixtureDir("schema");
    try {
      const r = regen(root, []);
      assert.equal(r.status, 0, `regeneration failed: ${r.stderr}`);
      const cache = r.stdout;
      assert.ok(cache.includes("# Session Handoff"),
        "required section missing from the product: Session Handoff");
      for (const title of SECTION_TITLES.slice(1)) {
        assert.ok(
          cache.includes(`## ${title}`),
          `required section missing from the product: ${title}`,
        );
      }
      assert.match(cache, /^\*\*Regenerated from:\*\* bd=[0-9a-f]{12} state=[0-9a-f]{12} git=none$/m,
        "deterministic provenance marker missing or malformed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("DETERMINISM LAW: same inputs → byte-identical output across a >1s wall-clock gap", () => {
    const root = fixtureDir("determinism");
    try {
      const r1 = regen(root, []);
      assert.equal(r1.status, 0);
      const sleep = spawnSync("sleep", ["1.1"], { timeout: 5000 });
      assert.equal(sleep.status, 0);
      const r2 = regen(root, []);
      assert.equal(r2.status, 0);
      assert.equal(r2.stdout, r1.stdout,
        "DETERMINISM LAW VIOLATED: identical inputs produced differing bytes " +
        "(wall-clock, randomness, or order instability in the product)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("state projection allowlist: plugin wall-clock + non-allowlisted fields never reach the product", () => {
    const root = fixtureDir("allowlist");
    try {
      const r = regen(root, []);
      assert.equal(r.status, 0);
      const cache = r.stdout;
      assert.ok(!cache.includes("last_updated"), "wall-clock field leaked into the product");
      assert.ok(!cache.includes("2026-11-03T09:00:00"), "wall-clock value leaked into the product");
      assert.ok(!cache.includes("WALLCLOCK-OR-DECOY-CANARY"), "non-allowlisted state field leaked into the product");
      assert.ok(cache.includes("phase=execution"), "allowlisted phase missing from the projection");
      assert.ok(cache.includes("approval_status=approved"), "allowlisted approval missing from the projection");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("zero loss / no phantom at the fixture level", () => {
    const root = fixtureDir("loss");
    try {
      const r = regen(root, []);
      assert.equal(r.status, 0);
      const cache = r.stdout;
      const values = [
        "never ship on a red suite",
        "one writer per desk store",
        "@opencode-ai/plugin 1.19.5",
        "gates depend on bd_remember.py argv shape",
        "tests run against scratch fixtures — never the live store",
        "fresh-context audit, then the captain's merge word",
        "plugins/sisyphus-gates/src/gates.js — metachar screen",
        "make the memory's derived layer provably trustworthy",
        "pi-side legacy constraint routed by prefix",
      ];
      for (const v of values) {
        assert.ok(cache.includes(v), `zero loss violated — value missing from the product: ${v}`);
      }
      assert.ok(!cache.includes("phantom-canary-never-seeded"), "phantom content in the product");
      // every rendered record line traces to a fixture identity
      const fixtureIdentities = new Set(Object.keys(CAPTURE).filter((k) => k !== "schema_version"));
      const recordLines = cache.split("\n").filter((l) => /^- \S+ — /.test(l) && !l.startsWith("    - "));
      for (const line of recordLines) {
        const identity = line.slice(2).split(" — ")[0];
        assert.ok(fixtureIdentities.has(identity), `phantom record in the product: ${identity}`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("provenance marker accepted by the degraded-mode scan; stripping BOTH markers still triggers (guard not weakened)", () => {
    const root = fixtureDir("scan");
    try {
      const r = regen(root, []);
      assert.equal(r.status, 0);
      const cachePath = join(root, "hotcache.md");
      writeFileSync(cachePath, r.stdout);
      const statusPath = join(root, "extractor-status.json");
      writeFileSync(statusPath, JSON.stringify({ last_run: "2026-11-03T09:00:00Z", ok: true, error: null }));

      const clean = spawnSync(
        "python3", [SCAN, "--hotcache", cachePath, "--status-file", statusPath],
        { encoding: "utf-8", timeout: 30000 },
      );
      assert.equal(clean.status, 0, `scan fired on a complete regenerated cache: ${clean.stdout}`);
      assert.match(clean.stdout, /CLEAN: no mechanical degraded-mode triggers/);

      // guard not weakened: BOTH markers stripped → schema-incomplete trigger
      const stripped = r.stdout
        .replace(/^\*\*Regenerated from:\*\*.*$/m, "")
        .replace(/\*\*Compacted at:\*\*/g, "");
      const strippedPath = join(root, "hotcache-stripped.md");
      writeFileSync(strippedPath, stripped);
      const fired = spawnSync(
        "python3", [SCAN, "--hotcache", strippedPath, "--status-file", statusPath],
        { encoding: "utf-8", timeout: 30000 },
      );
      assert.equal(fired.status, 1, "scan did NOT fire on a marker-less cache — guard weakened");
      assert.match(fired.stdout, /TRIGGER schema-incomplete/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--check: CURRENT on matching bosses, STALE on drifted bosses, NA on model-written handoffs", () => {
    const root = fixtureDir("check");
    try {
      const cachePath = join(root, "hotcache.md");
      // file-write leg (no --stdout): the default mode writes --out
      const w = spawnSync(
        "python3", [REGEN, "--from-capture", join(root, "memories.json"),
                    "--state", join(root, "state.json"), "--no-git", "--out", cachePath],
        { encoding: "utf-8", timeout: 30000 },
      );
      assert.equal(w.status, 0, `--out write failed: ${w.stderr}`);
      assert.ok(readFileSync(cachePath, "utf-8").length > 0, "--out leg wrote no cache");

      const cur = spawnSync(
        "python3", [REGEN, "--check", "--from-capture", join(root, "memories.json"),
                    "--state", join(root, "state.json"), "--no-git", "--out", cachePath],
        { encoding: "utf-8", timeout: 30000 },
      );
      assert.equal(cur.status, 0, "--check flagged a matching cache stale");
      assert.match(cur.stderr, /HOTCACHE-CURRENT/);

      // drift one record's value in the boss capture
      const drifted = { ...CAPTURE };
      drifted["global:exact:plugin_pin"] =
        "scope=global|turn=3|category=exact|key=plugin_pin|value=@opencode-ai/plugin 1.20.0";
      writeFileSync(join(root, "memories.json"), JSON.stringify(drifted, null, 2));
      const stale = spawnSync(
        "python3", [REGEN, "--check", "--from-capture", join(root, "memories.json"),
                    "--state", join(root, "state.json"), "--no-git", "--out", cachePath],
        { encoding: "utf-8", timeout: 30000 },
      );
      assert.equal(stale.status, 1, "--check passed a drifted cache as current");
      assert.match(stale.stderr, /HOTCACHE-STALE: bd memory fingerprint drifted/);

      // model-written handoff (Compacted-at marker, no regeneration marker):
      // staleness is owned by its own timestamps — NA, never a false stale
      writeFileSync(cachePath,
        "# Session Handoff\n\n**Compacted at:** 2026-11-03T09:00:00Z\n\n## Files Modified\n- x\n");
      const na = spawnSync(
        "python3", [REGEN, "--check", "--from-capture", join(root, "memories.json"),
                    "--state", join(root, "state.json"), "--no-git", "--out", cachePath],
        { encoding: "utf-8", timeout: 30000 },
      );
      assert.equal(na.status, 0, "model-written handoff flagged stale by the regeneration check");
      assert.match(na.stderr, /HOTCACHE-CHECK-NA/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("contradiction surfacing: same identity, differing values → both verbatim + RESOLUTION REQUIRED; same-value duplicates are NOT contradictions", () => {
    const root = fixtureDir("contradiction");
    try {
      const conflict = {
        ...CAPTURE,
        "slug-drifted-copy": "scope=global|turn=99|category=exact|key=plugin_pin|value=@opencode-ai/plugin 1.20.0 (drifted)",
      };
      writeFileSync(join(root, "memories.json"), JSON.stringify(conflict, null, 2));
      const r = regen(root, []);
      assert.equal(r.status, 0, `regeneration failed: ${r.stderr}`);
      const cache = r.stdout;

      assert.match(cache, /## Contradictions \(resolution required\)/,
        "conflicting facts did not surface a resolution section");
      assert.match(r.stderr, /CONTRADICTION global:exact:plugin_pin: 2 differing values surfaced/,
        "contradiction not reported on the run channel");
      assert.ok(cache.includes("1.20.0 (drifted)"), "side B silently dropped (newest/order-wins)");
      assert.match(cache, /RESOLUTION REQUIRED/, "surfaced conflict carries no resolution demand");

      // no silent pick: the Critical Values section must not resolve the fight
      const critical = cache.split("## Critical Values")[1]?.split("\n## ")[0] ?? "";
      assert.ok(!critical.includes("1.19.5") && !critical.includes("1.20.0"),
        "conflicted identity rendered as a resolved Critical Value (silent pick)");

      // same identity + SAME value = duplication noise, not a contradiction
      const dup = {
        ...CAPTURE,
        "slug-dup-same-value": "scope=global|turn=7|category=exact|key=plugin_pin|value=@opencode-ai/plugin 1.19.5",
      };
      writeFileSync(join(root, "memories.json"), JSON.stringify(dup, null, 2));
      const r2 = regen(root, []);
      assert.equal(r2.status, 0);
      assert.ok(!r2.stdout.includes("## Contradictions"),
        "same-value duplicate flagged as contradiction (noise, not conflict)");
      assert.equal(r2.stdout.split("1.19.5").length - 1 >= 1, true,
        "deduped value vanished from the product");
      assert.match(r2.stdout, /global:exact:plugin_pin — @opencode-ai\/plugin 1\.19\.5/,
        "identity rendered more than once for a same-value duplicate");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("budget mechanism (fixture half): doctrine priority order, whole-entry fill, BOUND accounting, deterministic selection", () => {
    const root = fixtureDir("budget");
    try {
      const inject = (budget) =>
        spawnSync(
          "python3",
          [REGEN, "--print-injection", "--budget", String(budget),
           "--from-capture", join(root, "memories.json"),
           "--state", join(root, "state.json"), "--no-git"],
          { encoding: "utf-8", timeout: 30000 },
        );

      // missing budget → mechanism refuses (the bound is explicit; the
      // NUMERIC session-begin value lands with slice three)
      const noBudget = spawnSync(
        "python3", [REGEN, "--print-injection", "--from-capture", join(root, "memories.json"),
                    "--state", join(root, "state.json"), "--no-git"],
        { encoding: "utf-8", timeout: 30000 },
      );
      assert.equal(noBudget.status, 2, "missing --budget did not fail-closed");

      // zero bound → empty set, accounting exact
      const zero = inject(0);
      assert.equal(zero.status, 0);
      assert.equal(zero.stdout.split("\n").filter((l) => l.startsWith("- ")).length, 0);
      assert.match(zero.stdout, /BOUND: budget=0 selected=0 omitted_next=\S+/);

      // tight bound: only tier-0 (constraints) fit, in canonical key order
      // (the legacy slug constraint sorts before the pipe-format ones)
      const tight = inject(120);
      assert.equal(tight.status, 0);
      const tightEntries = tight.stdout.split("\n").filter((l) => l.startsWith("- "));
      assert.ok(tightEntries.length >= 1, "tight bound selected nothing");
      for (const line of tightEntries) {
        assert.ok(line.includes("constraint"), `non-constraint selected under tight bound: ${line}`);
      }
      assert.ok(!tight.stdout.includes("exact value") || tightEntries.every((l) => l.includes("constraint:")),
        "priority law violated: exact/dependency ahead of unselected constraints");
      assert.match(tight.stdout, /BOUND: budget=120 selected=\d+ omitted_next=\S+/);

      // generous bound: everything, constraints first (doctrine §3 order law)
      const wide = inject(100000);
      assert.equal(wide.status, 0);
      const wideEntries = wide.stdout.split("\n").filter((l) => l.startsWith("- "));
      assert.equal(wideEntries.length, Object.keys(CAPTURE).length - 1,
        "generous bound did not select every record");
      const firstTier = wideEntries.slice(0, 2).map((l) => l.includes("constraint"));
      assert.deepEqual(firstTier, [true, true], "constraints are not first under the order law");

      // determinism: same bound → same selection bytes
      const again = inject(120);
      assert.equal(again.stdout, tight.stdout, "same bound produced differing selections");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ordering law: canonical total order is (constraint → dependency/exact → rest) then identity bytes", () => {
    const root = fixtureDir("ordering");
    try {
      const r = regen(root, []);
      assert.equal(r.status, 0);
      const cache = r.stdout;
      const idx = (needle) => cache.indexOf(needle);
      const constraints = idx("never ship on a red suite");
      const deps = idx("gates depend on bd_remember.py argv shape");
      const exact = idx("@opencode-ai/plugin 1.19.5");
      const decision = idx("tests run against scratch fixtures");
      const next = idx("fresh-context audit");
      const files = idx("plugins/sisyphus-gates/src/gates.js — metachar screen");
      assert.ok(constraints !== -1 && deps !== -1 && exact !== -1 && decision !== -1,
        "fixture records missing from the product");
      // constraints before dependency/exact before the tier-3 categories —
      // checked within the Preserved Constraints / Active Dependencies /
      // Critical Values section ordering, not raw byte position (sections
      // render in schema order)
      const sec = (title) => cache.split(`## ${title}`)[1]?.split("\n## ")[0] ?? "";
      assert.ok(sec("Preserved Constraints").includes("never ship on a red suite"), "constraint misrouted");
      assert.ok(sec("Active Dependencies").includes("gates depend on bd_remember.py argv shape"), "dependency misrouted");
      assert.ok(sec("Critical Values").includes("@opencode-ai/plugin 1.19.5"), "exact misrouted");
      assert.ok(sec("Decisions Made").includes("tests run against scratch fixtures"), "decision misrouted");
      assert.ok(sec("Next Steps").includes("fresh-context audit"), "next misrouted");
      assert.ok(sec("Files Modified").includes("plugins/sisyphus-gates/src/gates.js — metachar screen"), "files misrouted");
      // identity byte order inside Preserved Constraints: legacy slug first
      const preservedLines = sec("Preserved Constraints").split("\n").filter((l) => l.startsWith("- "));
      assert.deepEqual(
        preservedLines.map((l) => l.slice(2).split(" — ")[0]),
        ["constraint-legacy-pi", "global:constraint:never_ship_red", "global:constraint:single_writer"],
        "canonical identity ordering violated inside a section",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
