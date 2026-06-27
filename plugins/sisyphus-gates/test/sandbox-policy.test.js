/**
 * test/sandbox-policy.test.js — unit tests for src/sandbox-policy.js
 *
 * Slice A (brain-vi1): Config plumbing — loadSandboxConfig validation.
 *   Covers AC-3.7, AC-3.8, AC-3.9.
 *
 * Slice B (brain-99x): Path matching — isSandboxPath (realpath-based).
 *   Covers AC-3.6 (symlink escape) + positive/negative match + edge cases.
 *
 * Layer 3.7 sandbox relaxation is opt-in via opencode.json plugin config:
 *   {
 *     "sandbox_paths": ["/tmp/"],
 *     "sandbox_allowed_commands": ["npm install", ...]
 *   }
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSandboxConfig, isSandboxPath, isSandboxCommand } from "../src/sandbox-policy.js";

// ─── Helper: temp-dir fixture with cleanup ────────────────────────────────

function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function cleanup(...dirs) {
  for (const d of dirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Slice A (brain-vi1): Config plumbing — loadSandboxConfig
// ═══════════════════════════════════════════════════════════════════════════

// ─── AC-3.8: Missing sandbox_paths key produces byte-identical behavior ────

test("AC-3.8: loadSandboxConfig({}) returns empty config (feature disabled)", () => {
  const result = loadSandboxConfig({});
  assert.notEqual(result, null, "should return an object, not null");
  assert.deepEqual(result, {
    sandboxPaths: [],
    sandboxAllowedCommands: [],
  });
});

test("AC-3.8: loadSandboxConfig(undefined) returns empty config", () => {
  const result = loadSandboxConfig(undefined);
  assert.notEqual(result, null);
  assert.deepEqual(result, {
    sandboxPaths: [],
    sandboxAllowedCommands: [],
  });
});

test("AC-3.8: loadSandboxConfig(null) returns empty config", () => {
  const result = loadSandboxConfig(null);
  assert.notEqual(result, null);
  assert.deepEqual(result, {
    sandboxPaths: [],
    sandboxAllowedCommands: [],
  });
});

// ─── AC-3.7: Empty sandbox_paths produces byte-identical behavior ──────────

test("AC-3.7: loadSandboxConfig({sandbox_paths: []}) returns empty paths", () => {
  const result = loadSandboxConfig({ sandbox_paths: [] });
  assert.deepEqual(result, {
    sandboxPaths: [],
    sandboxAllowedCommands: [],
  });
});

test("AC-3.7: empty sandbox_paths + populated allowed_commands returns empty paths only", () => {
  // Even with allowed commands, empty paths means feature disabled.
  // We still return the object (not null) so callers can distinguish
  // "explicitly empty" from "validation failure".
  const result = loadSandboxConfig({
    sandbox_paths: [],
    sandbox_allowed_commands: ["npm install"],
  });
  assert.deepEqual(result, {
    sandboxPaths: [],
    sandboxAllowedCommands: ["npm install"],
  });
});

// ─── AC-3.9: Malformed sandbox_paths (no trailing slash) rejected ─────────

test("AC-3.9: loadSandboxConfig({sandbox_paths: ['/tmp']}) returns null (no trailing slash)", () => {
  // Per D6: any entry without trailing "/" → reject ENTIRE config.
  // This prevents /tmp from matching /tmp-eslint-cache, /tmpfoo, etc.
  const result = loadSandboxConfig({ sandbox_paths: ["/tmp"] });
  assert.equal(result, null, "must reject entire config when any path lacks trailing /");
});

test("AC-3.9: mix of valid and invalid entries → entire config rejected (null)", () => {
  const result = loadSandboxConfig({
    sandbox_paths: ["/tmp/", "/var"], // second entry lacks trailing /
  });
  assert.equal(result, null);
});

test("AC-3.9: empty string entry → rejected (no trailing slash)", () => {
  const result = loadSandboxConfig({
    sandbox_paths: [""],
  });
  assert.equal(result, null);
});

// ─── Happy path: valid config returns populated object ────────────────────

test("happy path: valid config returns populated object", () => {
  const result = loadSandboxConfig({
    sandbox_paths: ["/tmp/", "/var/tmp/"],
    sandbox_allowed_commands: ["npm install", "npm test", "tsc --noEmit"],
  });
  assert.deepEqual(result, {
    sandboxPaths: ["/tmp/", "/var/tmp/"],
    sandboxAllowedCommands: ["npm install", "npm test", "tsc --noEmit"],
  });
});

test("happy path: sandbox_paths set but sandbox_allowed_commands missing → empty allowed commands", () => {
  const result = loadSandboxConfig({
    sandbox_paths: ["/tmp/"],
  });
  assert.deepEqual(result, {
    sandboxPaths: ["/tmp/"],
    sandboxAllowedCommands: [],
  });
});

// ─── Type robustness ──────────────────────────────────────────────────────

test("non-array sandbox_paths → null (validation failure)", () => {
  assert.equal(loadSandboxConfig({ sandbox_paths: "/tmp/" }), null);
  assert.equal(loadSandboxConfig({ sandbox_paths: 42 }), null);
  assert.equal(loadSandboxConfig({ sandbox_paths: { 0: "/tmp/" } }), null);
});

test("non-string entry in sandbox_paths → null (validation failure)", () => {
  assert.equal(loadSandboxConfig({ sandbox_paths: ["/tmp/", 42] }), null);
  assert.equal(loadSandboxConfig({ sandbox_paths: [null] }), null);
  assert.equal(loadSandboxConfig({ sandbox_paths: ["/tmp/", { evil: true }] }), null);
});

test("non-array sandbox_allowed_commands → null (validation failure)", () => {
  assert.equal(
    loadSandboxConfig({ sandbox_paths: ["/tmp/"], sandbox_allowed_commands: "npm install" }),
    null
  );
});

test("non-string entry in sandbox_allowed_commands → null (validation failure)", () => {
  assert.equal(
    loadSandboxConfig({ sandbox_paths: ["/tmp/"], sandbox_allowed_commands: ["npm install", 42] }),
    null
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Slice B (brain-99x): Path matching — isSandboxPath
// ═══════════════════════════════════════════════════════════════════════════

// ─── Positive match ────────────────────────────────────────────────────────

test("Slice B / positive: cwd inside sandbox prefix returns matchedSandboxPath", () => {
  const sandbox = makeTempDir("sandbox-pos-");
  try {
    const result = isSandboxPath(sandbox, ["/tmp/"]);
    assert.notEqual(result, null);
    assert.equal(result.matchedSandboxPath, "/tmp/");
  } finally {
    cleanup(sandbox);
  }
});

test("Slice B / positive: cwd equals exactly the sandbox prefix dir (no children)", () => {
  // /tmp itself is the sandbox root — match
  const result = isSandboxPath("/tmp", ["/tmp/"]);
  assert.notEqual(result, null);
  assert.equal(result.matchedSandboxPath, "/tmp/");
});

test("Slice B / positive: cwd with trailing slash matches sandbox prefix", () => {
  const result = isSandboxPath("/tmp/", ["/tmp/"]);
  assert.notEqual(result, null);
  assert.equal(result.matchedSandboxPath, "/tmp/");
});

test("Slice B / positive: first matching prefix wins when multiple configured", () => {
  const result = isSandboxPath("/tmp/foo", ["/var/", "/tmp/", "/opt/"]);
  assert.notEqual(result, null);
  assert.equal(result.matchedSandboxPath, "/tmp/");
});

test("Slice B / positive: deeper cwd still matches root prefix", () => {
  const result = isSandboxPath("/tmp/a/b/c/d/e", ["/tmp/"]);
  assert.notEqual(result, null);
  assert.equal(result.matchedSandboxPath, "/tmp/");
});

// ─── Negative match ───────────────────────────────────────────────────────

test("Slice B / negative: cwd outside all sandbox prefixes returns null", () => {
  const result = isSandboxPath("/home/user/project", ["/tmp/", "/var/tmp/"]);
  assert.equal(result, null);
});

test("Slice B / negative: prefix-overmatch guard — '/tmpfoobar' does NOT match '/tmp/'", () => {
  // The trailing slash + startsWith ensures /tmpfoobar/ != /tmp/ even though
  // they share the /tmp stem.
  const result = isSandboxPath("/tmpfoobar", ["/tmp/"]);
  assert.equal(result, null, "must NOT overmatch — /tmpfoobar is not /tmp/");
});

test("Slice B / negative: similar-prefix directory does NOT match", () => {
  // /tmp-foo should NOT match /tmp/ even though they share the /tmp stem
  const result = isSandboxPath("/tmp-foo", ["/tmp/"]);
  assert.equal(result, null);
});

// ─── AC-3.6: Symlink escape defense ───────────────────────────────────────

test("AC-3.6: symlink pointing OUTSIDE sandbox does NOT grant sandbox privileges", () => {
  // Setup: sandbox-prefix/ contains a symlink "escape" → outside-dir/
  // realpath(sandbox-prefix/escape) = outside-dir/, which is NOT under sandbox-prefix
  const sandboxPrefix = makeTempDir("sandbox-prefix-");
  const outsideDir = makeTempDir("outside-");
  const symlinkPath = join(sandboxPrefix, "escape-link");
  try {
    symlinkSync(outsideDir, symlinkPath);
    const result = isSandboxPath(symlinkPath, [sandboxPrefix + "/"]);
    assert.equal(
      result,
      null,
      "symlink escape must NOT grant sandbox privileges — realpath resolves to outsideDir"
    );
  } finally {
    cleanup(sandboxPrefix, outsideDir);
  }
});

test("AC-3.6: symlink pointing INSIDE sandbox still matches (legitimate use)", () => {
  // Setup: sandbox-prefix/real/ is a real dir; sandbox-prefix/link → sandbox-prefix/real
  // realpath(sandbox-prefix/link) = sandbox-prefix/real, which IS under sandbox-prefix
  const sandboxPrefix = makeTempDir("sandbox-prefix-");
  const realTarget = join(sandboxPrefix, "real-dir");
  const symlinkPath = join(sandboxPrefix, "link-to-real");
  try {
    mkdirSync(realTarget);
    symlinkSync(realTarget, symlinkPath);
    const result = isSandboxPath(symlinkPath, [sandboxPrefix + "/"]);
    assert.notEqual(result, null, "legitimate in-sandbox symlink should match");
    assert.equal(result.matchedSandboxPath, sandboxPrefix + "/");
  } finally {
    cleanup(sandboxPrefix);
  }
});

test("AC-3.6: chained symlinks (A → B → outside) do NOT escape defense", () => {
  // Setup: prefix/link1 → prefix/link2, prefix/link2 → outside
  // realpath should resolve the full chain and detect the escape.
  const sandboxPrefix = makeTempDir("sandbox-prefix-");
  const outsideDir = mkdtempSync(join(tmpdir(), "outside-chain-"));
  const link2 = join(sandboxPrefix, "link2");
  const link1 = join(sandboxPrefix, "link1");
  try {
    symlinkSync(outsideDir, link2);
    symlinkSync(link2, link1);
    const result = isSandboxPath(link1, [sandboxPrefix + "/"]);
    assert.equal(result, null, "chained symlinks escaping sandbox must be detected");
  } finally {
    cleanup(sandboxPrefix, outsideDir);
  }
});

// ─── Edge cases: invalid inputs ───────────────────────────────────────────

test("Slice B / edge: empty sandboxPaths array returns null (feature disabled)", () => {
  const result = isSandboxPath("/tmp/foo", []);
  assert.equal(result, null);
});

test("Slice B / edge: null sandboxPaths returns null", () => {
  const result = isSandboxPath("/tmp/foo", null);
  assert.equal(result, null);
});

test("Slice B / edge: undefined sandboxPaths returns null", () => {
  const result = isSandboxPath("/tmp/foo", undefined);
  assert.equal(result, null);
});

test("Slice B / edge: empty cwd returns null", () => {
  const result = isSandboxPath("", ["/tmp/"]);
  assert.equal(result, null);
});

test("Slice B / edge: null cwd returns null", () => {
  const result = isSandboxPath(null, ["/tmp/"]);
  assert.equal(result, null);
});

test("Slice B / edge: undefined cwd returns null", () => {
  const result = isSandboxPath(undefined, ["/tmp/"]);
  assert.equal(result, null);
});

test("Slice B / edge: non-string cwd returns null", () => {
  assert.equal(isSandboxPath(42, ["/tmp/"]), null);
  assert.equal(isSandboxPath({ path: "/tmp" }, ["/tmp/"]), null);
  assert.equal(isSandboxPath(["/tmp"], ["/tmp/"]), null);
});

test("Slice B / edge: non-array sandboxPaths returns null", () => {
  assert.equal(isSandboxPath("/tmp/foo", "/tmp/"), null);
  assert.equal(isSandboxPath("/tmp/foo", { 0: "/tmp/" }), null);
});

// ─── Edge cases: non-existent cwd ─────────────────────────────────────────

test("Slice B / edge: non-existent cwd under sandbox prefix — canonicalize falls back to literal, matches if literal starts with prefix", () => {
  // /tmp/nonexistent-xyz-123 doesn't exist. canonicalize returns the literal
  // path (after parent-resolution). /tmp/ prefix still matches.
  const fakePath = "/tmp/sandbox-policy-test-nonexistent-" + process.pid;
  const result = isSandboxPath(fakePath, ["/tmp/"]);
  assert.notEqual(result, null, "non-existent path under /tmp/ should still match by literal");
  assert.equal(result.matchedSandboxPath, "/tmp/");
});

test("Slice B / edge: non-existent cwd outside sandbox prefix returns null", () => {
  const fakePath = "/nonexistent/path/outside/sandbox-" + process.pid;
  const result = isSandboxPath(fakePath, ["/tmp/"]);
  assert.equal(result, null);
});

// ─── Tilde expansion ──────────────────────────────────────────────────────

test("Slice B / tilde expansion: ~/path resolves via HOME and matches sandbox prefix under HOME", () => {
  // This test creates a temp dir under HOME and configures it as sandbox.
  // Skipped if HOME is not set or not writable.
  const home = process.env.HOME;
  if (!home) {
    // Skip — no HOME available
    return;
  }
  // Don't actually create a dir under HOME (could pollute). Just verify the
  // tilde expansion path resolves correctly via canonicalize.
  // Use a path that we know resolves to home itself: "~"
  const result = isSandboxPath("~", [home + "/"]);
  // canonicalize("~") = home (after expansion). home + "/" matches.
  assert.notEqual(result, null);
});


// ═══ Slice C (brain-ph1): Command matching — isSandboxCommand ═════════

test("AC-3.10: npm installx does NOT match npm install (word boundary)", () => {
  assert.equal(isSandboxCommand("npm installx", ["npm install"]), null);
});

test("AC-3.10: npm install DOES match npm install (EOL boundary)", () => {
  const r = isSandboxCommand("npm install", ["npm install"]);
  assert.notEqual(r, null);
  assert.equal(r.matchedPattern, "npm install");
});

test("AC-3.11: chaining denies — npm install && rm -rf /tmp", () => {
  assert.equal(isSandboxCommand("npm install && rm -rf /tmp", ["npm install"]), null);
});

test("AC-3.11: semicolon denies — npm install; rm /tmp/x", () => {
  assert.equal(isSandboxCommand("npm install; rm /tmp/x", ["npm install"]), null);
});

test("AC-3.12: redirect denies — echo foo > /tmp/x", () => {
  assert.equal(isSandboxCommand("echo foo > /tmp/x", ["echo"]), null);
});

test("AC-3.12: redirect denies — npm install > /tmp/log", () => {
  assert.equal(isSandboxCommand("npm install > /tmp/log", ["npm install"]), null);
});

test("AC-3.13: env-var normalized — FOO=bar npm install matches npm install", () => {
  const r = isSandboxCommand("FOO=bar npm install --save-dev foo", ["npm install"]);
  assert.notEqual(r, null);
  assert.equal(r.matchedPattern, "npm install");
});

test("AC-3.14: tab separator matches (\\s+ body)", () => {
  assert.notEqual(isSandboxCommand("npm\tinstall foo", ["npm install"]), null);
});

test("AC-3.14: double space matches", () => {
  assert.notEqual(isSandboxCommand("npm  install", ["npm install"]), null);
});

test("AC-3.15: pipe denies", () => {
  assert.equal(isSandboxCommand("npm install | cat", ["npm install"]), null);
});

test("AC-3.15: ampersand denies", () => {
  assert.equal(isSandboxCommand("npm install & wait", ["npm install"]), null);
});

test("AC-3.15: cmd substitution denies", () => {
  assert.equal(isSandboxCommand("npm install $(evil)", ["npm install"]), null);
});

test("AC-3.15: backtick substitution denies", () => {
  assert.equal(isSandboxCommand("npm install `evil`", ["npm install"]), null);
});

test("AC-3.15: input redirect denies", () => {
  assert.equal(isSandboxCommand("npm install < /etc/passwd", ["npm install"]), null);
});

// ─── AC-3.18: REAL regex metachar escape tests ──────────────────────

test("AC-3.18/dot: foo.bar literal, NOT any-char (fooXbar rejected)", () => {
  assert.notEqual(isSandboxCommand("foo.bar", ["foo.bar"]), null);
  assert.equal(isSandboxCommand("fooXbar", ["foo.bar"]), null);
});

test("AC-3.18/star: foo* literal, NOT quantifier", () => {
  assert.notEqual(isSandboxCommand("foo*", ["foo*"]), null);
  assert.equal(isSandboxCommand("foo", ["foo*"]), null);
  assert.equal(isSandboxCommand("foooo", ["foo*"]), null);
});

test("AC-3.18/plus: foo+ literal, NOT quantifier", () => {
  assert.notEqual(isSandboxCommand("foo+", ["foo+"]), null);
  assert.equal(isSandboxCommand("foo", ["foo+"]), null);
});

test("AC-3.18/question: foo? literal, NOT optional", () => {
  assert.notEqual(isSandboxCommand("foo?", ["foo?"]), null);
  assert.equal(isSandboxCommand("foo", ["foo?"]), null);
});

test("AC-3.18/caret: ^foo literal, NOT anchor", () => {
  assert.notEqual(isSandboxCommand("^foo", ["^foo"]), null);
});

test("AC-3.18/dollar: foo$ literal, NOT end anchor", () => {
  assert.notEqual(isSandboxCommand("foo$", ["foo$"]), null);
  assert.equal(isSandboxCommand("foo", ["foo$"]), null);
});

test("AC-3.18/parens: foo (bar) literal, NOT capture group", () => {
  assert.notEqual(isSandboxCommand("foo (bar)", ["foo (bar)"]), null);
  assert.equal(isSandboxCommand("foo bar", ["foo (bar)"]), null);
});

test("AC-3.18/brackets: foo [bar] literal, NOT char class", () => {
  assert.notEqual(isSandboxCommand("foo [bar]", ["foo [bar]"]), null);
  assert.equal(isSandboxCommand("foo a", ["foo [bar]"]), null);
});

test("AC-3.18/braces: foo{2} literal, NOT quantifier", () => {
  assert.notEqual(isSandboxCommand("foo{2}", ["foo{2}"]), null);
  assert.equal(isSandboxCommand("foofoo", ["foo{2}"]), null);
});

test("AC-3.18/pipe: foo|bar is DENIED by hasShellMetachar (pipe is shell metachar first)", () => {
  // Pipe is caught by the chaining regex [;|] in hasShellMetachar BEFORE
  // escapeRegExp even runs. This is correct defense-in-depth: a command
  // containing | is a shell pipeline, not a literal string. The test verifies
  // the DENIAL, not a regex escape — escapeRegExp is exercised by the
  // regex-only metachars (., *, +, ?, ^, $, (, ), [, ], {, }, \) above.
  assert.equal(isSandboxCommand("foo|bar", ["foo|bar"]), null);
  assert.equal(isSandboxCommand("foo", ["foo|bar"]), null);
  assert.equal(isSandboxCommand("bar", ["foo|bar"]), null);
});

test("AC-3.18/backslash: foo\\bar literal backslash", () => {
  assert.notEqual(isSandboxCommand("foo\\bar", ["foo\\bar"]), null);
});

// ─── AC-3.19 + AC-3.20 + happy path + edges ─────────────────────────

test("AC-3.19: exact match (no args) via EOL lookahead", () => {
  assert.notEqual(isSandboxCommand("npm install", ["npm install"]), null);
  assert.notEqual(isSandboxCommand("bunx", ["bunx"]), null);
});

test("AC-3.20: trailing space trimmed — bunx doctor matches bunx-space", () => {
  assert.notEqual(isSandboxCommand("bunx doctor", ["bunx "]), null);
  assert.notEqual(isSandboxCommand("npm run build", ["npm run "]), null);
});

test("happy: multi-arg match", () => {
  assert.notEqual(isSandboxCommand("npm install --save-dev typescript", ["npm install"]), null);
  assert.notEqual(isSandboxCommand("node bin/cli.js", ["node"]), null);
});

test("multi-entry: first match wins", () => {
  const r = isSandboxCommand("npm install foo", ["echo", "npm install", "node"]);
  assert.equal(r.matchedPattern, "npm install");
});

test("edge: empty/null inputs return null", () => {
  assert.equal(isSandboxCommand("", ["npm install"]), null);
  assert.equal(isSandboxCommand(null, ["npm install"]), null);
  assert.equal(isSandboxCommand("npm install", []), null);
  assert.equal(isSandboxCommand("npm install", null), null);
});
