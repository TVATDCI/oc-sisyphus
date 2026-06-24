/**
 * test/load-signed-verdicts.test.js — tests for loadSignedVerdicts (P0b Step 4).
 *
 * Creates temp notepads directories with REAL signed verdict files (using
 * signVerdict from Step 2), then verifies loadSignedVerdicts correctly:
 *   - Accepts valid signed PASS/FAIL verdicts
 *   - Rejects unsigned, tampered, wrong-key, null-key, wrong-id verdicts
 *   - Returns WARN as null (uncertain)
 *   - Selects latest by signed_at when multiple verdicts exist
 *   - Never throws on any input
 *
 * Uses _internal.setBaseDir(tmpDir) to point loadSignedVerdicts at a temp
 * notepads tree (same testability pattern as mcp-classifier.js).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadSignedVerdicts, _internal } from "../src/review-scanner.js";
import { signVerdict } from "../src/verdict-signing.js";

const TEST_KEY = "test-key-do-not-use-in-prod";
const TEST_KEY_2 = "different-test-key";

// ─── Test fixture helpers ───────────────────────────────────────────────────

/**
 * Create a temp base dir with a notepads/<session>/ subdir.
 * Returns { baseDir, notepadsDir, sessionDir, cleanup }.
 */
function setupTempNotepads() {
  const baseDir = mkdtempSync(join(tmpdir(), "sisyphus-gates-test-"));
  const notepadsDir = join(baseDir, ".sisyphus", "notepads");
  const sessionDir = join(notepadsDir, "ses_test123");
  mkdirSync(sessionDir, { recursive: true });
  _internal.setBaseDir(baseDir);
  return {
    baseDir,
    notepadsDir,
    sessionDir,
    cleanup: () => {
      _internal.resetBaseDir();
      rmSync(baseDir, { recursive: true, force: true });
    },
  };
}

/**
 * Write a signed verdict file to sessionDir.
 * Uses REAL signVerdict to produce a valid HMAC.
 */
function writeSignedVerdict(sessionDir, kind, payloadOverrides = {}, filename = null) {
  const payload = {
    kind,
    decision: "PASS",
    id: "abc-123",
    schema_version: "2.0.0",
    signed_at: "2026-06-21T19:50:00.000Z",
    sessionID: "ses_test123",
    operator: "primary",
    ...payloadOverrides,
  };
  const sig = signVerdict(payload, TEST_KEY);
  const content =
    `<!-- SISYPHUS_GATE ${JSON.stringify(payload)} -->\n` +
    `<!-- SISYPHUS_GATE_SIG ${JSON.stringify(sig)} -->\n`;
  const fname =
    filename || `momus-${kind}-review-${payload.signed_at.replace(/[:.]/g, "-")}.md`;
  writeFileSync(join(sessionDir, fname), content, "utf-8");
  return { payload, sig, filename: fname };
}

/**
 * Write a RAW file (for unsigned/tampered/malformed fixtures).
 */
function writeRawFile(sessionDir, filename, content) {
  writeFileSync(join(sessionDir, filename), content, "utf-8");
}

// ─── Spec criteria (12) ─────────────────────────────────────────────────────

test("no-verdicts-empty-notepads: notepads dir doesn't exist → gate=null, valid=false", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "sisyphus-empty-"));
  _internal.setBaseDir(baseDir);
  try {
    // notepads dir does NOT exist
    const result = loadSignedVerdicts("plan", null, TEST_KEY);
    assert.equal(result.gate, null);
    assert.equal(result.id, null);
    assert.equal(result.valid, false);
  } finally {
    _internal.resetBaseDir();
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("no-verdicts-no-matching-files: notepads exists, no momus-*-review files → gate=null", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    // Write an unrelated file
    writeFileSync(join(sessionDir, "random-notes.md"), "hello", "utf-8");
    const result = loadSignedVerdicts("plan", null, TEST_KEY);
    assert.equal(result.gate, null);
    assert.equal(result.valid, false);
  } finally {
    cleanup();
  }
});

test("unsigned-block-ignored: file with SISYPHUS_GATE but NO SISYPHUS_GATE_SIG → gate=null", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    // Payload WITHOUT a signature block
    const payload = {
      kind: "plan", decision: "PASS", id: "abc-123",
      schema_version: "2.0.0", signed_at: "2026-06-21T19:50:00.000Z",
      sessionID: "ses_test123", operator: "primary",
    };
    writeRawFile(sessionDir, "momus-plan-review-unsigned.md",
      `<!-- SISYPHUS_GATE ${JSON.stringify(payload)} -->\n` +
      `No signature block here.\n`);
    const result = loadSignedVerdicts("plan", null, TEST_KEY);
    assert.equal(result.gate, null);
    assert.equal(result.valid, false);
  } finally {
    cleanup();
  }
});

