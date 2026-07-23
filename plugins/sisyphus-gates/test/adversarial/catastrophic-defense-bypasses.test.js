/**
 * test/adversarial/catastrophic-defense-bypasses.test.js — P0 spec-lock.
 *
 * Tracker: catastrophic-defense-bypasses — "Catastrophic-denylist blind to
 * command wrappers, structural forms, newline injection, env-prefix smuggling,
 * and PATH-qualified invocation." (F1–F6)
 *
 * Purpose: lock the spec for the phased deny-side fix BEFORE any src/ change.
 * Migrated out of brain-2q4-compound-readonly.test.js (the 12 failing
 * must-block bypasses + B-wrap-5 + R-6) and expanded to the full Oracle
 * corpus. All cases assert the BEHAVIOR THE FIX MUST PRODUCE; today's actual
 * behavior is encoded in the todo/active split (see "Marking" below).
 *
 * Root cause (F5): Layer 1 is command-name-based — it extracts the first
 * token after env-strip and checks THAT token against the catastrophic list.
 * Anything putting a benign token in front of `rm -rf /` (wrapper, structural
 * form, newline, env-prefix, PATH-qualifier) defeats it.
 *
 * Fix design (option b): command-name-based + segmentation + wrapper-recursion
 * + env-denylist + structural-rejection + basename-normalize + fail-closed.
 * Phased as P-A (wrapper-recursion), P-B (segmentation + structural), P-C
 * (env-denylist). This file is the spec-lock for all three.
 *
 * ─── Corpus groups (see ~/.sisyphus/evidence/catastrophic-defense-bypasses-issue.md) ───
 *
 *   GROUP A — MUST-BLOCK live bypasses  (TODO: gate ALLOWS today; activate when P-A/P-B/P-C land)
 *     F1 wrappers × rm -rf /, F1 wrapper-flag variants, F1 wrapper-of-wrapper,
 *     F2 bare structural ({}, ()), F3 newline/CR/CRLF injection,
 *     F4 Tier-1 env vars (the 11 the current matcher MISSES),
 *     F6 PATH-qualified (/bin/rm, /usr/bin/rm, /bin/dd, /sbin/mkfs),
 *     wrapper × alternate catastrophic payloads (dd, mkfs).
 *
 *   GROUP B — MUST-BLOCK already-defended  (ACTIVE: gate BLOCKS today via Layer 6 / sh -c / env-matcher)
 *     Regression guards: these bypasses are caught independently of Layer 1
 *     catastrophic-defense (by the shell-metachar defense, the bash -c/sh -c
 *     pattern, or the existing partial env-matcher). They MUST stay blocked
 *     under the fix — and critically MUST stay blocked even if brain-2q4 P2
 *     (Layer 4.5 compound-allow relaxation) ships, because Layer 1 will then
 *     catch them directly. Includes nesting depth 1–9 (sh -c matcher recurses).
 *
 *   GROUP C — MUST-ALLOW FP-guards  (ACTIVE: gate correctly ALLOWS today)
 *     Benign wrapper/env/structural uses the fix must NOT false-positive on.
 *
 *   GROUP D — MUST-ALLOW FP-over-blocks  (TODO: gate BLOCKS today; activate when P-B/P-C land)
 *     The env-prefix matcher catches GIT_PAGER/PAGER regardless of value, so
 *     benign `GIT_PAGER=cat`/`PAGER=cat` over-block today. Under the fix's
 *     value-discriminating env-denylist (P-C), these must be allowed. These
 *     are NOT live bypasses — they are the over-block side of the same fix.
 *
 *   GROUP E — REGRESSION + internal controls  (ACTIVE)
 *     Bare catastrophic payloads (rm -rf /, dd, mkfs, sudo, shutdown) + L0
 *     ordering + benign baselines (ls, git log). The internal-control pairs
 *     (e.g. `rm -rf /` blocks vs `env rm -rf /` must-block) follow the spec's
 *     "same state, same helper, same call" methodology.
 *
 * ─── Marking (critical for CI green) ───
 *
 *   The currently-FAILING tests (Group A live bypasses + Group D FP-over-blocks)
 *   → `test(name, { todo: true }, fn)`. node:test reports these as # todo,
 *   NOT as # fail, so the file commits green. The options object MUST be the
 *   2nd arg — the `(name, fn, options)` 3rd-arg form does NOT work in node:test
 *   (options is silently ignored; the test runs live and fails). Verified
 *   empirically 2026-07-23.
 *
 *   The currently-PASSING tests (Groups B, C, E) → active `test(name, fn)`.
 *
 *   todo tally: Group A (live bypasses) = 42; Group D (FP-over-blocks) = 2.
 *   Grand todo total = 44. Live-bypass count = 42 (Group A). The +2 delta is
 *   Group D FP-over-blocks, surfaced separately because the prompt listed them
 *   as FP-guards but they fail today.
 *
 * P0 SCOPE: this file touches TEST CODE ONLY. It does NOT modify any file
 * under src/. Gate logic stays byte-identical. Do NOT make the todo tests
 * pass — that is P-A/P-B/P-C, gated behind corpus + security re-audit.
 *
 * Test framework: node:test + node:assert/strict (matches g7-routing.test.js
 * and brain-2q4-compound-readonly.test.js).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { shouldBlockTool } from "../../src/gates.js";
import {
  loadWorkflowConfig,
  clearWorkflowCache,
} from "../../src/workflow-loader.js";

// ─── Workflow config loader (CI fallback) ───────────────────────────────────
// Same pattern as g7-routing.test.js / brain-2q4: if no workflow.yaml in HOME,
// create a temp one so the gate has a valid workflow to read (otherwise Layer 5
// fail-closed could mask the real layer under test).
const MINIMAL_WORKFLOW_YAML = `workflow:
  name: catastrophic-defense-test
  version: "1.0.0"
  description: "Minimal workflow for CI fallback"
  state_file: "~/.sisyphus/state.json"
  phases:
    - id: discovery
      description: "Explore"
      next_action: "advance"
    - id: plan-review
      description: "Review plan"
      next_action: "advance"
    - id: execution
      description: "Execute"
      next_action: "advance"
  auto_advance: []
  state:
    version: "3.0.0"
    persistent_fields: []
  blocking:
    global_rules: []
`;

clearWorkflowCache();
let _workflowCfg = null;
try {
  _workflowCfg = loadWorkflowConfig();
} catch {
  /* no yaml in this HOME */
}
if (!_workflowCfg) {
  const _ciHome = mkdtempSync(join(tmpdir(), "catastrophic-ci-"));
  mkdirSync(join(_ciHome, ".sisyphus"), { recursive: true });
  writeFileSync(
    join(_ciHome, ".sisyphus", "workflow.yaml"),
    MINIMAL_WORKFLOW_YAML,
  );
  process.env.HOME = _ciHome;
  clearWorkflowCache();
  loadWorkflowConfig();
  process.on("exit", () => {
    try {
      rmSync(_ciHome, { recursive: true, force: true });
    } catch {}
  });
}

