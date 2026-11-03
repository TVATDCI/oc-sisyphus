/**
 * test/memory-standing-set.test.js — the sis-memory doctrine's STANDING TEST
 * SET T1–T6 (slice two of the sis-memory implementation, captain word
 * 2026-11-03 "begin with slices two and three"; doctrine of record:
 * skills/memory-doctrine/SKILL.md §1–§3).
 *
 *   T1 cold-start recall        — a fact written through the wrapper is
 *                                 recallable in a cold start.
 *   T2 failed-write reporting   — a failed bd write surfaces through the
 *                                 degraded-mode sink — never silent.
 *   T3 hotcache recovery        — delete/corrupt the cache; regeneration
 *                                 rebuilds from authority with zero loss and
 *                                 no phantom entries.
 *   T4 contradiction surfacing  — two contradictory durable facts surface
 *                                 for resolution — never silently resolved.
 *   T5 bounded hydration        — the budget mechanism exists and enforces a
 *                                 bound (the NUMERIC budget value is slice
 *                                 three — tested here with fixture bounds).
 *   T6 cross-desk isolation     — one desk's memory surfaces cannot read or
 *                                 write the other desk's store (path/env
 *                                 isolation asserted).
 *
 * Isolation envelope (every bd invocation, fleet law): scratch tmpdir cwd,
 * HOME + five XDG vars + BEADS_DIR all pinned into the scratch root — never
 * the live desk store, never a tracked repo as cwd. bd-live legs skip
 * (counted, never a silent green) when bd is absent (CI); fixture legs always
 * run.
 *
 * Run: `npm test` or `node --test test/memory-standing-set.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chmodSync } from "node:fs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TEST_DIR, "..", "..", "..");
const WRAPPER = join(REPO_ROOT, "scripts", "bd_remember.py");
const SCAN = join(REPO_ROOT, "scripts", "check_degraded_mode.py");
const REGEN = join(REPO_ROOT, "scripts", "regenerate_hotcache.py");

// ── bd availability (counted skip, never silent green) ──────────────────────

function bdVersion() {
  const r = spawnSync("bd", ["--version"], { encoding: "utf-8", timeout: 15000 });
  return r.status === 0 ? r.stdout.trim() : null;
}
const BD_AVAILABLE = bdVersion() !== null;

// ── isolation envelope helpers ──────────────────────────────────────────────

function scratchRoot(label) {
  return mkdtempSync(join(tmpdir(), `mem-${label}-`));
}

/**
 * Fleet isolation law (Nov 2 entry phrasing): HOME + five XDG + BEADS_DIR —
 * plus the GIT_* vars git injects into HOOK environments (GIT_DIR et al).
 * Without the strip, any test spawned from a git hook (the repo's pre-push
 * hook runs this suite!) silently reroutes its git/bd subprocesses into the
 * checkout repo — the 2026-11-03 incident this standing set now guards
 * against (see the GIT_DIR immunity test below).
 */
function envelope(root, storeBeadsDir) {
  const env = {
    ...process.env,
    HOME: root,
    XDG_CONFIG_HOME: join(root, ".config"),
    XDG_DATA_HOME: join(root, ".local/share"),
    XDG_CACHE_HOME: join(root, ".cache"),
    XDG_STATE_HOME: join(root, ".local/state"),
    XDG_RUNTIME_DIR: join(root, ".run"),
    BEADS_DIR: storeBeadsDir,
  };
  for (const k of [
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR",
  ]) {
    delete env[k];
  }
  return {
    cwd: join(root, "cwd"),
    env,
    encoding: "utf-8",
    timeout: 180000,
  };
}

function initStore(root, deskLabel) {
  const storeDir = join(root, deskLabel, "store");
  const beadsDir = join(storeDir, ".beads");
  mkdirSync(join(root, "cwd"), { recursive: true });
  mkdirSync(storeDir, { recursive: true });
  const r = spawnSync("bd", ["init", "--prefix", "t"], envelope(root, beadsDir));
  assert.equal(r.status, 0, `bd init failed: ${r.stderr}`);
  return beadsDir;
}

