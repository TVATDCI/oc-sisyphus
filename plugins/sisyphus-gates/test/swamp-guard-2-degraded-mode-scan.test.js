/**
 * test/swamp-guard-2-degraded-mode-scan.test.js — Swamp Club Guard 2
 * (Oracle Gate-2 Upgrade 2a, ADOPT AS CHEAP FAIL-CLOSED INSTRUMENTATION):
 * deterministic degraded-mode trigger scan, post-compaction / post-resume.
 *
 * Contract under test (scripts/check_degraded_mode.py):
 *   - handoff missing / schema-incomplete sections -> TRIGGER
 *   - Preserved Constraints present but empty     -> TRIGGER (detection only)
 *   - bd_remember.py last recorded run failed     -> TRIGGER
 *   - complete hotcache + healthy extractor       -> CLEAN, exit 0
 *   - unparseable status file (can't verify)      -> TRIGGER (fail-closed)
 *   - bd_remember.py records ok:false on bd failure, ok:true on success,
 *     and NOTHING on --dry-run (status sink is the mechanical signal)
 *
 * Run: `npm test` or `node --test test/swamp-guard-2-degraded-mode-scan.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TEST_DIR, "..", "..", "..");
const SCAN = join(REPO_ROOT, "scripts", "check_degraded_mode.py");
const BD = join(REPO_ROOT, "scripts", "bd_remember.py");

function runScan(hotcache, statusFile) {
  return spawnSync(
    "python3",
    [SCAN, "--hotcache", hotcache, "--status-file", statusFile],
    { encoding: "utf-8", timeout: 30000 },
  );
}

const COMPLETE_HANDOFF = [
  "# Session Handoff",
  "",
  "**Compacted at:** 2026-10-27T00:00:00Z",
  "**Original intent:** ship the swamp guards",
  "**Current phase:** execution",
  "",
  "## Files Modified",
  "- scripts/check_degraded_mode.py",
  "",
  "## Decisions Made",
  "- guard 2 adopted per Oracle 2a",
  "",
  "## Next Steps",
  "- wire the scan into compaction",
  "",
  "## Evidence References",
  "- ~/.sisyphus/evidence/x.md",
  "",
  "## Preserved Constraints",
  "- fail-closed gates are correct behavior",
  "",
  "## Critical Values",
  "- suite baseline: 692 tests",
  "",
].join("\n");

function makeHandoff(dir, name, text) {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
}

function makeStatus(dir, obj) {
  const p = join(dir, "extractor-status.json");
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

function withFixtures(fn) {
  const dir = mkdtempSync(join(tmpdir(), "g2-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Guard 2 — degraded-mode trigger scan (deterministic, fail-closed direction)", () => {
  test("complete hotcache + healthy extractor -> CLEAN, exit 0", () => {
    withFixtures((dir) => {
      const hc = makeHandoff(dir, "hotcache.md", COMPLETE_HANDOFF);
      const st = makeStatus(dir, { last_run: "2026-10-27T00:00:00+00:00", ok: true, error: null });
      const res = runScan(hc, st);
      assert.equal(res.status, 0, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
      assert.match(res.stdout, /CLEAN: no mechanical degraded-mode triggers/);
      assert.doesNotMatch(res.stdout, /TRIGGER/);
      assert.match(res.stdout, /detection only/); // consumption contract printed
    });
  });

  test("missing hotcache file -> handoff-missing TRIGGER, exit 1", () => {
    withFixtures((dir) => {
      const st = makeStatus(dir, { last_run: "2026-10-27T00:00:00+00:00", ok: true, error: null });
      const res = runScan(join(dir, "nope.md"), st);
      assert.equal(res.status, 1);
      assert.match(res.stdout, /TRIGGER handoff-missing:/);
    });
  });

  test("handoff missing Critical Values section -> schema-incomplete TRIGGER", () => {
    withFixtures((dir) => {
      const broken = COMPLETE_HANDOFF.replace("## Critical Values\n- suite baseline: 692 tests\n", "");
      const hc = makeHandoff(dir, "hotcache.md", broken);
      const st = makeStatus(dir, { last_run: "2026-10-27T00:00:00+00:00", ok: true, error: null });
      const res = runScan(hc, st);
      assert.equal(res.status, 1);
      assert.match(res.stdout, /TRIGGER schema-incomplete: missing handoff sections: Critical Values/);
    });
  });

  test("missing 'Compacted at:' marker -> schema-incomplete TRIGGER", () => {
    withFixtures((dir) => {
      const broken = COMPLETE_HANDOFF.replace("**Compacted at:** 2026-10-27T00:00:00Z\n", "");
      const hc = makeHandoff(dir, "hotcache.md", broken);
      const st = makeStatus(dir, { last_run: "2026-10-27T00:00:00+00:00", ok: true, error: null });
      const res = runScan(hc, st);
      assert.equal(res.status, 1);
      assert.match(res.stdout, /TRIGGER schema-incomplete: missing 'Compacted at:' marker/);
    });
  });

  test("empty Preserved Constraints section -> constraints-absent TRIGGER (detection only)", () => {
    withFixtures((dir) => {
      const empty = COMPLETE_HANDOFF.replace(
        "## Preserved Constraints\n- fail-closed gates are correct behavior\n",
        "## Preserved Constraints\n",
      );
      const hc = makeHandoff(dir, "hotcache.md", empty);
      const st = makeStatus(dir, { last_run: "2026-10-27T00:00:00+00:00", ok: true, error: null });
      const res = runScan(hc, st);
      assert.equal(res.status, 1);
      assert.match(res.stdout, /TRIGGER constraints-absent-post-compaction:/);
      // The honest note that judgment stays model-side must ship with the trigger
      assert.match(res.stdout, /the model decides/);
    });
  });

  test("extractor failed last run -> extractor-failed-last-run TRIGGER", () => {
    withFixtures((dir) => {
      const hc = makeHandoff(dir, "hotcache.md", COMPLETE_HANDOFF);
      const st = makeStatus(dir, {
        last_run: "2026-10-27T01:02:03+00:00",
        ok: false,
        error: "bd remember exit 1: duplicate key",
      });
      const res = runScan(hc, st);
      assert.equal(res.status, 1);
      assert.match(res.stdout, /TRIGGER extractor-failed-last-run: bd_remember\.py last invocation failed at 2026-10-27T01:02:03\+00:00/);
    });
  });

  test("unparseable status file (cannot verify) -> TRIGGER, fail-closed direction", () => {
    withFixtures((dir) => {
      const hc = makeHandoff(dir, "hotcache.md", COMPLETE_HANDOFF);
      const st = join(dir, "extractor-status.json");
      writeFileSync(st, "{not json");
      const res = runScan(hc, st);
      assert.equal(res.status, 1);
      assert.match(res.stdout, /TRIGGER extractor-status-unreadable:/);
    });
  });

  test("absent status file -> NOTE only, never a trigger (instrument may be new)", () => {
    withFixtures((dir) => {
      const hc = makeHandoff(dir, "hotcache.md", COMPLETE_HANDOFF);
      const res = runScan(hc, join(dir, "never-written.json"));
      assert.equal(res.status, 0);
      assert.match(res.stdout, /NOTE extractor-status: no run recorded yet/);
      assert.doesNotMatch(res.stdout, /TRIGGER/);
    });
  });

  test("### template headers (SKILL.md schema form) validate as ## does", () => {
    withFixtures((dir) => {
      const templated = COMPLETE_HANDOFF.replace(/^## /gm, "### ").replace(
        "# Session Handoff",
        "### Session Handoff",
      );
      const hc = makeHandoff(dir, "hotcache.md", templated);
      const st = makeStatus(dir, { last_run: "2026-10-27T00:00:00+00:00", ok: true, error: null });
      const res = runScan(hc, st);
      assert.equal(res.status, 0, `stdout: ${res.stdout}`);
    });
  });
});

describe("Guard 2 signal source — bd_remember.py status recording", () => {
  function stubBd(dir, script) {
    const binDir = join(dir, "bin");
    mkdirSync(binDir, { recursive: true });
    const stub = join(binDir, "bd");
    writeFileSync(stub, script);
    chmodSync(stub, 0o755);
    return binDir;
  }

  function runBdRemember(dir, binDir, statusFile) {
    return spawnSync(
      "python3",
      [
        BD,
        "--scope", "global", "--turn", "1",
        "--category", "exact", "--key", "t", "--value", "v",
        "--status-file", statusFile,
      ],
      { encoding: "utf-8", timeout: 30000, env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, BEADS_DIR: join(dir, "beads") } },
    );
  }

  test("bd failure -> status records ok:false with the error", () => {
    withFixtures((dir) => {
      const binDir = stubBd(dir, "#!/bin/sh\necho 'boom: duplicate key' >&2\nexit 3\n");
      const st = join(dir, "extractor-status.json");
      const res = runBdRemember(dir, binDir, st);
      assert.equal(res.status, 3, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
      assert.ok(existsSync(st), "status file must exist after a real failed run");
      const status = JSON.parse(readFileSync(st, "utf-8"));
      assert.equal(status.ok, false);
      assert.match(status.error, /exit 3/);
      assert.match(status.error, /boom/);
      // and the scan picks it up
      const scan = runScan(makeHandoff(dir, "hotcache.md", COMPLETE_HANDOFF), st);
      assert.equal(scan.status, 1);
      assert.match(scan.stdout, /TRIGGER extractor-failed-last-run:/);
    });
  });

  test("bd success -> status records ok:true (scan stays CLEAN)", () => {
    withFixtures((dir) => {
      const binDir = stubBd(dir, "#!/bin/sh\necho stored\nexit 0\n");
      const st = join(dir, "extractor-status.json");
      const res = runBdRemember(dir, binDir, st);
      assert.equal(res.status, 0, `stderr: ${res.stderr}`);
      const status = JSON.parse(readFileSync(st, "utf-8"));
      assert.equal(status.ok, true);
      assert.equal(status.error, null);
      const scan = runScan(makeHandoff(dir, "hotcache.md", COMPLETE_HANDOFF), st);
      assert.equal(scan.status, 0);
    });
  });

  test("--dry-run records NOTHING (no bd call, no status sink write)", () => {
    withFixtures((dir) => {
      const st = join(dir, "extractor-status.json");
      const res = spawnSync(
        "python3",
        [BD, "--scope", "global", "--turn", "1", "--category", "exact", "--key", "t", "--value", "v", "--dry-run", "--status-file", st],
        { encoding: "utf-8", timeout: 30000 },
      );
      assert.equal(res.status, 0);
      assert.ok(!existsSync(st), "dry-run must not write extractor status");
    });
  });
});