// ─── Test helpers ───────────────────────────────────────────────────────────

function approvedExecutionState() {
  return {
    phase: "execution",
    prdApproved: true,
    planApproved: true,
    approvalStatus: "approved",
    prdGateStatus: "PASS",
    planGateStatus: "PASS",
    stateFileExists: true,
    evidenceLogged: true,
    lastCheckpoint: "plan-approved",
  };
}

// Run one bash command through the gate in an approved execution state.
function runGate(command) {
  return shouldBlockTool("bash", { command }, approvedExecutionState());
}

// Build a nested `sh -c "sh -c \"... rm -rf / ...\""` string to the given depth.
// Each level wraps in sh -c "..." and escapes inner backslashes then quotes.
function shNestedCatastrophic(depth) {
  let inner = "rm -rf /";
  for (let i = 0; i < depth; i++) {
    inner =
      'sh -c "' + inner.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return inner;
}

// ─── GROUP A: MUST-BLOCK live bypasses (TODO — gate ALLOWS today) ───────────
// Each asserts blocked === true. The gate ALLOWS these today (the bypass is
// live). Marked todo so the file commits green; activate when P-A/P-B/P-C
// land. This is the live-bypass set — todo count here == 42 == live bypasses.

// F1 — command-running wrappers precede rm -rf /; matcher extracts the wrapper
// as the command name and allows the lot. (B-wrap-1..6 migrated from
// brain-2q4; B-wrap-5 `nohup rm -rf / &` is in Group B — it blocks via `&`.)
const LIVE_F1_WRAPPERS = [
  ["cat-wrap-time", "time rm -rf /"], // B-wrap-1
  ["cat-wrap-command", "command rm -rf /"], // B-wrap-2
  ["cat-wrap-env", "env rm -rf /"], // B-wrap-3
  ["cat-wrap-nice", "nice rm -rf /"], // B-wrap-4
  ["cat-wrap-nohup-no-bg", "nohup rm -rf /"], // B-wrap-5 minus trailing &
  ["cat-wrap-timeout", "timeout 5 rm -rf /"], // B-wrap-6
  // Extended wrapper set (spec fix-direction #1 + corpus seed):
  ["cat-wrap-strace", "strace rm -rf /"],
  ["cat-wrap-ltrace", "ltrace rm -rf /"],
  ["cat-wrap-gdb", "gdb -batch -ex run --args rm -rf /"],
  ["cat-wrap-busybox", "busybox rm -rf /"],
  ["cat-wrap-cpulimit", "cpulimit -l 50 rm -rf /"],
  ["cat-wrap-stdbuf", "stdbuf -oL rm -rf /"],
  ["cat-wrap-ionice", "ionice -c 3 rm -rf /"],
  ["cat-wrap-chrt", "chrt -o 0 rm -rf /"],
  ["cat-wrap-taskset", "taskset 1 rm -rf /"],
  // Wrapper-of-wrapper — tests that wrapper-recursion is transitive:
  ["cat-wrap-nohup-stdbuf", "nohup stdbuf rm -rf /"],
];

// F1 — wrappers with leading flags. Wrapper-recursion must strip the wrapper
// AND its flags (e.g. `timeout 30 npm test` → strip → `npm test` → allow).
// These flag-bearing variants must still reach the catastrophic payload.
const LIVE_F1_WRAPPER_FLAGS = [
  ["cat-wrapflag-env-i", "env -i rm -rf /"],
  ["cat-wrapflag-timeout-signal", "timeout --signal=KILL 5 rm -rf /"],
];

// F2 — bare structural forms (the matcher sees the structural token as the
// command name). The backtick / $() / <(...) forms are in Group B — they
// block today via the Layer 6 metachar defense.
const LIVE_F2_STRUCTURAL = [
  ["cat-struct-brace", "{rm,ls} -rf /"], // B-struct-3 — brace expansion runs `rm ls -rf /`
  ["cat-struct-subshell", "(rm -rf /)"], // B-struct-4 — subshell
];

// F3 — newline-family injection. A real newline/CR in the tool string runs as
// two commands; the gate evaluates only the first line. CRLF combines both.
const LIVE_F3_NEWLINE = [
  ["cat-inj-newline", "git status\nrm -rf /"], // B-inj-1
  ["cat-inj-cr", "git status\rrm -rf /"],
  ["cat-inj-crlf", "git status\r\nrm -rf /"],
];

// F4 — Tier-1 env-prefix smuggling: the code-exec env vars the CURRENT
// matcher misses (probed: all return blocked=false today). The 5 it DOES
// catch (PATH, PAGER, GIT_EXTERNAL_DIFF, PERL5LIB, RUBYOPT) are in Group B.
// Each payload is code-exec-shaped. See file-level report for payload-realism
// caveats on PERL5OPT (payload-dependent), PYTHONSTARTUP, PYTHONINSPECT, DYLD_*.
//
// PERL5OPT note: the matcher is value-content-sensitive here — `-M`, `-I`,
// `-m`, `-d` values all block today, but `-e` slips through. We use the `-e`
// form (a genuine live bypass) to spec-lock the gap; P-C's denylist must key
// on VAR presence, not value content, to close this inconsistency.
const LIVE_F4_ENV_TIER1 = [
  ["cat-env-LD_PRELOAD", "LD_PRELOAD=/tmp/x.so ls"], // B-env-2
  ["cat-env-GIT_PAGER-exec", "GIT_PAGER='sh -c \"id>/tmp/p\"' git log"], // B-env-3
  ["cat-env-BASH_ENV", "BASH_ENV=/tmp/e ls"], // B-env-5
  ["cat-env-LD_LIBRARY_PATH", "LD_LIBRARY_PATH=/tmp/x ls"],
  ["cat-env-ENV", "ENV=/tmp/e ls"],
  ["cat-env-PERL5OPT", "PERL5OPT='-e system(\"rm\")' perl -e 0"],
  ["cat-env-PYTHONSTARTUP", "PYTHONSTARTUP=/tmp/e python"],
  ["cat-env-NODE_OPTIONS", "NODE_OPTIONS='--require /tmp/e' node app.js"],
  ["cat-env-PYTHONPATH", "PYTHONPATH=/tmp/x python"],
  ["cat-env-PYTHONINSPECT", "PYTHONINSPECT=1 python"],
  ["cat-env-DYLD_LIBRARY_PATH", "DYLD_LIBRARY_PATH=/tmp/x ls"],
];

// F6 — PATH-qualified catastrophic commands. The denylist matches on command
// NAME (`rm`), so `/bin/rm` and `/usr/bin/rm` evade it. Fix needs basename
// normalization (resolve the leading path component before name-match).
const LIVE_F6_PATH_QUALIFIED = [
  ["cat-f6-bin-rm", "/bin/rm -rf /"],
  ["cat-f6-usr-bin-rm", "/usr/bin/rm -rf /"],
  ["cat-f6-bin-dd", "/bin/dd if=/dev/zero of=/dev/sda"],
  ["cat-f6-sbin-mkfs", "/sbin/mkfs.ext4 /dev/sda"],
];

// F1 — wrappers × alternate catastrophic payloads. Proves the bypass generalizes
// beyond `rm -rf /` to every catastrophic entry (dd, mkfs). Paired with the
// bare-payload controls in Group E (dd/mkfs bare → blocked today).
const LIVE_WRAPPER_ALT_PAYLOAD = [
  ["cat-env-dd", "env dd if=/dev/zero of=/dev/sda"],
  ["cat-env-mkfs", "env mkfs.ext4 /dev/sda"],
  ["cat-time-dd", "time dd if=/dev/zero of=/dev/sda"],
  ["cat-timeout-mkfs", "timeout 5 mkfs.ext4 /dev/sda"],
];

const LIVE_BYPASS_GROUPS = [
  ["F1 wrappers", LIVE_F1_WRAPPERS],
  ["F1 wrapper flags", LIVE_F1_WRAPPER_FLAGS],
  ["F4 env-prefix Tier-1", LIVE_F4_ENV_TIER1],
  ["wrapper × alt payload", LIVE_WRAPPER_ALT_PAYLOAD],
];

describe("catastrophic-defense — GROUP A: live bypasses (TODO; gate allows today)", () => {
  for (const [category, cases] of LIVE_BYPASS_GROUPS) {
    describe(`category: ${category}`, () => {
      for (const [id, command] of cases) {
        // todo: catastrophic-defense bypass — activate when P-A/P-B/P-C land.
        test(
          `${id}: ${JSON.stringify(command)} -> blocked`,
          { todo: true },
          () => {
            const d = runGate(command);
            assert.equal(
              d.blocked,
              true,
              `EXPECTED BLOCK but gate ALLOWED (live bypass).\n` +
                `  case: ${id}\n  command: ${JSON.stringify(command)}\n` +
                `  decision: ${JSON.stringify(d)}`,
            );
          },
        );
      }
    });
  }
});

// ─── GROUP B: MUST-BLOCK already-defended (ACTIVE — gate blocks today) ──────
// These bypass-shaped commands ALREADY block today — via the Layer 6 shell-
// metachar defense (backtick, $(), <(...), &, \, NUL), the sh -c / bash -c
// pattern, or the existing partial env-matcher. They are ACTIVE regression
// guards: under the fix, Layer 1 catastrophic-defense must catch them
// directly so they stay blocked EVEN IF brain-2q4 P2 (Layer 4.5 compound-
// allow relaxation) ships and weakens the Layer 6 backstop.

// B-wrap-5 — nohup with trailing `&`. Blocks via `&` today, not via the
// wrapper. (Without the `&` it's a live bypass — see cat-wrap-nohup-no-bg.)
const DEFENDED_WRAP_BG = [["cat-bg-nohup", "nohup rm -rf / &"]];

// Structural forms the Layer 6 metachar defense already catches.
const DEFENDED_STRUCTURAL_METACHAR = [
  ["cat-def-backtick-cmd", "`rm -rf /`"],
  ["cat-def-dollar-paren-cmd", "$(rm -rf /)"],
  ["cat-def-procsub", "cat <(rm -rf /)"],
  ["cat-def-brace-via-bash-c", "bash -c '{rm,ls} -rf /'"],
];

// Injection forms already caught (NUL byte; backslash-newline line-cont).
// Note: the backslash-newline form isn't a clean two-command injection in
// bash (it joins lines), but the gate blocks it regardless — regression guard.
const DEFENDED_INJECTION = [
  ["cat-def-nul", "git status\x00rm -rf /"],
  ["cat-def-line-cont", "git status\\\nrm -rf /"],
];

// sh -c / bash -c nesting depth 1, 2, 3, 5, 9. The sh -c matcher recurses, so
// nesting does not evade it. (Sampled across the 1–9 range the spec named;
// depth 2 already proves recursion; 5 and 9 confirm it holds deep.)
const DEFENDED_NESTING = [
  ["cat-nest-1-sh-c", shNestedCatastrophic(1)],
  ["cat-nest-2-sh-c", shNestedCatastrophic(2)],
  ["cat-nest-3-sh-c", shNestedCatastrophic(3)],
  ["cat-nest-5-sh-c", shNestedCatastrophic(5)],
  ["cat-nest-9-sh-c", shNestedCatastrophic(9)],
  ["cat-nest-1-bash-c", 'bash -c "rm -rf /"'],
];

// Tier-1 env vars the CURRENT partial env-matcher already catches. Must keep
// blocking under the fix's complete denylist.
const DEFENDED_ENV_TIER1 = [
  ["cat-env-PATH", "PATH=/tmp/evil git status"],
  ["cat-env-PAGER-evil", "PAGER=evil git log"],
  ["cat-env-GIT_EXTERNAL_DIFF", "GIT_EXTERNAL_DIFF=evil git diff --ext-diff"],
  ["cat-env-PERL5LIB", "PERL5LIB=/tmp/x perl -e 0"],
  ["cat-env-RUBYOPT", 'RUBYOPT=\'-eexec("rm")\' ruby -e 0'],
];

const DEFENDED_GROUPS = [
  ["wrapper + bg (blocks via &)", DEFENDED_WRAP_BG],
  ["structural via Layer 6 metachar", DEFENDED_STRUCTURAL_METACHAR],
  ["injection (NUL / line-cont)", DEFENDED_INJECTION],
  ["sh -c / bash -c nesting 1..9", DEFENDED_NESTING],
  ["env-prefix Tier-1 (already caught)", DEFENDED_ENV_TIER1],
  ["F3 newline injection (P-A fixed)", LIVE_F3_NEWLINE],
  ["F6 PATH-qualified (basename-normalized)", LIVE_F6_PATH_QUALIFIED],
  ["F2 structural (first-token strictness)", LIVE_F2_STRUCTURAL],
];

describe("catastrophic-defense — GROUP B: already-defended (ACTIVE; must stay blocked under fix)", () => {
  for (const [category, cases] of DEFENDED_GROUPS) {
    describe(`category: ${category}`, () => {
      for (const [id, command] of cases) {
        test(`${id}: ${JSON.stringify(command)} -> blocked`, () => {
          const d = runGate(command);
          assert.equal(
            d.blocked,
            true,
            `REGRESSION: bypass-shape that blocks today was ALLOWED.\n` +
              `  case: ${id}\n  command: ${JSON.stringify(command)}\n` +
              `  decision: ${JSON.stringify(d)}\n` +
              `  (Layer 1 must catch this directly under the fix so it stays` +
              ` blocked if Layer 6 relaxes.)`,
          );
        });
      }
    });
  }
});

// ─── GROUP C: MUST-ALLOW FP-guards (ACTIVE — gate correctly allows today) ───
// Benign wrapper / env / structural uses the fix must NOT false-positive on.
// All currently PASS (gate allows). Active.

const FP_GUARDS = [
  ["fp-timeout-npm", "timeout 30 npm test"],
  ["fp-nice-make", "nice -n 10 make"],
  ["fp-time-make", "time make test"],
  ["fp-command-v", "command -v node"],
  ["fp-env-NODE_ENV", "env NODE_ENV=test node app.js"],
  ["fp-env-FOO", "env FOO=bar npm test"],
  ["fp-LESS-man", "LESS=R man ls"],
  // Brace / escaped-paren in ARGUMENT (not command) position — structural
  // rejection must only fire on command-position tokens:
  ["fp-mkdir-brace-arg", "mkdir -p {a,b}"],
  ["fp-find-escaped-paren-arg", "find . \\( -name x \\)"],
  // R-6 (migrated from brain-2q4): echo with rm as DATA. Per Oracle the fix
  // design ALLOWS this — Layer 1 is command-name-based; `echo` is benign and
  // the rm string is data, not a command. This is the F5 architectural
  // confirmation (flipped from brain-2q4's old `blocked === true` assertion).
  ["fp-echo-rm-data-dq", "echo \"rm -rf /\""],
  ["fp-echo-rm-data-sq", "echo 'rm -rf /'"],
];

describe("catastrophic-defense — GROUP C: FP-guards (ACTIVE; gate correctly allows)", () => {
  for (const [id, command] of FP_GUARDS) {
    test(`${id}: ${JSON.stringify(command)} -> allowed`, () => {
      const d = runGate(command);
      assert.equal(
        d.blocked,
        false,
        `FALSE POSITIVE: benign command was BLOCKED.\n` +
          `  case: ${id}\n  command: ${JSON.stringify(command)}\n` +
          `  decision: ${JSON.stringify(d)}`,
      );
    });
  }
});

// ─── GROUP D: MUST-ALLOW FP-over-blocks (TODO — gate BLOCKS today) ──────────
// The current env-prefix matcher catches GIT_PAGER / PAGER regardless of
// value, so benign `GIT_PAGER=cat` / `PAGER=cat` over-block today. Under the
// fix's value-discriminating Tier-1 denylist (P-C), only dangerous values
// (e.g. `sh -c ...`) block; benign values (`cat`) allow. These FAIL today
// (gate blocks) → todo. NOT live bypasses — the over-block side of the fix.

const FP_OVERBLOCKS = [
  ["fp-todo-GIT_PAGER-cat", "GIT_PAGER=cat git log"],
  ["fp-todo-PAGER-cat", "PAGER=cat git log"],
];

describe("catastrophic-defense — GROUP D: FP-over-blocks (TODO; gate blocks today)", () => {
  for (const [id, command] of FP_OVERBLOCKS) {
    // todo: catastrophic-defense FP-over-block — env matcher is value-blind
    // today; activate when P-C value-discriminating denylist lands.
    test(
      `${id}: ${JSON.stringify(command)} -> allowed`,
      { todo: true },
      () => {
        const d = runGate(command);
        assert.equal(
          d.blocked,
          false,
          `FALSE POSITIVE: benign pager value was BLOCKED.\n` +
            `  case: ${id}\n  command: ${JSON.stringify(command)}\n` +
            `  decision: ${JSON.stringify(d)}`,
        );
      },
    );
  }
});

// ─── GROUP E: REGRESSION + internal controls (ACTIVE) ───────────────────────
// Self-contained internal-control pairs (spec methodology: same state, same
// helper, same call). Bare catastrophic payloads block; benign baselines
// allow; L0/Tier-2 raw-string ordering holds. Migrated R-2/R-3/R-5-equivalent
// + R-6 (now flipped to FP-guard in Group C) from brain-2q4.

const REGRESSION_INTERNAL_CONTROLS = [
  // [id, command, expectedBlocked]
  // Internal controls — bare catastrophic (must block). These pair with the
  // Group A wrapper/PATH-qualified bypasses: same payload, no evasion prefix.
  ["ctrl-rm-rf", "rm -rf /", true],
  ["ctrl-dd", "dd if=/dev/zero of=/dev/sda", true],
  ["ctrl-mkfs", "mkfs.ext4 /dev/sda", true],
  ["ctrl-sudo", "sudo apt update", true],
  ["ctrl-shutdown", "shutdown -h now", true],
  // L0/Tier-2 ordering: raw-string trust-root path-reference fires on the
  // RAW string BEFORE any future Layer 4.5 allow path. Must stay blocked.
  ["ctrl-git-show-L0", "git show HEAD:opencode.json && git log", true],
  // Benign baselines (must allow).
  ["ctrl-ls", "ls -la", false],
  ["ctrl-git-log", "git log", false],
];

describe("catastrophic-defense — GROUP E: regression + internal controls (ACTIVE)", () => {
  for (const [id, command, expectedBlocked] of REGRESSION_INTERNAL_CONTROLS) {
    test(
      `${id}: ${JSON.stringify(command)} -> blocked=${expectedBlocked}`,
      () => {
        const d = runGate(command);
        assert.equal(
          d.blocked,
          expectedBlocked,
          `REGRESSION/CONTROL FAILURE.\n` +
            `  case: ${id}\n  command: ${JSON.stringify(command)}\n` +
            `  expected blocked: ${expectedBlocked}\n` +
            `  decision: ${JSON.stringify(d)}`,
        );
      },
    );
  }
});
