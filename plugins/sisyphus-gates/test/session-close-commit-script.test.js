/**
 * test/session-close-commit-script.test.js — guard tests for
 * scripts/session-close-commit.sh (the close-commit ship).
 *
 * Runs the REAL script against throwaway fixture worktrees:
 *   - a bare "origin" whose path contains TVATDCI/oc-sisyphus (passes the
 *     script's sanctioned-repo guard without touching the real remote);
 *   - a work clone on branch main seeded with the two sanctioned close docs;
 *   - a fixture $HOME carrying a controllable .sisyphus/state.json (the
 *     script reads $HOME at runtime — the test never touches the real
 *     trust root).
 *
 * Guard contract (fail-closed): extra/untracked file → refuse with the
 * offending path; wrong branch → refuse; protocol open → refuse; nothing
 * to land → refuse; non-sanctioned repo → refuse; clean path → receipt and
 * the close commit is on origin.
 *
 * Run: node --test test/session-close-commit-script.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_ROOT = path.resolve(HERE, "..", "..", "..");
const SCRIPT_SRC = path.join(CONFIG_ROOT, "scripts", "session-close-commit.sh");

function git(file, args) {
  return execFileSync("git", ["-C", file, ...args], { encoding: "utf8" });
}

function makeFixture(t, { stateStatus = "complete", originName = "TVATDCI/oc-sisyphus.git", withState = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scc-test-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));

  const origin = path.join(base, originName);
  fs.mkdirSync(path.dirname(origin), { recursive: true });
  execFileSync("git", ["init", "--bare", "--initial-branch=main", origin]);

  const work = path.join(base, "work");
  execFileSync("git", ["init", "--initial-branch=main", work]);
  git(work, ["config", "user.email", "scc-test@example.invalid"]);
  git(work, ["config", "user.name", "scc-test"]);
  git(work, ["remote", "add", "origin", origin]);
  fs.writeFileSync(path.join(work, "README.md"), "seed\n");
  fs.writeFileSync(path.join(work, "COMPLETE-CODEBASE.md"), "# COMPLETE-CODEBASE base\n");
  fs.writeFileSync(path.join(work, "SYSTEM-NARRATIVE.md"), "# SYSTEM-NARRATIVE base\n");
  // the script, copied into the fixture's scripts/ and TRACKED by the seed
  // commit — otherwise the script's own untracked-path guard would refuse
  const scriptsDir = path.join(work, "scripts");
  fs.mkdirSync(scriptsDir);
  const script = path.join(scriptsDir, "session-close-commit.sh");
  fs.copyFileSync(SCRIPT_SRC, script);
  fs.chmodSync(script, 0o755);
  git(work, ["add", "."]);
  git(work, ["commit", "-m", "seed"]);
  git(work, ["push", "-u", "origin", "main"]);
  execFileSync("git", ["-C", origin, "symbolic-ref", "HEAD", "refs/heads/main"]);

  // fixture $HOME with a controllable trust-root state
  const home = path.join(base, "home");
  fs.mkdirSync(path.join(home, ".sisyphus"), { recursive: true });
  if (withState) {
    fs.writeFileSync(
      path.join(home, ".sisyphus", "state.json"),
      JSON.stringify({ session_close: { status: stateStatus } })
    );
  }

  const seedHead = git(work, ["rev-parse", "HEAD"]).trim();
  return { base, work, origin, home, script, seedHead };
}

function runClose(fx, summary) {
  const args = summary === undefined ? [] : [summary];
  return execFileSync("bash", [fx.script, ...args], {
    cwd: fx.work,
    env: { ...process.env, HOME: fx.home },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runCloseExpectRefusal(fx, summary) {
  try {
    runClose(fx, summary);
  } catch (err) {
    assert.ok(err.status !== 0, "expected non-zero exit");
    return err;
  }
  assert.fail("expected the script to refuse, but it exited 0");
}

// ─── clean path: receipt + landed on origin ─────────────────────────────────

describe("clean path", () => {
  test("both docs dirty → receipt, correct message, pushed, tree clean", (t) => {
    const fx = makeFixture(t);
    fs.appendFileSync(path.join(fx.work, "COMPLETE-CODEBASE.md"), "drift fix line\n");
    fs.appendFileSync(path.join(fx.work, "SYSTEM-NARRATIVE.md"), "timeline entry line\n");

    const out = runClose(fx, "sync close docs for round X");

    assert.match(out, /CLOSE-COMMIT RECEIPT/);
    assert.match(out, /docs\(close\): \d{4}-\d{2}-\d{2} sync close docs for round X/);
    assert.match(out, /COMPLETE-CODEBASE\.md/);
    assert.match(out, /SYSTEM-NARRATIVE\.md/);

    const head = git(fx.work, ["rev-parse", "HEAD"]).trim();
    const originHead = git(fx.origin, ["rev-parse", "main"]).trim();
    assert.equal(head, originHead, "close commit must be pushed to origin");

    const files = git(fx.work, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"])
      .trim()
      .split("\n")
      .sort();
    assert.deepEqual(files, ["COMPLETE-CODEBASE.md", "SYSTEM-NARRATIVE.md"]);
    assert.equal(git(fx.work, ["status", "--porcelain"]).trim(), "", "tree must be clean after landing");
  });

  test("only one sanctioned doc dirty → still lands (limit, not both-required)", (t) => {
    const fx = makeFixture(t);
    fs.appendFileSync(path.join(fx.work, "SYSTEM-NARRATIVE.md"), "only narrative moved\n");

    const out = runClose(fx, "narrative-only close");

    assert.match(out, /CLOSE-COMMIT RECEIPT/);
    const files = git(fx.work, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]).trim();
    assert.equal(files, "SYSTEM-NARRATIVE.md");
    assert.equal(git(fx.work, ["status", "--porcelain"]).trim(), "");
  });
});

// ─── guard: foreign working-tree paths refuse ───────────────────────────────

describe("guard: foreign paths", () => {
  test("extra untracked file → refuse, path printed, nothing committed", (t) => {
    const fx = makeFixture(t);
    fs.appendFileSync(path.join(fx.work, "SYSTEM-NARRATIVE.md"), "timeline entry line\n");
    fs.writeFileSync(path.join(fx.work, "stray.txt"), "not sanctioned\n");

    const err = runCloseExpectRefusal(fx, "should refuse");
    const errText = `${err.stdout}${err.stderr}`;
    assert.match(errText, /stray\.txt/);
    assert.equal(git(fx.work, ["rev-parse", "HEAD"]).trim(), fx.seedHead, "no commit may land");
    assert.equal(git(fx.origin, ["rev-parse", "main"]).trim(), fx.seedHead, "origin must be untouched");
  });

  test("extra modified file alongside both docs → refuse, path printed", (t) => {
    const fx = makeFixture(t);
    fs.appendFileSync(path.join(fx.work, "COMPLETE-CODEBASE.md"), "drift fix line\n");
    fs.appendFileSync(path.join(fx.work, "SYSTEM-NARRATIVE.md"), "timeline entry line\n");
    fs.appendFileSync(path.join(fx.work, "README.md"), "sneaky edit\n");

    const err = runCloseExpectRefusal(fx, "should refuse");
    assert.match(`${err.stdout}${err.stderr}`, /README\.md/);
    assert.equal(git(fx.work, ["rev-parse", "HEAD"]).trim(), fx.seedHead);
  });
});

// ─── guard: branch / repo / protocol state ──────────────────────────────────

describe("guard: branch, repo, protocol", () => {
  test("wrong branch → refuse", (t) => {
    const fx = makeFixture(t);
    git(fx.work, ["checkout", "-b", "feature"]);
    fs.appendFileSync(path.join(fx.work, "SYSTEM-NARRATIVE.md"), "timeline entry line\n");

    const err = runCloseExpectRefusal(fx, "should refuse");
    assert.match(`${err.stdout}${err.stderr}`, /main only/);
    assert.equal(git(fx.work, ["rev-parse", "HEAD"]).trim(), fx.seedHead);
  });

  test("non-sanctioned origin → refuse", (t) => {
    const fx = makeFixture(t, { originName: "somebody-else/other-repo.git" });
    fs.appendFileSync(path.join(fx.work, "SYSTEM-NARRATIVE.md"), "timeline entry line\n");

    const err = runCloseExpectRefusal(fx, "should refuse");
    assert.match(`${err.stdout}${err.stderr}`, /non-sanctioned repo/);
  });

  test("protocol status open → refuse (Layer 6.5 parity)", (t) => {
    const fx = makeFixture(t, { stateStatus: "open" });
    fs.appendFileSync(path.join(fx.work, "SYSTEM-NARRATIVE.md"), "timeline entry line\n");

    const err = runCloseExpectRefusal(fx, "should refuse");
    assert.match(`${err.stdout}${err.stderr}`, /protocol complete\/overridden/);
    assert.equal(git(fx.work, ["rev-parse", "HEAD"]).trim(), fx.seedHead);
  });

  test("missing trust-root state → refuse (fail-closed)", (t) => {
    const fx = makeFixture(t, { withState: false });
    fs.appendFileSync(path.join(fx.work, "SYSTEM-NARRATIVE.md"), "timeline entry line\n");

    const err = runCloseExpectRefusal(fx, "should refuse");
    assert.match(`${err.stdout}${err.stderr}`, /fail-closed/);
  });
});

// ─── guard: usage / empty round ─────────────────────────────────────────────

describe("guard: usage and empty round", () => {
  test("no argument → usage refusal", (t) => {
    const fx = makeFixture(t);
    const err = runCloseExpectRefusal(fx, undefined);
    assert.match(`${err.stdout}${err.stderr}`, /usage/);
  });

  test("two arguments → usage refusal", (t) => {
    const fx = makeFixture(t);
    try {
      execFileSync("bash", [fx.script, "one", "two"], {
        cwd: fx.work,
        env: { ...process.env, HOME: fx.home },
        encoding: "utf8",
      });
    } catch (err) {
      assert.match(`${err.stdout}${err.stderr}`, /usage/);
      return;
    }
    assert.fail("expected refusal");
  });

  test("clean tree (nothing to land) → refuse", (t) => {
    const fx = makeFixture(t);
    const err = runCloseExpectRefusal(fx, "nothing changed");
    assert.match(`${err.stdout}${err.stderr}`, /nothing to land/);
  });

  test("multi-line summary → refuse (control characters)", (t) => {
    const fx = makeFixture(t);
    fs.appendFileSync(path.join(fx.work, "SYSTEM-NARRATIVE.md"), "timeline entry line\n");
    const err = runCloseExpectRefusal(fx, "line one\nline two");
    assert.match(`${err.stdout}${err.stderr}`, /control characters/);
  });
});

// ─── guard: rebase conflict aborts and refuses ──────────────────────────────

describe("guard: upstream conflict", () => {
  test("diverged origin → refuse, rebase aborted, close commit local unpushed", (t) => {
    const fx = makeFixture(t);

    // rival writer diverges origin/main by rewriting the same line
    const rival = path.join(fx.base, "rival");
    execFileSync("git", ["clone", fx.origin, rival]);
    git(rival, ["config", "user.email", "rival@example.invalid"]);
    git(rival, ["config", "user.name", "rival"]);
    fs.writeFileSync(path.join(rival, "SYSTEM-NARRATIVE.md"), "# SN rival rewrote line one\n");
    git(rival, ["add", "."]);
    git(rival, ["commit", "-m", "rival rewrite"]);
    git(rival, ["push", "origin", "main"]);

    // local close edits the same line → pull --rebase conflict
    fs.writeFileSync(path.join(fx.work, "SYSTEM-NARRATIVE.md"), "# SN local close line one\n");

    const err = runCloseExpectRefusal(fx, "conflicting close");
    assert.match(`${err.stdout}${err.stderr}`, /pull --rebase not clean/);

    // no scripted conflict resolution: rebase aborted, close commit intact but unpushed
    const gdir = git(fx.work, ["rev-parse", "--git-dir"]).trim();
    assert.ok(!fs.existsSync(path.join(gdir, "rebase-merge")), "no rebase may be left in progress");
    const subject = git(fx.work, ["log", "-1", "--format=%s"]).trim();
    assert.match(subject, /docs\(close\): \d{4}-\d{2}-\d{2} conflicting close/);
    assert.notEqual(git(fx.work, ["rev-parse", "HEAD"]).trim(), git(fx.origin, ["rev-parse", "main"]).trim());
  });
});
