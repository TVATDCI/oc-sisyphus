/**
 * test/verdict-parser.test.js — W1.B structured verdict block parser tests.
 *
 * Replaces the brittle string-match gate detection (`content.includes("Gate
 * Decision:** FAIL")`) with a structured HTML comment block parser. The new
 * parser:
 *   - Finds `<!-- SISYPHUS_GATE {...json...} -->` blocks
 *   - Tolerates whitespace variations in the comment markers
 *   - Returns Verdict objects with kind, decision, blockers, schema_version,
 *     timestamp, reviewer
 *   - Does NOT throw on malformed JSON — collects errors and continues
 *
 * The last verdict of a given kind wins (getLatestVerdict).
 *
 * Test framework: node:test (built-in)
 * Assertions:    node:assert/strict
 * Run: `npm test` or `node --test test/verdict-parser.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  parseVerdictBlocks,
  getLatestVerdict,
  validateVerdict,
  _internal,
} from "../src/verdict-parser.js";

// ─── parseVerdictBlocks: basic shape ───────────────────────────────────────

describe("W1.B — verdict-parser: parseVerdictBlocks basics", () => {
  test("parses a single `<!-- SISYPHUS_GATE {...} -->` block", () => {
    const content = [
      "# Momus PRD Review",
      "",
      "Some prose here.",
      "",
      '<!-- SISYPHUS_GATE {"kind": "prd", "decision": "PASS", "blockers": [], "schema_version": "1.0.0", "timestamp": "2026-06-05T22:00:00.000Z", "reviewer": "momus-prd-reviewer"} -->',
      "**Gate Decision:** PASS",
    ].join("\n");
    const verdicts = parseVerdictBlocks(content);
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].kind, "prd");
    assert.equal(verdicts[0].decision, "PASS");
    assert.deepEqual(verdicts[0].blockers, []);
    assert.equal(verdicts[0].schema_version, "1.0.0");
    assert.equal(verdicts[0].timestamp, "2026-06-05T22:00:00.000Z");
    assert.equal(verdicts[0].reviewer, "momus-prd-reviewer");
  });

  test("parses block without leading/trailing spaces inside comment markers", () => {
    const content = '<!--SISYPHUS_GATE {"kind": "prd", "decision": "FAIL", "blockers": ["B1"], "schema_version": "1.0.0", "timestamp": "2026-06-05T22:00:00.000Z", "reviewer": "momus-prd-reviewer"}-->';
    const verdicts = parseVerdictBlocks(content);
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].decision, "FAIL");
    assert.deepEqual(verdicts[0].blockers, ["B1"]);
  });

  test("parses block with extra whitespace: `<!--  SISYPHUS_GATE  {...}  -->`", () => {
    const content = '<!--  SISYPHUS_GATE  {"kind": "plan", "decision": "PASS", "blockers": [], "schema_version": "1.0.0", "timestamp": "2026-06-05T22:00:00.000Z", "reviewer": "momus-plan-reviewer"}  -->';
    const verdicts = parseVerdictBlocks(content);
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].kind, "plan");
    assert.equal(verdicts[0].reviewer, "momus-plan-reviewer");
  });

  test("parses multiple blocks (returns array in order)", () => {
    const content = [
      '<!-- SISYPHUS_GATE {"kind": "prd", "decision": "PASS", "blockers": [], "schema_version": "1.0.0", "timestamp": "2026-06-05T10:00:00.000Z", "reviewer": "momus-prd-reviewer"} -->',
      "# prose between blocks",
      '<!-- SISYPHUS_GATE {"kind": "plan", "decision": "FAIL", "blockers": ["E1"], "schema_version": "1.0.0", "timestamp": "2026-06-05T11:00:00.000Z", "reviewer": "momus-plan-reviewer"} -->',
    ].join("\n");
    const verdicts = parseVerdictBlocks(content);
    assert.equal(verdicts.length, 2);
    assert.equal(verdicts[0].kind, "prd");
    assert.equal(verdicts[1].kind, "plan");
    assert.equal(verdicts[0].decision, "PASS");
    assert.equal(verdicts[1].decision, "FAIL");
  });

  test("returns empty array when no SISYPHUS_GATE blocks present", () => {
    const content = "# Momus PRD Review\n\nJust prose.\n\n**Gate Decision:** PASS\n";
    const verdicts = parseVerdictBlocks(content);
    assert.deepEqual(verdicts, []);
  });

  test("ignores non-SISYPHUS_GATE HTML comments", () => {
    const content = [
      "<!-- this is a regular comment -->",
      "<!-- another comment with SISYPHUS_GATE in prose but not as a block marker -->",
      "# normal markdown",
      "<!-- SISYPHUS_GATE_REAL_NOT_FAKE -->",
    ].join("\n");
    const verdicts = parseVerdictBlocks(content);
    // None of these have a JSON payload, so none should be parsed as a verdict.
    // (The "REAL_NOT_FAKE" line is not a valid SISYPHUS_GATE block — has no `{`.)
    assert.deepEqual(verdicts, []);
  });
});

// ─── parseVerdictBlocks: error handling ────────────────────────────────────

describe("W1.B — verdict-parser: parseVerdictBlocks error handling", () => {
  test("handles malformed JSON: returns error, does not throw", () => {
    const content = '<!-- SISYPHUS_GATE {"kind": "prd", "decision": "PASS", BROKEN -->';
    let verdicts;
    assert.doesNotThrow(() => {
      verdicts = parseVerdictBlocks(content);
    });
    // Either empty or contains an entry with an error — we accept both,
    // but the contract is: NO throw, NO silently-included garbage.
    assert.ok(Array.isArray(verdicts), "verdicts must be an array");
    // The malformed block must NOT be returned as a valid verdict
    const validVerdicts = verdicts.filter((v) => v.decision === "PASS" || v.decision === "FAIL");
    assert.equal(validVerdicts.length, 0, "malformed JSON must not be returned as a valid verdict");
  });

  test("handles missing required fields: returns validation errors", () => {
    // Missing `kind`, `decision`, `blockers`
    const content = '<!-- SISYPHUS_GATE {"schema_version": "1.0.0", "timestamp": "2026-06-05T22:00:00.000Z", "reviewer": "momus-prd-reviewer"} -->';
    const verdicts = parseVerdictBlocks(content);
    // The block is parsed but validateVerdict flags it. parseVerdictBlocks
    // returns the entry, with errors attached. We assert the verdict
    // exists but is not "valid" by calling validateVerdict on it.
    assert.equal(verdicts.length, 1);
    const validation = validateVerdict(verdicts[0]);
    assert.equal(validation.valid, false, "missing required fields must fail validation");
    assert.ok(validation.errors.length > 0, "validation errors must be reported");
  });

  test("handles future schema_version: returns validation error", () => {
    const content = '<!-- SISYPHUS_GATE {"kind": "prd", "decision": "PASS", "blockers": [], "schema_version": "99.0.0", "timestamp": "2026-06-05T22:00:00.000Z", "reviewer": "momus-prd-reviewer"} -->';
    const verdicts = parseVerdictBlocks(content);
    assert.equal(verdicts.length, 1);
    const validation = validateVerdict(verdicts[0]);
    assert.equal(validation.valid, false, "future schema_version must fail validation");
    assert.ok(
      validation.errors.some((e) => /schema/i.test(e)),
      `validation errors must mention schema: got ${JSON.stringify(validation.errors)}`
    );
  });
});

// ─── getLatestVerdict ──────────────────────────────────────────────────────

describe("W1.B — verdict-parser: getLatestVerdict", () => {
  test("returns null when no blocks", () => {
    const content = "# No blocks here\n";
    const v = getLatestVerdict(content, "prd");
    assert.equal(v, null);
  });

  test("returns last PASS when multiple PASSes exist", () => {
    const content = [
      '<!-- SISYPHUS_GATE {"kind": "prd", "decision": "PASS", "blockers": ["old"], "schema_version": "1.0.0", "timestamp": "2026-06-05T10:00:00.000Z", "reviewer": "momus-prd-reviewer"} -->',
      "first pass",
      '<!-- SISYPHUS_GATE {"kind": "prd", "decision": "PASS", "blockers": [], "schema_version": "1.0.0", "timestamp": "2026-06-05T11:00:00.000Z", "reviewer": "momus-prd-reviewer"} -->',
    ].join("\n");
    const v = getLatestVerdict(content, "prd");
    assert.ok(v, "must return a verdict");
    assert.equal(v.decision, "PASS");
    // Last one wins — blockers must be the empty list, not the old ["old"]
    assert.deepEqual(v.blockers, []);
  });

  test("returns last block when mixed PASS/FAIL", () => {
    const content = [
      '<!-- SISYPHUS_GATE {"kind": "prd", "decision": "PASS", "blockers": [], "schema_version": "1.0.0", "timestamp": "2026-06-05T10:00:00.000Z", "reviewer": "momus-prd-reviewer"} -->',
      "first pass",
      '<!-- SISYPHUS_GATE {"kind": "prd", "decision": "FAIL", "blockers": ["B1"], "schema_version": "1.0.0", "timestamp": "2026-06-05T11:00:00.000Z", "reviewer": "momus-prd-reviewer"} -->',
    ].join("\n");
    const v = getLatestVerdict(content, "prd");
    assert.ok(v, "must return a verdict");
    assert.equal(v.decision, "FAIL", "last verdict wins even when earlier was PASS");
    assert.deepEqual(v.blockers, ["B1"]);
  });

  test("filters by kind (prd vs plan)", () => {
    const content = [
      '<!-- SISYPHUS_GATE {"kind": "prd", "decision": "PASS", "blockers": [], "schema_version": "1.0.0", "timestamp": "2026-06-05T10:00:00.000Z", "reviewer": "momus-prd-reviewer"} -->',
      '<!-- SISYPHUS_GATE {"kind": "plan", "decision": "FAIL", "blockers": ["E1"], "schema_version": "1.0.0", "timestamp": "2026-06-05T11:00:00.000Z", "reviewer": "momus-plan-reviewer"} -->',
    ].join("\n");
    const prd = getLatestVerdict(content, "prd");
    const plan = getLatestVerdict(content, "plan");
    assert.equal(prd.kind, "prd");
    assert.equal(prd.decision, "PASS");
    assert.equal(plan.kind, "plan");
    assert.equal(plan.decision, "FAIL");
  });

  test("returns null when only blocks of the OTHER kind exist", () => {
    const content = '<!-- SISYPHUS_GATE {"kind": "plan", "decision": "PASS", "blockers": [], "schema_version": "1.0.0", "timestamp": "2026-06-05T10:00:00.000Z", "reviewer": "momus-plan-reviewer"} -->';
    const v = getLatestVerdict(content, "prd");
    assert.equal(v, null, "asking for prd when only plan blocks exist must return null");
  });
});

// ─── scanReviewFiles: WARN / PASS / FAIL mapping ───────────────────────────

describe("W1.B — verdict-parser → scanReviewFiles integration", () => {
  // We import scanReviewFiles lazily inside each test so the test can set
  // up a temp working directory with fake notepad files.
  test("WARN decision is mapped to null (uncertain) by scanReviewFiles", async () => {
    const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const cwd = mkdtempSync(join(tmpdir(), "vp-warn-"));
    mkdirSync(join(cwd, ".sisyphus", "notepads", "plan1"), { recursive: true });
    writeFileSync(
      join(cwd, ".sisyphus", "notepads", "plan1", "momus-prd-review-2026-06-05.md"),
      [
        "# Momus PRD Review",
        '<!-- SISYPHUS_GATE {"kind": "prd", "decision": "WARN", "blockers": ["minor"], "schema_version": "1.0.0", "timestamp": "2026-06-05T22:00:00.000Z", "reviewer": "momus-prd-reviewer"} -->',
        "**Gate Decision:** WARN",
      ].join("\n")
    );
    const origCwd = process.cwd();
    process.chdir(cwd);
    try {
      const { scanReviewFiles } = await import("../src/review-scanner.js");
      const result = scanReviewFiles();
      assert.equal(result.prdGate, null, "WARN must map to null");
    } finally {
      process.chdir(origCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("PASS decision returns 'PASS' from scanReviewFiles", async () => {
    const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const cwd = mkdtempSync(join(tmpdir(), "vp-pass-"));
    mkdirSync(join(cwd, ".sisyphus", "notepads", "plan1"), { recursive: true });
    writeFileSync(
      join(cwd, ".sisyphus", "notepads", "plan1", "momus-prd-review-2026-06-05.md"),
      [
        "# Momus PRD Review",
        '<!-- SISYPHUS_GATE {"kind": "prd", "decision": "PASS", "blockers": [], "schema_version": "1.0.0", "timestamp": "2026-06-05T22:00:00.000Z", "reviewer": "momus-prd-reviewer"} -->',
        "**Gate Decision:** PASS",
      ].join("\n")
    );
    const origCwd = process.cwd();
    process.chdir(cwd);
    try {
      const { scanReviewFiles } = await import("../src/review-scanner.js");
      const result = scanReviewFiles();
      assert.equal(result.prdGate, "PASS");
    } finally {
      process.chdir(origCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("FAIL decision returns 'FAIL' from scanReviewFiles", async () => {
    const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const cwd = mkdtempSync(join(tmpdir(), "vp-fail-"));
    mkdirSync(join(cwd, ".sisyphus", "notepads", "plan1"), { recursive: true });
    writeFileSync(
      join(cwd, ".sisyphus", "notepads", "plan1", "momus-prd-review-2026-06-05.md"),
      [
        "# Momus PRD Review",
        '<!-- SISYPHUS_GATE {"kind": "prd", "decision": "FAIL", "blockers": ["A-1"], "schema_version": "1.0.0", "timestamp": "2026-06-05T22:00:00.000Z", "reviewer": "momus-prd-reviewer"} -->',
        "**Gate Decision:** FAIL",
      ].join("\n")
    );
    const origCwd = process.cwd();
    process.chdir(cwd);
    try {
      const { scanReviewFiles } = await import("../src/review-scanner.js");
      const result = scanReviewFiles();
      assert.equal(result.prdGate, "FAIL");
    } finally {
      process.chdir(origCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("invalid verdict (missing required fields) → scanReviewFiles returns null for that gate", async () => {
    const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const cwd = mkdtempSync(join(tmpdir(), "vp-invalid-"));
    mkdirSync(join(cwd, ".sisyphus", "notepads", "plan1"), { recursive: true });
    // Missing `kind` and `decision` — validation must fail
    writeFileSync(
      join(cwd, ".sisyphus", "notepads", "plan1", "momus-plan-review-2026-06-05.md"),
      [
        "# Momus Plan Review",
        '<!-- SISYPHUS_GATE {"schema_version": "1.0.0", "timestamp": "2026-06-05T22:00:00.000Z", "reviewer": "momus-plan-reviewer"} -->',
        "**Gate Decision:** PASS",
      ].join("\n")
    );
    const origCwd = process.cwd();
    process.chdir(cwd);
    try {
      const { scanReviewFiles } = await import("../src/review-scanner.js");
      const result = scanReviewFiles();
      assert.equal(result.planGate, null, "invalid verdict must not contribute to gate status");
    } finally {
      process.chdir(origCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

// ─── Public API surface ────────────────────────────────────────────────────

describe("W1.B — verdict-parser: public API surface", () => {
  test("parseVerdictBlocks is exported and is a function", () => {
    assert.equal(typeof parseVerdictBlocks, "function");
  });

  test("getLatestVerdict is exported and is a function", () => {
    assert.equal(typeof getLatestVerdict, "function");
  });

  test("validateVerdict is exported and is a function", () => {
    assert.equal(typeof validateVerdict, "function");
  });
});