test("valid-pass-verdict: signed PASS verdict → gate='PASS', valid=true", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    writeSignedVerdict(sessionDir, "plan", { decision: "PASS", id: "abc-123" });
    const result = loadSignedVerdicts("plan", null, TEST_KEY);
    assert.equal(result.gate, "PASS");
    assert.equal(result.id, "abc-123");
    assert.equal(result.valid, true);
  } finally {
    cleanup();
  }
});

test("valid-fail-verdict: signed FAIL verdict → gate='FAIL', valid=true", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    writeSignedVerdict(sessionDir, "plan", { decision: "FAIL", id: "abc-123" });
    const result = loadSignedVerdicts("plan", null, TEST_KEY);
    assert.equal(result.gate, "FAIL");
    assert.equal(result.id, "abc-123");
    assert.equal(result.valid, true);
  } finally {
    cleanup();
  }
});

test("valid-warn-verdict: signed WARN verdict → gate=null (WARN is uncertain)", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    writeSignedVerdict(sessionDir, "plan", { decision: "WARN", id: "abc-123" });
    const result = loadSignedVerdicts("plan", null, TEST_KEY);
    assert.equal(result.gate, null);
    assert.equal(result.valid, true);   // valid signature, but uncertain gate
    assert.equal(result.id, "abc-123");
  } finally {
    cleanup();
  }
});

test("tampered-payload-rejected: payload modified after signing → HMAC mismatch → gate=null", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    // Sign a PASS verdict — but DON'T write the original file. Only write
    // the tampered version (FAIL payload + original PASS signature).
    const payload = {
      kind: "plan", decision: "PASS", id: "abc-123",
      schema_version: "2.0.0", signed_at: "2026-06-21T19:50:00.000Z",
      sessionID: "ses_test123", operator: "primary",
    };
    const sig = signVerdict(payload, TEST_KEY);
    // Construct the TAMPERED payload (decision flipped) but keep the
    // ORIGINAL signature. HMAC over the tampered payload won't match.
    const tampered = { ...payload, decision: "FAIL" };
    writeRawFile(sessionDir, "momus-plan-review-tampered.md",
      `<!-- SISYPHUS_GATE ${JSON.stringify(tampered)} -->\n` +
      `<!-- SISYPHUS_GATE_SIG ${JSON.stringify(sig)} -->\n`);
    const result = loadSignedVerdicts("plan", null, TEST_KEY);
    assert.equal(result.gate, null);
    assert.equal(result.valid, false);
  } finally {
    cleanup();
  }
});

test("wrong-key-rejected: verify with different MEMORY_KEY → HMAC mismatch → gate=null", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    // Sign with TEST_KEY
    writeSignedVerdict(sessionDir, "plan", { decision: "PASS", id: "abc-123" });
    // Verify with TEST_KEY_2
    const result = loadSignedVerdicts("plan", null, TEST_KEY_2);
    assert.equal(result.gate, null);
    assert.equal(result.valid, false);
  } finally {
    cleanup();
  }
});

test("null-key: MEMORY_KEY is null → gate=null for all calls", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    writeSignedVerdict(sessionDir, "plan", { decision: "PASS", id: "abc-123" });
    const result = loadSignedVerdicts("plan", null, null);
    assert.equal(result.gate, null);
    assert.equal(result.valid, false);
  } finally {
    cleanup();
  }
});

test("id-filter: currentId='abc' but verdict id='xyz' → gate=null (wrong plan)", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    writeSignedVerdict(sessionDir, "plan", { decision: "PASS", id: "xyz-999" });
    // Filter for a DIFFERENT id
    const result = loadSignedVerdicts("plan", "abc-123", TEST_KEY);
    assert.equal(result.gate, null);
    assert.equal(result.valid, false);
  } finally {
    cleanup();
  }
});

test("latest-wins: two signed verdicts (PASS then FAIL) → latest by signed_at wins → gate='FAIL'", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    // Older verdict: PASS
    writeSignedVerdict(sessionDir, "plan",
      { decision: "PASS", id: "abc-123", signed_at: "2026-06-21T10:00:00.000Z" },
      "momus-plan-review-older.md");
    // Newer verdict: FAIL
    writeSignedVerdict(sessionDir, "plan",
      { decision: "FAIL", id: "abc-123", signed_at: "2026-06-21T20:00:00.000Z" },
      "momus-plan-review-newer.md");
    const result = loadSignedVerdicts("plan", null, TEST_KEY);
    assert.equal(result.gate, "FAIL");   // latest wins
    assert.equal(result.id, "abc-123");
    assert.equal(result.valid, true);
  } finally {
    cleanup();
  }
});

