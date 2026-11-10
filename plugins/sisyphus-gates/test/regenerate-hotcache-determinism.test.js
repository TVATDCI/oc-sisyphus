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
 *   - preference routing (build 3, the N5-class follow-up): preference
 *     records route to their own Preferences section — contradiction
 *     detection AND dedupe both bite on them (they escaped both while
 *     unrouted).
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
      assert.match(zero.stdout, /TRUNCATED: budget bound reached/,
        "zero bound cut every record — truncation marker must fire");

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
      // the VISIBLE truncation marker (slice three): a cutting bound names
      // the cut on stdout — never a silent drop
      assert.match(
        tight.stdout,
        /TRUNCATED: budget bound reached — \d+ record\(s\) omitted, first: global:constraint:never_ship_red/,
        "truncation marker missing (or wrong first-omitted identity) under a cutting bound",
      );

      // generous bound: everything, constraints first (doctrine §3 order law)
      const wide = inject(100000);
      assert.equal(wide.status, 0);
      const wideEntries = wide.stdout.split("\n").filter((l) => l.startsWith("- "));
      assert.equal(wideEntries.length, Object.keys(CAPTURE).length - 1,
        "generous bound did not select every record");
      const firstTier = wideEntries.slice(0, 2).map((l) => l.includes("constraint"));
      assert.deepEqual(firstTier, [true, true], "constraints are not first under the order law");
      // nothing cut → no truncation marker, accounting says none omitted,
      // and the structural review rides the same read (clean fixture)
      assert.ok(!wide.stdout.includes("TRUNCATED:"),
        "truncation marker present with nothing cut (marker must be conditional)");
      assert.match(wide.stdout, /BOUND: budget=100000 selected=\d+ omitted_next=none/);
      assert.match(wide.stdout, /REVIEW: contradictions=0 duplicate_identities=0 — clean/,
        "REVIEW line missing or not clean on a structurally clean fixture");

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

  test("N4 permutation pin: two permuted captures of the same records produce byte-identical products", () => {
    const root = fixtureDir("permutation");
    try {
      // the slice-two audit's D11 exotic: a same-identity intent
      // contradiction. Under insertion-order picking, two permuted captures
      // of these SAME records rendered byte-different products with
      // IDENTICAL fingerprints (--check called both CURRENT). The pin: the
      // summary pick sorts by bd_id, so capture order is irrelevant.
      const permuted = {
        ...CAPTURE,
        "global:intent:audit_goal": "scope=global|turn=20|category=intent|key=audit_goal|value=alpha side",
        "slug-intent-audit": "scope=global|turn=21|category=intent|key=audit_goal|value=beta side",
      };
      const keysA = Object.keys(permuted);
      const keysB = [...keysA].reverse();
      const cachePathA = join(root, "cache-a.md");
      const cachePathB = join(root, "cache-b.md");
      const run = (keys, out) => {
        const capture = {};
        for (const k of keys) capture[k] = permuted[k];
        writeFileSync(join(root, "memories.json"), JSON.stringify(capture, null, 2));
        return spawnSync(
          "python3", [REGEN, "--from-capture", join(root, "memories.json"),
                      "--state", join(root, "state.json"), "--no-git", "--out", out],
          { encoding: "utf-8", timeout: 30000 },
        );
      };
      const ra = run(keysA, cachePathA);
      const rb = run(keysB, cachePathB);
      assert.equal(ra.status, 0, `permutation leg A failed: ${ra.stderr}`);
      assert.equal(rb.status, 0, `permutation leg B failed: ${rb.stderr}`);
      const bytesA = readFileSync(cachePathA, "utf-8");
      const bytesB = readFileSync(cachePathB, "utf-8");
      assert.equal(bytesB, bytesA,
        "N4 FAILED: permuted capture order changed the product bytes (order instability)");
      // the pick is the bd_id-min side — deterministic; both sides still
      // surface verbatim in the Contradictions section (never a resolution)
      const m = bytesA.match(/^\*\*Original intent:\*\* (.+)$/m);
      assert.ok(m, "Original intent line missing from the product");
      assert.equal(m[1], "alpha side", "N4: intent pick is not the bd_id-min side");
      assert.match(bytesA, /## Contradictions \(resolution required\)/);
      assert.ok(bytesA.includes("beta side"), "N4: contradiction side B missing from the product");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("N5 reason routing: reason records route to Rationale — dedupe and contradiction detection no longer escape them", () => {
    const root = fixtureDir("reason");
    try {
      const withReason = {
        ...CAPTURE,
        "global:reason:why_gates": "scope=global|turn=30|category=reason|key=why_gates|value=gates exist to fail closed",
      };
      writeFileSync(join(root, "memories.json"), JSON.stringify(withReason, null, 2));
      const r = regen(root, []);
      assert.equal(r.status, 0, `regeneration failed: ${r.stderr}`);
      const cache = r.stdout;
      const rationale = cache.split("## Rationale")[1]?.split("\n## ")[0] ?? "";
      assert.ok(rationale.includes("gates exist to fail closed"),
        "N5 FAILED: reason record not routed to the Rationale section");
      assert.ok(cache.includes("gates exist to fail closed"),
        "N5: zero loss violated — reason value missing (routing lost it)");

      // same-value duplicate under a second bd id: deduped to one render
      // (pre-slice-three this escaped dedupe because unrouted records skip it)
      const dup = {
        ...withReason,
        "slug-reason-dup": "scope=global|turn=31|category=reason|key=why_gates|value=gates exist to fail closed",
      };
      writeFileSync(join(root, "memories.json"), JSON.stringify(dup, null, 2));
      const r2 = regen(root, []);
      assert.equal(r2.status, 0);
      const rationale2 = r2.stdout.split("## Rationale")[1]?.split("\n## ")[0] ?? "";
      assert.equal((rationale2.match(/gates exist to fail closed/g) || []).length, 1,
        "N5 FAILED: same-value reason duplicate rendered twice (dedupe escaped)");

      // differing value under the same write-law identity: contradiction
      // surfaced, Rationale must never read like a resolved pick
      const conflict = {
        ...withReason,
        "slug-reason-drift": "scope=global|turn=32|category=reason|key=why_gates|value=gates exist to fail open (drifted)",
      };
      writeFileSync(join(root, "memories.json"), JSON.stringify(conflict, null, 2));
      const r3 = regen(root, []);
      assert.equal(r3.status, 0);
      assert.match(r3.stdout, /## Contradictions \(resolution required\)/,
        "N5 FAILED: reason contradiction did not surface a resolution section");
      assert.match(r3.stderr, /CONTRADICTION global:reason:why_gates: 2 differing values surfaced/,
        "N5: reason contradiction not reported on the run channel");
      assert.ok(r3.stdout.includes("gates exist to fail open (drifted)"),
        "N5: reason contradiction side silently dropped");
      assert.match(r3.stdout, /RESOLUTION REQUIRED/);
      const rationale3 = r3.stdout.split("## Rationale")[1]?.split("\n## ")[0] ?? "";
      assert.ok(
        !rationale3.includes("fail closed") && !rationale3.includes("fail open"),
        "N5 FAILED: conflicted reason identity rendered as a resolved Rationale (silent pick)",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("preference routing (build 3, N5-class): preference records route to Preferences — contradiction detection and dedupe both bite", () => {
    const root = fixtureDir("preference");
    try {
      // positive routing: the preference record renders in its own
      // Preferences section, never under Additional Durable Records
      // (the N5-class unrouted escape this slice closes)
      const withPreference = {
        ...CAPTURE,
        "global:preference:flash_first": "scope=global|turn=50|category=preference|key=flash_first|value=flash-first seats for scoped mechanical ships",
      };
      writeFileSync(join(root, "memories.json"), JSON.stringify(withPreference, null, 2));
      const r = regen(root, []);
      assert.equal(r.status, 0, `regeneration failed: ${r.stderr}`);
      const cache = r.stdout;
      const preferences = cache.split("## Preferences")[1]?.split("\n## ")[0] ?? "";
      assert.ok(preferences.includes("flash-first seats for scoped mechanical ships"),
        "preference routing FAILED: preference record not routed to the Preferences section");
      const unrouted = cache.split("## Additional Durable Records")[1]?.split("\n## ")[0] ?? "";
      assert.ok(!unrouted.includes("global:preference:flash_first"),
        "preference routing: routed preference record still renders unrouted");
      assert.ok(cache.includes("flash-first seats for scoped mechanical ships"),
        "preference routing: zero loss violated — preference value missing (routing lost it)");

      // dedupe bites: same-value duplicate under a second bd id renders
      // once (unrouted records skip dedupe — routing is what makes this fire)
      const dup = {
        ...withPreference,
        "slug-preference-dup": "scope=global|turn=51|category=preference|key=flash_first|value=flash-first seats for scoped mechanical ships",
      };
      writeFileSync(join(root, "memories.json"), JSON.stringify(dup, null, 2));
      const r2 = regen(root, []);
      assert.equal(r2.status, 0);
      const preferences2 = r2.stdout.split("## Preferences")[1]?.split("\n## ")[0] ?? "";
      assert.equal((preferences2.match(/flash-first seats for scoped mechanical ships/g) || []).length, 1,
        "preference dedupe FAILED: same-value preference duplicate rendered twice (dedupe escaped)");

      // contradiction detection bites: differing value under the same
      // write-law identity surfaces RESOLUTION REQUIRED, and Preferences
      // must never read like a resolved pick
      const conflict = {
        ...withPreference,
        "slug-preference-drift": "scope=global|turn=52|category=preference|key=flash_first|value=strong-only seats everywhere (drifted)",
      };
      writeFileSync(join(root, "memories.json"), JSON.stringify(conflict, null, 2));
      const r3 = regen(root, []);
      assert.equal(r3.status, 0);
      assert.match(r3.stdout, /## Contradictions \(resolution required\)/,
        "preference contradiction FAILED: did not surface a resolution section");
      assert.match(r3.stderr, /CONTRADICTION global:preference:flash_first: 2 differing values surfaced/,
        "preference contradiction not reported on the run channel");
      assert.ok(r3.stdout.includes("strong-only seats everywhere (drifted)"),
        "preference contradiction side silently dropped");
      assert.match(r3.stdout, /RESOLUTION REQUIRED/);
      const preferences3 = r3.stdout.split("## Preferences")[1]?.split("\n## ")[0] ?? "";
      assert.ok(
        !preferences3.includes("flash-first seats") && !preferences3.includes("strong-only seats"),
        "conflicted preference identity rendered as a resolved Preferences pick (silent resolution)",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--review mode: structural candidates report — deterministic, stdout-only, surfaces never deletes", () => {
    const root = fixtureDir("review");
    try {
      const dirty = {
        ...CAPTURE,
        "global:reason:why_review": "scope=global|turn=40|category=reason|key=why_review|value=reviews surface, never delete",
        "slug-reason-review-dup": "scope=global|turn=41|category=reason|key=why_review|value=reviews surface, never delete",
        "slug-exact-drift-review": "scope=global|turn=42|category=exact|key=plugin_pin|value=@opencode-ai/plugin 1.21.0 (drifted for review)",
        "global:preference:vote_style": "scope=global|turn=43|category=preference|key=vote_style|value=preferences surface, never delete",
        "slug-preference-review-dup": "scope=global|turn=44|category=preference|key=vote_style|value=preferences surface, never delete",
      };
      writeFileSync(join(root, "memories.json"), JSON.stringify(dirty, null, 2));
      const run = () => spawnSync(
        "python3", [REGEN, "--review", "--from-capture", join(root, "memories.json")],
        { encoding: "utf-8", timeout: 30000 },
      );
      const r1 = run();
      assert.equal(r1.status, 0, `--review failed: ${r1.stderr}`);
      assert.match(r1.stdout, /MEMORY REVIEW: \d+ records — 1 contradiction\(s\), 2 duplicate identit\(ies\)/,
        "--review header counts wrong");
      assert.match(r1.stdout, /## Contradictions \(resolution required\)/);
      assert.match(r1.stdout, /global:exact:plugin_pin: 2 differing values/);
      assert.match(r1.stdout, /## Duplicate identities/);
      assert.match(r1.stdout, /global:reason:why_review: 2 copies/,
        "--review missed the reason-category duplicate (N5 class)");
      assert.match(r1.stdout, /global:preference:vote_style: 2 copies/,
        "--review missed the preference-category duplicate (N5-class build-3 routing)");
      assert.match(r1.stdout, /RESOLUTION REQUIRED/);
      assert.match(r1.stdout, /never auto-deleted/);
      assert.match(r1.stdout, /SCOPE: this report SURFACES candidates only/);
      // deterministic: two runs, byte-identical report
      const r2 = run();
      assert.equal(r2.stdout, r1.stdout, "--review output not deterministic");

      // clean store → the fixed clean line (placeholder discipline)
      writeFileSync(join(root, "memories-clean.json"), JSON.stringify(CAPTURE, null, 2));
      const rClean = spawnSync(
        "python3", [REGEN, "--review", "--from-capture", join(root, "memories-clean.json")],
        { encoding: "utf-8", timeout: 30000 },
      );
      assert.equal(rClean.status, 0);
      assert.match(rClean.stdout, /REVIEW CLEAN: no structural candidates/);
      assert.ok(!rClean.stdout.includes("## Contradictions"),
        "clean store produced a contradictions section");

      // the injection run carries the REVIEW line — the structural scan
      // rides the same read at zero extra cost (session-begin surfaces it)
      const inj = spawnSync(
        "python3", [REGEN, "--print-injection", "--budget", "100000",
                    "--from-capture", join(root, "memories.json")],
        { encoding: "utf-8", timeout: 30000 },
      );
      assert.equal(inj.status, 0, `injection run failed: ${inj.stderr}`);
      assert.match(
        inj.stdout,
        /REVIEW: contradictions=1 duplicate_identities=2 — run scripts\/regenerate_hotcache\.py --review/,
        "injection output lacks the dirty-store REVIEW line",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
