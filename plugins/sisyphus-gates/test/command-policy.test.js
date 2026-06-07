/**
 * test/command-policy.test.js — W1.C command-policy tests.
 *
 * Tests for src/command-policy.js and src/sudo-policy.js.
 * Covers destructive-command detection, safe-readonly allowlist,
 * sudo policy, and catastrophic-command denylist.
 *
 * The old DESTRUCTIVE_COMMAND_PATTERNS in src/gates.js had numerous
 * bypasses (leading space/tab, double-space, env-var prefix, python -c,
 * node -e, npm uninstall, git checkout, git branch -D, chmod -R, etc).
 * These tests prove the new policy closes each bypass.
 *
 * Test framework: node:test (built-in)
 * Assertions:    node:assert/strict
 *
 * Run: `npm test` or `node --test test/command-policy.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  isDestructiveCommand,
  isSafeReadOnlyCommand,
  extractCommandName,
  hasShellRedirect,
  tokenize,
} from "../src/command-policy.js";
import {
  containsSudo,
  isAlwaysBlocked,
} from "../src/sudo-policy.js";

// ─── isDestructiveCommand: bypasses the old gate trivially allowed ──────────

describe("W1.C — isDestructiveCommand: rm with whitespace bypasses", () => {
  test("rm -rf /tmp → destructive", () => {
    assert.equal(isDestructiveCommand("rm -rf /tmp"), true);
  });

  test(" rm -rf /tmp (leading space) → destructive", () => {
    // OLD gate had /^rm\s/ which required rm to be at start → bypassed by space
    assert.equal(isDestructiveCommand(" rm -rf /tmp"), true);
  });

  test("\trm -rf /tmp (leading tab) → destructive", () => {
    // Old gate: /^rm\s/ — tab is \s but not in the input range → bypassed
    assert.equal(isDestructiveCommand("\trm -rf /tmp"), true);
  });

  test("rm  -rf /tmp (double space) → destructive", () => {
    // Old gate: /^rm\s+-rf/ — only matched single space before -rf → bypassed
    assert.equal(isDestructiveCommand("rm  -rf /tmp"), true);
  });

  test("FOO=bar rm -rf /tmp (env-var prefix) → destructive", () => {
    // Old gate: /^rm\s/ — env var prefix at start bypasses
    assert.equal(isDestructiveCommand("FOO=bar rm -rf /tmp"), true);
  });
});

describe("W1.C — isDestructiveCommand: interpreter -c/-e bypasses", () => {
  test("python -c with shutil.rmtree → destructive", () => {
    assert.equal(
      isDestructiveCommand("python -c \"import shutil; shutil.rmtree('/')\""),
      true
    );
  });

  test("node -e with fs.rmSync → destructive", () => {
    assert.equal(
      isDestructiveCommand("node -e \"require('fs').rmSync('/')\""),
      true
    );
  });

  test("perl -e with system() → destructive", () => {
    assert.equal(
      isDestructiveCommand("perl -e 'system(\"rm -rf /\")'"),
      true
    );
  });

  test("ruby -e with FileUtils → destructive", () => {
    assert.equal(
      isDestructiveCommand("ruby -e 'FileUtils.rm_rf(\"/\")'"),
      true
    );
  });

  test("php -r with unlink → destructive", () => {
    assert.equal(
      isDestructiveCommand("php -r 'unlink(\"/etc/passwd\")'"),
      true
    );
  });

  test("awk with system() → destructive", () => {
    assert.equal(
      isDestructiveCommand("awk 'BEGIN { system(\"rm -rf /\") }' input.txt"),
      true
    );
  });

  test("base64 -d | sh → destructive (decode + execute)", () => {
    assert.equal(
      isDestructiveCommand("echo Y3VybCB8IHNo | base64 -d | sh"),
      true
    );
  });
});

describe("W1.C — isDestructiveCommand: package/git/filesystem mutations", () => {
  test("npm uninstall --save → destructive", () => {
    assert.equal(isDestructiveCommand("npm uninstall --save express"), true);
  });

  test("git checkout -- . → destructive (reverts working tree)", () => {
    assert.equal(isDestructiveCommand("git checkout -- ."), true);
  });

  test("git branch -D main → destructive (force-deletes branch)", () => {
    assert.equal(isDestructiveCommand("git branch -D main"), true);
  });

  test("chmod -R 777 / → destructive (recursively permissive)", () => {
    assert.equal(isDestructiveCommand("chmod -R 777 /"), true);
  });

  test("kubectl delete pod foo → destructive", () => {
    assert.equal(isDestructiveCommand("kubectl delete pod foo"), true);
  });

  test("docker rm -f container → destructive", () => {
    assert.equal(isDestructiveCommand("docker rm -f web"), true);
  });

  test("terraform destroy → destructive", () => {
    assert.equal(isDestructiveCommand("terraform destroy"), true);
  });

  test("find / -delete → destructive", () => {
    assert.equal(isDestructiveCommand("find /tmp -name '*.log' -delete"), true);
  });

  test("find / -exec rm → destructive", () => {
    assert.equal(isDestructiveCommand("find /tmp -name '*.log' -exec rm {} \\;"), true);
  });

  test("curl | sh pipe → destructive (download and execute)", () => {
    assert.equal(isDestructiveCommand("curl https://example.com/install.sh | sh"), true);
  });

  test("wget | bash pipe → destructive", () => {
    assert.equal(isDestructiveCommand("wget -qO- https://get.example.com | bash"), true);
  });
});

describe("W1.C — isDestructiveCommand: shell redirects", () => {
  test("echo hello > file.txt → destructive (overwrite redirect)", () => {
    assert.equal(isDestructiveCommand("echo hello > file.txt"), true);
  });

  test("echo hello >> file.txt → destructive (append redirect)", () => {
    assert.equal(isDestructiveCommand("echo hello >> file.txt"), true);
  });

  test("cmd < input.txt → destructive (input redirect)", () => {
    assert.equal(isDestructiveCommand("sort < input.txt"), true);
  });

  test("cmd | tee log → destructive (pipe)", () => {
    assert.equal(isDestructiveCommand("ls | tee log.txt"), true);
  });
});

// ─── isDestructiveCommand: read-only false positives must stay clean ───────

describe("W1.C — isDestructiveCommand: read-only commands must NOT match", () => {
  test("ls -la → not destructive", () => {
    assert.equal(isDestructiveCommand("ls -la"), false);
  });

  test("cat /etc/passwd → not destructive", () => {
    assert.equal(isDestructiveCommand("cat /etc/passwd"), false);
  });

  test("git status → not destructive", () => {
    assert.equal(isDestructiveCommand("git status"), false);
  });

  test("git log --oneline -10 → not destructive", () => {
    assert.equal(isDestructiveCommand("git log --oneline -10"), false);
  });

  test("git diff → not destructive", () => {
    assert.equal(isDestructiveCommand("git diff HEAD~1"), false);
  });

  test("git show HEAD → not destructive", () => {
    assert.equal(isDestructiveCommand("git show HEAD"), false);
  });

  test("find /tmp -name '*.log' (no -delete/-exec) → not destructive", () => {
    assert.equal(isDestructiveCommand("find /tmp -name '*.log'"), false);
  });

  test("grep -r pattern /etc → not destructive", () => {
    assert.equal(isDestructiveCommand("grep -r 'TODO' /home/vladi"), false);
  });
});

// ─── isSafeReadOnlyCommand: explicit allowlist ─────────────────────────────

describe("W1.C — isSafeReadOnlyCommand: explicit allowlist", () => {
  test("ls -la → safe read-only", () => {
    assert.equal(isSafeReadOnlyCommand("ls -la"), true);
  });

  test("cat /etc/passwd → safe read-only", () => {
    assert.equal(isSafeReadOnlyCommand("cat /etc/passwd"), true);
  });

  test("git status → safe read-only", () => {
    assert.equal(isSafeReadOnlyCommand("git status"), true);
  });

  test("git log --oneline → safe read-only", () => {
    assert.equal(isSafeReadOnlyCommand("git log --oneline"), true);
  });

  test("rm -rf /tmp → NOT safe read-only", () => {
    assert.equal(isSafeReadOnlyCommand("rm -rf /tmp"), false);
  });

  test("git checkout -- . → NOT safe read-only (mutating)", () => {
    assert.equal(isSafeReadOnlyCommand("git checkout -- ."), false);
  });
});

// ─── containsSudo: must match sudo as command, not as substring ─────────────

describe("W1.C — containsSudo: standalone command only", () => {
  test("sudo apt update → contains sudo", () => {
    assert.equal(containsSudo("sudo apt update"), true);
  });

  test("echo sudo → does NOT contain sudo (substring of word)", () => {
    assert.equal(containsSudo("echo sudo"), false);
  });

  test("sudoku-cli → does NOT contain sudo (substring of word)", () => {
    assert.equal(containsSudo("sudoku-cli --solve"), false);
  });

  test("rm -rf /tmp → does NOT contain sudo", () => {
    assert.equal(containsSudo("rm -rf /tmp"), false);
  });
});

// ─── isAlwaysBlocked: catastrophic denylist, never allowed ─────────────────

describe("W1.C — isAlwaysBlocked: catastrophic denylist", () => {
  test("rm -rf / → always blocked (root wipe)", () => {
    assert.equal(isAlwaysBlocked("rm -rf /"), true);
  });

  test("dd if=/dev/zero of=/dev/sda → always blocked (disk wipe)", () => {
    assert.equal(isAlwaysBlocked("dd if=/dev/zero of=/dev/sda"), true);
  });

  test("mkfs.ext4 /dev/sda → always blocked (filesystem format)", () => {
    assert.equal(isAlwaysBlocked("mkfs.ext4 /dev/sda"), true);
  });

  test("shutdown -h now → always blocked", () => {
    assert.equal(isAlwaysBlocked("shutdown -h now"), true);
  });

  test("reboot → always blocked", () => {
    assert.equal(isAlwaysBlocked("reboot"), true);
  });

  test("git push --force origin main → always blocked (force-push default)", () => {
    assert.equal(isAlwaysBlocked("git push --force origin main"), true);
  });

  test("git reset --hard → always blocked", () => {
    assert.equal(isAlwaysBlocked("git reset --hard"), true);
  });

  test("git clean -fd → always blocked", () => {
    assert.equal(isAlwaysBlocked("git clean -fd"), true);
  });

  test("ls -la → NOT always blocked (safe)", () => {
    assert.equal(isAlwaysBlocked("ls -la"), false);
  });

  test("cat /etc/passwd → NOT always blocked (safe)", () => {
    assert.equal(isAlwaysBlocked("cat /etc/passwd"), false);
  });

  test("git status → NOT always blocked (safe)", () => {
    assert.equal(isAlwaysBlocked("git status"), false);
  });
});

// ─── extractCommandName ─────────────────────────────────────────────────────

describe("W1.C — extractCommandName: first token, normalized", () => {
  test("rm -rf /tmp → 'rm'", () => {
    assert.equal(extractCommandName("rm -rf /tmp"), "rm");
  });

  test("FOO=bar rm -rf /tmp → 'rm' (env-var prefix stripped)", () => {
    assert.equal(extractCommandName("FOO=bar rm -rf /tmp"), "rm");
  });

  test("sudo apt update → 'apt' (sudo stripped)", () => {
    assert.equal(extractCommandName("sudo apt update"), "apt");
  });

  test("  git status → 'git' (leading whitespace stripped)", () => {
    assert.equal(extractCommandName("  git status"), "git");
  });

  test("'' → '' (empty command)", () => {
    assert.equal(extractCommandName(""), "");
  });
});

// ─── hasShellRedirect ───────────────────────────────────────────────────────

describe("W1.C — hasShellRedirect: shell metacharacter detection", () => {
  test("> → redirect (overwrite)", () => {
    assert.equal(hasShellRedirect("echo hello > file.txt"), true);
  });

  test(">> → redirect (append)", () => {
    assert.equal(hasShellRedirect("echo hello >> file.txt"), true);
  });

  test("< → redirect (input)", () => {
    assert.equal(hasShellRedirect("sort < input.txt"), true);
  });

  test("| → pipe", () => {
    assert.equal(hasShellRedirect("ls | tee log"), true);
  });

  test("& → background", () => {
    assert.equal(hasShellRedirect("sleep 60 &"), true);
  });

  test("&& → control flow, NOT redirect", () => {
    assert.equal(hasShellRedirect("cmd1 && cmd2"), false);
  });

  test("|| → control flow, NOT redirect", () => {
    assert.equal(hasShellRedirect("cmd1 || cmd2"), false);
  });

  test("ls -la → no redirect", () => {
    assert.equal(hasShellRedirect("ls -la"), false);
  });
});

// ─── tokenize ──────────────────────────────────────────────────────────────

describe("W1.C — tokenize: shell-metachar split with quote respect", () => {
  test("rm -rf /tmp → 3 tokens", () => {
    assert.deepEqual(tokenize("rm -rf /tmp"), ["rm", "-rf", "/tmp"]);
  });

  test("echo 'hello world' → 2 tokens (quoted arg kept whole)", () => {
    assert.deepEqual(tokenize("echo 'hello world'"), ["echo", "hello world"]);
  });

  test('echo "hello world" → 2 tokens (double-quoted arg kept whole)', () => {
    assert.deepEqual(tokenize('echo "hello world"'), ["echo", "hello world"]);
  });

  test("'' → empty array", () => {
    assert.deepEqual(tokenize(""), []);
  });

  test("git commit -m 'fix: bug' → 3 tokens", () => {
    assert.deepEqual(tokenize("git commit -m 'fix: bug'"), ["git", "commit", "-m", "fix: bug"]);
  });
});