test("never-throws: hostile inputs → gate=null, no throw", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    // Malformed JSON in SISYPHUS_GATE block
    writeRawFile(sessionDir, "momus-plan-review-malformed.md",
      `<!-- SISYPHUS_GATE {bad json} -->\n` +
      `<!-- SISYPHUS_GATE_SIG {"hmac":"abc"} -->\n`);
    // File with only SIG block (no GATE block)
    writeRawFile(sessionDir, "momus-plan-review-sig-only.md",
      `<!-- SISYPHUS_GATE_SIG {"hmac":"abc","alg":"x"} -->\n`);
    // File with valid JSON but missing required fields
    writeRawFile(sessionDir, "momus-plan-review-missing-fields.md",
      `<!-- SISYPHUS_GATE {} -->\n` +
      `<!-- SISYPHUS_GATE_SIG {"hmac":"abc","alg":"x"} -->\n`);
    // Empty file
    writeRawFile(sessionDir, "momus-plan-review-empty.md", "");

    // All of these must return empty without throwing
    let result;
    assert.doesNotThrow(() => {
      result = loadSignedVerdicts("plan", null, TEST_KEY);
    });
    assert.equal(result.gate, null);
    assert.equal(result.valid, false);
  } finally {
    cleanup();
  }
});

// ─── Defensive edge cases ───────────────────────────────────────────────────

test("prd-kind: signed PRD verdict loads correctly", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    writeSignedVerdict(sessionDir, "prd", { decision: "PASS", id: "prd-001" });
    const result = loadSignedVerdicts("prd", null, TEST_KEY);
    assert.equal(result.gate, "PASS");
    assert.equal(result.id, "prd-001");
  } finally {
    cleanup();
  }
});

test("kind-isolation: plan verdict does not affect prd scan and vice versa", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    writeSignedVerdict(sessionDir, "plan", { decision: "PASS", id: "plan-1" });
    // No PRD verdict → prd scan returns empty
    const planResult = loadSignedVerdicts("plan", null, TEST_KEY);
    const prdResult = loadSignedVerdicts("prd", null, TEST_KEY);
    assert.equal(planResult.gate, "PASS");
    assert.equal(prdResult.gate, null);
    assert.equal(prdResult.valid, false);
  } finally {
    cleanup();
  }
});

test("undefined-key: memoryKey is undefined → gate=null (same as null)", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    writeSignedVerdict(sessionDir, "plan", { decision: "PASS", id: "abc-123" });
    const result = loadSignedVerdicts("plan", null, undefined);
    assert.equal(result.gate, null);
    assert.equal(result.valid, false);
  } finally {
    cleanup();
  }
});

test("empty-string-key: memoryKey is '' → gate=null (same as null)", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    writeSignedVerdict(sessionDir, "plan", { decision: "PASS", id: "abc-123" });
    const result = loadSignedVerdicts("plan", null, "");
    assert.equal(result.gate, null);
    assert.equal(result.valid, false);
  } finally {
    cleanup();
  }
});

test("multiple-sessions: verdicts across session subdirs are all scanned", () => {
  // loadSignedVerdicts scans ALL subdirs of notepads/, not just one session
  const { baseDir, notepadsDir, cleanup } = setupTempNotepads();
  try {
    // Create a second session subdir with a different verdict
    const session2Dir = join(notepadsDir, "ses_other456");
    mkdirSync(session2Dir, { recursive: true });
    writeSignedVerdict(session2Dir, "plan",
      { decision: "FAIL", id: "abc-123", signed_at: "2026-06-21T22:00:00.000Z" },
      "momus-plan-review-session2.md");
    // Original session has PASS
    const session1Dir = join(notepadsDir, "ses_test123");
    writeSignedVerdict(session1Dir, "plan",
      { decision: "PASS", id: "abc-123", signed_at: "2026-06-21T10:00:00.000Z" },
      "momus-plan-review-session1.md");
    // Latest across both sessions = FAIL (from session2)
    const result = loadSignedVerdicts("plan", null, TEST_KEY);
    assert.equal(result.gate, "FAIL");
    assert.equal(result.valid, true);
    void baseDir;
  } finally {
    cleanup();
  }
});

test("id-filter-null: currentId=null accepts any id", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    writeSignedVerdict(sessionDir, "plan", { decision: "PASS", id: "any-id-here" });
    const result = loadSignedVerdicts("plan", null, TEST_KEY);
    assert.equal(result.gate, "PASS");
    assert.equal(result.id, "any-id-here");
  } finally {
    cleanup();
  }
});

test("latest-wins-pass-over-fail: FAIL then PASS → latest PASS wins", () => {
  const { sessionDir, cleanup } = setupTempNotepads();
  try {
    // Older: FAIL
    writeSignedVerdict(sessionDir, "plan",
      { decision: "FAIL", id: "abc-123", signed_at: "2026-06-21T10:00:00.000Z" },
      "momus-plan-review-older-fail.md");
    // Newer: PASS
    writeSignedVerdict(sessionDir, "plan",
      { decision: "PASS", id: "abc-123", signed_at: "2026-06-21T20:00:00.000Z" },
      "momus-plan-review-newer-pass.md");
    const result = loadSignedVerdicts("plan", null, TEST_KEY);
    assert.equal(result.gate, "PASS");   // latest (PASS) wins
  } finally {
    cleanup();
  }
});