function wrapperWrite(root, beadsDir, { scope, turn, category, key, value }) {
  return spawnSync(
    "python3",
    [WRAPPER, "--scope", scope, "--turn", String(turn),
     "--category", category, "--key", key, "--value", value],
    envelope(root, beadsDir),
  );
}

function readMemories(root, beadsDir) {
  const r = spawnSync("bd", ["memories", "--json"], envelope(root, beadsDir));
  assert.equal(r.status, 0, `bd memories --json failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** Scratch git repo with a pinned-date commit — deterministic git input.
 *  GIT_* vars stripped: the same hook-env leak the envelope guards (git sets
 *  GIT_DIR when spawning hooks; a suite run from inside one must never let
 *  fixture commits land in the checkout repo — 2026-11-03 incident). */
function initGitRepo(root, subject) {
  const repo = join(root, "fixture-repo");
  mkdirSync(repo, { recursive: true });
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: "2026-11-03T10:00:00Z",
    GIT_COMMITTER_DATE: "2026-11-03T10:00:00Z",
    GIT_AUTHOR_NAME: "fixture",
    GIT_COMMITTER_NAME: "fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    HOME: root,
  };
  for (const k of [
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR",
  ]) {
    delete env[k];
  }
  const opts = { cwd: repo, env, encoding: "utf-8" };
  writeFileSync(join(repo, "f.txt"), "fixture\n");
  execFileSync("git", ["init", "-q"], opts);
  execFileSync("git", ["add", "f.txt"], opts);
  execFileSync("git", ["commit", "-q", "-m", subject], opts);
  return repo;
}

function regenerate(root, { beadsDir, statePath, gitRepo, outPath, extraArgs = [] }) {
  return spawnSync(
    "python3",
    [REGEN, "--beads-dir", beadsDir, "--state", statePath,
     ...(gitRepo ? ["--git-repo", gitRepo] : []),
     "--out", outPath, ...extraArgs],
    envelope(root, beadsDir),
  );
}

const FIXTURE_STATE = {
  schema_version: 2,
  project: "standing-set",
  phase: "execution",
  prd_gate: "pass",
  plan_gate: "pass",
  approval_status: "approved",
  // wall-clock noise + decoy: must never reach the projection
  last_updated: "2026-11-03T00:00:00.000Z",
  secret_decoy: "NEVER-IN-PRODUCT-xyzzy",
};

function writeFixtureState(root) {
  const p = join(root, "state.json");
  writeFileSync(p, JSON.stringify(FIXTURE_STATE, null, 2));
  return p;
}

// ════════════════════════════════════════════════════════════════════════════

describe("memory doctrine standing set (T1–T6)", () => {

  test("T1 cold-start recall: wrapper-written fact recallable in a cold start", (t) => {
    if (!BD_AVAILABLE) {
      t.skip("bd unavailable — standing set leg requires a real store");
      return;
    }
    const root = scratchRoot("t1");
    try {
      const beadsDir = initStore(root, "deskA");
      const value = "T1 cold-start recall fact — 42 retries at 30s";
      const w = wrapperWrite(root, beadsDir, {
        scope: "global", turn: 1, category: "exact", key: "t1_fact", value,
      });
      assert.equal(w.status, 0, `wrapper write failed: ${w.stderr}`);

      // COLD START: a brand-new process, zero shared state, store re-read
      // from disk. The wrapper process above is gone; only the store carries
      // the fact.
      const mem = readMemories(root, beadsDir);
      const record = mem["global:exact:t1_fact"];
      assert.ok(record, "T1 FAILED: fact written through the wrapper is not recallable in a cold start");
      assert.ok(record.includes(value), `T1: recalled record lost the value verbatim: ${record}`);
      assert.ok(record.includes("category=exact"), "T1: record lost its category field");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("T2 failed-write reporting: failed bd write surfaces through the degraded-mode sink", () => {
    const root = scratchRoot("t2");
    try {
      mkdirSync(join(root, "cwd"), { recursive: true });
      // fake bd that always fails — the wrapper must record the failure in
      // the sink AND echo it on stderr (never silent), and the scan must
      // turn the sink record into a degraded-mode trigger.
      const shim = join(root, "shim");
      mkdirSync(shim, { recursive: true });
      const fakeBd = join(shim, "bd");
      writeFileSync(fakeBd, "#!/bin/sh\necho 'boom — simulated bd failure' >&2\nexit 1\n");
      chmodSyncStubs(fakeBd);
      const statusFile = join(root, "extractor-status.json");
      const env = envelope(root, join(root, "store", ".beads"));
      env.env.PATH = `${shim}:${env.env.PATH}`;

      const w = spawnSync(
        "python3",
        [WRAPPER, "--scope", "global", "--turn", "1", "--category", "exact",
         "--key", "t2_fact", "--value", "never stored",
         "--status-file", statusFile],
        env,
      );
      assert.notEqual(w.status, 0, "T2: wrapper exited 0 against a failing bd");
      assert.ok(w.stderr.includes("boom"), "T2: failure not echoed on stderr (silent class)");
      assert.ok(existsSync(statusFile), "T2: degraded-mode sink not written on failure");
      const sink = JSON.parse(readFileSync(statusFile, "utf-8"));
      assert.equal(sink.ok, false, "T2: sink does not record ok:false");
      assert.match(sink.error, /exit 1/, "T2: sink error does not carry the failure");

      // the sink must SURFACE: the deterministic scan turns it into a trigger
      // (hotcache fixture complete so the ONLY trigger variable is the sink)
      const hotcacheFixture = join(root, "hotcache.md");
      writeFileSync(
        hotcacheFixture,
        [
          "# Session Handoff",
          "",
          "**Compacted at:** 2026-11-03T00:00:00Z",
          "**Original intent:** T2 fixture",
          "**Current phase:** execution",
          "",
          "## Files Modified",
          "- fixture",
          "",
          "## Decisions Made",
          "- fixture",
          "",
          "## Next Steps",
          "- fixture",
          "",
          "## Evidence References",
          "- fixture",
          "",
          "## Preserved Constraints",
          "- fixture constraint",
          "",
          "## Critical Values",
          "- fixture value",
          "",
        ].join("\n"),
      );
      const scanArgs = ["--hotcache", hotcacheFixture, "--status-file", statusFile];
      const s = spawnSync(
        "python3",
        [SCAN, ...scanArgs],
        { encoding: "utf-8", timeout: 30000 },
      );
      assert.equal(s.status, 1, "T2: scan did not fire on extractor failure");
      assert.match(s.stdout, /TRIGGER extractor-failed-last-run/, "T2: scan output lacks the trigger");

      // control: a succeeding write records ok:true and the scan cleans
      const shimOk = join(root, "shim-ok");
      mkdirSync(shimOk, { recursive: true });
      writeFileSync(join(shimOk, "bd"), "#!/bin/sh\necho 'remembered'\nexit 0\n");
      chmodSyncStubs(join(shimOk, "bd"));
      env.env.PATH = `${shimOk}:${env.env.PATH}`;
      const w2 = spawnSync(
        "python3",
        [WRAPPER, "--scope", "global", "--turn", "2", "--category", "exact",
         "--key", "t2_ok", "--value", "recorded",
         "--status-file", statusFile],
        env,
      );
      assert.equal(w2.status, 0, "T2: wrapper failed against a succeeding bd");
      const sink2 = JSON.parse(readFileSync(statusFile, "utf-8"));
      assert.equal(sink2.ok, true, "T2: sink does not record ok:true after success");
      const s2 = spawnSync(
        "python3",
        [SCAN, ...scanArgs],
        { encoding: "utf-8", timeout: 30000 },
      );
      assert.notEqual(s2.status, 1, "T2: scan still fires after a healthy run");
      assert.doesNotMatch(
        s2.stdout,
        /extractor-failed-last-run/,
        "T2: stale trigger persisted past a healthy run",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("T3 recovery: delete/corrupt the cache — regeneration rebuilds byte-identical, zero loss, no phantom", (t) => {
    if (!BD_AVAILABLE) {
      t.skip("bd unavailable — standing set leg requires a real store");
      return;
    }
    const root = scratchRoot("t3");
    try {
      const beadsDir = initStore(root, "deskA");
      const statePath = writeFixtureState(root);
      const gitRepo = initGitRepo(root, "T3 fixture head commit");
      const cachePath = join(root, "hotcache.md");

      const seeds = [
        { category: "constraint", key: "t3_rule", value: "T3 seeded hard constraint — never ship red" },
        { category: "exact", key: "t3_pin", value: "plugin pinned at 1.19.5" },
        { category: "decision", key: "t3_choice", value: "chose fixture store over live store — isolation" },
        { category: "next", key: "t3_step", value: "audit the branch, then stop" },
      ];
      for (const [i, s] of seeds.entries()) {
        const w = wrapperWrite(root, beadsDir, { scope: "global", turn: i + 1, ...s });
        assert.equal(w.status, 0, `seed write failed (${s.key}): ${w.stderr}`);
      }

      const r1 = regenerate(root, { beadsDir, statePath, gitRepo, outPath: cachePath });
      assert.equal(r1.status, 0, `regeneration failed: ${r1.stderr}`);
      const bytesA = readFileSync(cachePath, "utf-8");

      // ── deletion ──
      rmSync(cachePath, { force: true });
      assert.ok(!existsSync(cachePath), "fixture: cache did not delete");
      const r2 = regenerate(root, { beadsDir, statePath, gitRepo, outPath: cachePath });
      assert.equal(r2.status, 0, `regeneration after deletion failed: ${r2.stderr}`);
      const bytesB = readFileSync(cachePath, "utf-8");
      assert.equal(bytesB, bytesA, "T3 FAILED: rebuild after deletion is not byte-identical (nondeterministic product)");

      // ── corruption ──
      writeFileSync(cachePath, "# garbage\nNOT A CACHE\n");
      const r3 = regenerate(root, { beadsDir, statePath, gitRepo, outPath: cachePath });
      assert.equal(r3.status, 0, `regeneration after corruption failed: ${r3.stderr}`);
      assert.equal(readFileSync(cachePath, "utf-8"), bytesA, "T3 FAILED: rebuild after corruption diverged");

      // ── zero loss: every seeded fact verbatim in the product ──
      for (const s of seeds) {
        assert.ok(bytesA.includes(s.value), `T3: zero-loss violated — seeded value missing: ${s.key}`);
      }
      assert.ok(bytesA.includes("T3 fixture head commit"), "T3: git-head boss input missing from the product");

      // ── no phantom: nothing appears that the bosses don't carry ──
      assert.ok(!bytesA.includes("NEVER-IN-PRODUCT-xyzzy"), "T3: state decoy leaked into the product");
      assert.ok(!bytesA.includes("phantom-t3-canary"), "T3: phantom canary present");
      // every rendered record line must trace to a seeded identity
      const recordLines = bytesA.split("\n").filter((l) => /^- global:.* — /.test(l));
      const seededIdentities = seeds.map((s) => `global:${s.category}:${s.key}`);
      for (const line of recordLines) {
        const identity = line.slice(2).split(" — ")[0];
        assert.ok(
          seededIdentities.includes(identity),
          `T3: phantom record in product: ${identity}`,
        );
      }
      assert.equal(recordLines.length, seeds.length, "T3: rendered record count != seeded count (loss or phantom)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("T4 contradiction surfacing: two contradictory durable facts surface — never silently resolved", (t) => {
    if (!BD_AVAILABLE) {
      t.skip("bd unavailable — standing set leg requires a real store");
      return;
    }
    const root = scratchRoot("t4");
    try {
      const beadsDir = initStore(root, "deskA");
      const statePath = writeFixtureState(root);
      const cachePath = join(root, "hotcache.md");

      // side 1: through the sole door (wrapper, --key → update-in-place shape)
      const w1 = wrapperWrite(root, beadsDir, {
        scope: "global", turn: 1, category: "exact", key: "t4_timeout", value: "30s",
      });
      assert.equal(w1.status, 0, `side-1 write failed: ${w1.stderr}`);
      // side 2: a hand-run write WITHOUT --key (the off-door shape the write
      // law forbids) — same identity, different value → the drift class the
      // regenerator must catch. argv array: the pipe never touches a shell.
      const rec = "scope=global|turn=2|category=exact|key=t4_timeout|value=60s";
      const w2 = spawnSync("bd", ["remember", rec], envelope(root, beadsDir));
      assert.equal(w2.status, 0, `side-2 write failed: ${w2.stderr}`);

      const r = regenerate(root, { beadsDir, statePath, gitRepo: null, outPath: cachePath });
      assert.equal(r.status, 0, `regeneration failed: ${r.stderr}`);
      const cache = readFileSync(cachePath, "utf-8");

      assert.match(
        cache, /## Contradictions \(resolution required\)/,
        "T4 FAILED: contradictory facts did not surface a resolution section",
      );
      assert.ok(cache.includes("30s"), "T4: side 1 silently dropped (newest-wins resolution)");
      assert.ok(cache.includes("60s"), "T4: side 2 silently dropped (order-wins resolution)");
      assert.match(cache, /RESOLUTION REQUIRED/, "T4: surfaced conflict carries no resolution demand");
      assert.match(r.stderr, /CONTRADICTION global:exact:t4_timeout/, "T4: contradiction not reported on the run channel");
      // no silent pick: the Critical Values section must NOT carry either
      // value alone as if resolved
      const critical = cache.split("## Critical Values")[1]?.split("## ")[0] ?? "";
      assert.ok(
        !critical.includes("30s") && !critical.includes("60s"),
        "T4: conflicted identity rendered as a resolved Critical Value (silent pick)",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("T5 bounded hydration: the budget mechanism exists and enforces a bound", (t) => {
    if (!BD_AVAILABLE) {
      t.skip("bd unavailable — standing set leg requires a real store");
      return;
    }
    const root = scratchRoot("t5");
    try {
      const beadsDir = initStore(root, "deskA");
      const statePath = writeFixtureState(root);

      const seeds = [
        { category: "constraint", key: "t5_c1", value: "constraint one — always first" },
        { category: "constraint", key: "t5_c2", value: "constraint two — also first tier" },
        { category: "exact", key: "t5_x1", value: "exact value — tier two" },
        { category: "decision", key: "t5_d1", value: "decision — tier three, first out under a tight bound" },
        { category: "next", key: "t5_n1", value: "next step — tier three" },
      ];
      for (const [i, s] of seeds.entries()) {
        const w = wrapperWrite(root, beadsDir, { scope: "global", turn: i + 1, ...s });
        assert.equal(w.status, 0, `seed write failed (${s.key}): ${w.stderr}`);
      }

      const inject = (budget) =>
        spawnSync(
          "python3",
          [REGEN, "--print-injection", "--budget", String(budget),
           "--beads-dir", beadsDir, "--state", statePath, "--no-git"],
          envelope(root, beadsDir),
        );

      // tight bound: fits constraints only (mechanism enforces the bound)
      const tight = inject(160);
      assert.equal(tight.status, 0, `injection run failed: ${tight.stderr}`);
      const tightLines = tight.stdout.split("\n").filter((l) => l.startsWith("- "));
      assert.ok(tightLines.length >= 1, "T5: tight bound selected nothing");
      assert.ok(
        tightLines.every((l) => l.includes("constraint")),
        `T5 FAILED: bound did not hold the priority law (non-constraint selected first): ${tightLines}`,
      );
      assert.match(tight.stdout, /BOUND: budget=160 selected=\d+ omitted_next=\S+/,
        "T5: BOUND accounting line missing");
      assert.ok(!tight.stdout.includes("decision — tier three"), "T5: budget exceeded (tier-three entry selected under tight bound)");

      // generous bound: everything fits
      const wide = inject(100000);
      const wideLines = wide.stdout.split("\n").filter((l) => l.startsWith("- "));
      assert.equal(wideLines.length, seeds.length, "T5: generous bound did not select all entries");

      // zero bound: the mechanism enforces the empty set
      const zero = inject(0);
      assert.equal(zero.stdout.split("\n").filter((l) => l.startsWith("- ")).length, 0,
        "T5: zero budget selected entries");
      assert.match(zero.stdout, /BOUND: budget=0 selected=0 omitted_next=\S+/, "T5: zero-bound accounting wrong");

      // determinism: same bound → same selection (two contexts, same bytes)
      const again = inject(160);
      assert.equal(again.stdout, tight.stdout, "T5: same bound produced differing selections");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("T6 cross-desk isolation: one desk's surfaces cannot read or write the other desk's store", (t) => {
    if (!BD_AVAILABLE) {
      t.skip("bd unavailable — standing set leg requires a real store");
      return;
    }
    const root = scratchRoot("t6");
    try {
      // two sovereign desk roots — different HOME, different store, shared
      // nothing but the machine
      const deskA = join(root, "deskA");
      const deskB = join(root, "deskB");
      mkdirSync(join(root, "cwd"), { recursive: true });
      const beadsA = initStore(deskA, "store");
      const beadsB = initStore(deskB, "store");

      // write through desk A's envelope
      const wA = wrapperWrite(deskA, beadsA, {
        scope: "global", turn: 1, category: "constraint", key: "t6_desk_a", value: "desk A fact",
      });
      assert.equal(wA.status, 0, `desk A write failed: ${wA.stderr}`);

      // desk A's store carries it …
      const memA1 = readMemories(deskA, beadsA);
      assert.ok(memA1["global:constraint:t6_desk_a"], "T6: desk A write did not land in desk A's store");

      // … and desk B's cannot see it (path/env isolation: B's read resolves
      // only B's store)
      const memB1 = readMemories(deskB, beadsB);
      assert.ok(!memB1["global:constraint:t6_desk_a"], "T6 FAILED: desk B READ desk A's fact — cross-desk isolation broken");

      // desk B writes its own fact; A still cannot see it, A's fact untouched
      const wB = wrapperWrite(deskB, beadsB, {
        scope: "global", turn: 1, category: "constraint", key: "t6_desk_b", value: "desk B fact",
      });
      assert.equal(wB.status, 0, `desk B write failed: ${wB.stderr}`);
      const memA2 = readMemories(deskA, beadsA);
      const memB2 = readMemories(deskB, beadsB);
      assert.ok(memA2["global:constraint:t6_desk_a"], "T6: desk A's fact vanished (cross-write)");
      assert.ok(!memA2["global:constraint:t6_desk_b"], "T6 FAILED: desk B's write landed in desk A's store");
      assert.ok(memB2["global:constraint:t6_desk_b"], "T6: desk B's own write missing from its store");
      assert.ok(!memB2["global:constraint:t6_desk_a"], "T6: desk B gained desk A's fact after its own write");

      // default-resolution leg: with BEADS_DIR unset, the wrapper resolves
      // its store under $HOME/Main-vault/.beads — desk-scoped by HOME, never
      // a hardcoded path. Init a HOME-relative store for desk A, write with
      // NO BEADS_DIR, and prove the fact landed in desk A's HOME tree only.
      const homeStore = join(deskA, "Main-vault", ".beads");
      mkdirSync(homeStore, { recursive: true });
      const ienv = envelope(deskA, homeStore);
      const init = spawnSync("bd", ["init", "--prefix", "h"], ienv);
      assert.equal(init.status, 0, `HOME-relative init failed: ${init.stderr}`);
      const wDefault = spawnSync(
        "python3",
        [WRAPPER, "--scope", "global", "--turn", "2", "--category", "exact",
         "--key", "t6_default_home", "--value", "default resolution fact"],
        ienv,
      );
      assert.equal(wDefault.status, 0, `HOME-default write failed: ${wDefault.stderr}`);
      const homeMem = readMemories(deskA, homeStore);
      assert.ok(
        homeMem["global:exact:t6_default_home"],
        "T6: HOME-default resolution did not land inside the desk's own HOME tree",
      );
      // and desk B's HOME-relative tree never materialized a copy
      const homeB = join(deskB, "Main-vault", ".beads", "embeddeddolt");
      assert.ok(!existsSync(homeB), "T6: desk B's HOME tree carries desk A's default-store content");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("T6 static leg: desk isolation is path/env-derived, never a hardcoded desk path", () => {
    const src = readFileSync(WRAPPER, "utf-8");
    assert.ok(
      !src.includes("/home/vladi"),
      "T6: wrapper hardcodes a desk-absolute path — cross-desk isolation by construction broken",
    );
    assert.ok(
      src.includes("expanduser"),
      "T6: wrapper no longer resolves its default store via HOME (expanduser) — desk scoping lost",
    );
    assert.match(
      src,
      /os\.environ\.get\(\s*"BEADS_DIR"/,
      "T6: wrapper no longer honors the BEADS_DIR env pin — cwd-independent store resolution lost",
    );
  });

  test("GIT_DIR immunity: inherited git-hook env vars cannot reroute fixture git ops into the checkout repo", (t) => {
    if (!BD_AVAILABLE) {
      t.skip("bd unavailable — standing set leg requires a real store");
      return;
    }
    const root = scratchRoot("t7");
    try {
      const beadsDir = initStore(root, "deskA");
      const statePath = writeFixtureState(root);
      const gitRepo = initGitRepo(root, "T7 fixture head commit");
      const cachePath = join(root, "hotcache.md");

      // Simulate the hook environment that caused the 2026-11-03 incident:
      // run the flow with GIT_DIR deliberately poisoned in the test process
      // env. The envelope/initGitRepo strips must make every fixture git op
      // land in the scratch repo — never the checkout hosting the suite.
      const poisoned = process.env.GIT_DIR;
      process.env.GIT_DIR = "/definitely-not-a-real-git-dir-t7";
      const cleanGitEnv = { ...process.env };
      delete cleanGitEnv.GIT_DIR;
      const gitOpts = { encoding: "utf-8", timeout: 15000, env: cleanGitEnv };
      let worktreeHeadBefore;
      try {
        worktreeHeadBefore = spawnSync("git", ["rev-parse", "HEAD"], gitOpts).stdout.trim();

        const w = wrapperWrite(root, beadsDir, {
          scope: "global", turn: 1, category: "next", key: "t7_step", value: "T7 poisoned-env step",
        });
        assert.equal(w.status, 0, `seed write failed under poisoned env: ${w.stderr}`);
        const r = regenerate(root, { beadsDir, statePath, gitRepo, outPath: cachePath });
        assert.equal(r.status, 0, `regeneration failed under poisoned env: ${r.stderr}`);
        const cache = readFileSync(cachePath, "utf-8");
        assert.ok(
          cache.includes("T7 fixture head commit"),
          "GIT_DIR leak: regenerator read the wrong repo's head under a poisoned env",
        );
        const mem = readMemories(root, beadsDir);
        assert.ok(mem["global:next:t7_step"], "GIT_DIR leak: bd store resolution disturbed by poisoned env");
      } finally {
        if (poisoned === undefined) {
          delete process.env.GIT_DIR;
        } else {
          process.env.GIT_DIR = poisoned;
        }
      }

      // the checkout repo hosting this suite run must be untouched
      const worktreeHeadAfter = spawnSync("git", ["rev-parse", "HEAD"], gitOpts).stdout.trim();
      assert.equal(
        worktreeHeadAfter, worktreeHeadBefore,
        "GIT_DIR immunity broken: a commit landed in the checkout repo while the suite ran under a poisoned env",
      );
      const worktreeStatus = spawnSync("git", ["status", "--short"], gitOpts).stdout.trim();
      assert.ok(
        !worktreeStatus.includes("f.txt"),
        "GIT_DIR immunity broken: fixture file f.txt leaked into the checkout repo's status",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// chmod helper for the PATH-shim stubs
function chmodSyncStubs(p) {
  chmodSync(p, 0o755);
}
