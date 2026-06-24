/**
 * test/verdict-signing.test.js — tests for src/verdict-signing.js (P0b Step 2).
 *
 * Covers the 11 spec criteria plus defensive edge cases for the security
 * invariants (verifyVerdict never throws, signVerdict returns correct shape,
 * timingSafeEqual path rejects length-mismatched hmacs).
 *
 * Test fixtures use a fixed memoryKey ("test-key-do-not-use-in-prod") and
 * fixed payloads. Determinism is verified by signing the same payload twice
 * and asserting identical output.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJSON,
  signVerdict,
  verifyVerdict,
  SIGNING_ALG,
} from "../src/verdict-signing.js";

const TEST_KEY = "test-key-do-not-use-in-prod";
const TEST_KEY_2 = "different-test-key";

function samplePayload(overrides = {}) {
  return {
    kind: "plan",
    decision: "PASS",
    id: "abc-123",
    schema_version: "2.0.0",
    signed_at: "2026-06-21T19:50:00.000Z",
    sessionID: "ses_test123",
    operator: "primary",
    ...overrides,
  };
}

// ─── canonicalJSON — spec criteria ──────────────────────────────────────────

test("canonicalJSON-basic: { b: 1, a: 2 } → sorted keys", () => {
  assert.equal(canonicalJSON({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test("canonicalJSON-nested: { z: { b: 1, a: 2 } } → recursive sort", () => {
  assert.equal(canonicalJSON({ z: { b: 1, a: 2 } }), '{"z":{"a":2,"b":1}}');
});

test("canonicalJSON-array: { b: [3, 1, 2] } → array order PRESERVED (not sorted)", () => {
  assert.equal(canonicalJSON({ b: [3, 1, 2] }), '{"b":[3,1,2]}');
});

test("canonicalJSON-determinism: same input twice → identical output", () => {
  const p = samplePayload();
  // Construct two objects with keys in DIFFERENT insertion order to verify
  // that sort normalizes the output regardless of insertion order.
  const objA = { kind: "plan", decision: "PASS", id: "abc-123" };
  const objB = { id: "abc-123", decision: "PASS", kind: "plan" };
  assert.equal(canonicalJSON(objA), canonicalJSON(objB));
  // Also: calling canonicalJSON twice on the same object is stable
  assert.equal(canonicalJSON(p), canonicalJSON(p));
});

// ─── canonicalJSON — defensive edge cases ───────────────────────────────────

test("canonicalJSON-null → 'null'", () => {
  assert.equal(canonicalJSON(null), "null");
});

test("canonicalJSON-boolean: true → 'true', false → 'false'", () => {
  assert.equal(canonicalJSON(true), "true");
  assert.equal(canonicalJSON(false), "false");
});

test("canonicalJSON-string: quotes + escaping (JSON.stringify)", () => {
  assert.equal(canonicalJSON("hello"), '"hello"');
  assert.equal(canonicalJSON('a"b'), '"a\\"b"');
  assert.equal(canonicalJSON("a\nb"), '"a\\nb"');
});

test("canonicalJSON-empty-object → '{}'", () => {
  assert.equal(canonicalJSON({}), "{}");
});

test("canonicalJSON-empty-array → '[]'", () => {
  assert.equal(canonicalJSON([]), "[]");
});

test("canonicalJSON-skips-undefined: { a: 1, b: undefined } → '{\"a\":1}'", () => {
  // Object keys with undefined values are SKIPPED (not serialized as null)
  assert.equal(canonicalJSON({ a: 1, b: undefined }), '{"a":1}');
  // Functions and symbols are also skipped
  assert.equal(
    canonicalJSON({ a: 1, b: () => {}, c: Symbol("x") }),
    '{"a":1}'
  );
});

// ─── signVerdict — spec criteria ────────────────────────────────────────────

test("sign-verify-roundtrip: sign then verify → true", () => {
  const payload = samplePayload();
  const sig = signVerdict(payload, TEST_KEY);
  assert.equal(verifyVerdict(payload, sig, TEST_KEY), true);
});

test("verify-tampered-payload: change payload.decision after signing → false", () => {
  const payload = samplePayload();
  const sig = signVerdict(payload, TEST_KEY);
  // Tamper: flip decision
  const tampered = { ...payload, decision: "FAIL" };
  assert.equal(verifyVerdict(tampered, sig, TEST_KEY), false);
});

test("verify-wrong-key: verify with different key → false", () => {
  const payload = samplePayload();
  const sig = signVerdict(payload, TEST_KEY);
  assert.equal(verifyVerdict(payload, sig, TEST_KEY_2), false);
});

test("verify-null-key: verify with null key → false (signing disabled)", () => {
  const payload = samplePayload();
  const sig = signVerdict(payload, TEST_KEY);
  assert.equal(verifyVerdict(payload, sig, null), false);
  // Also undefined and empty string
  assert.equal(verifyVerdict(payload, sig, undefined), false);
  assert.equal(verifyVerdict(payload, sig, ""), false);
});

test("verify-missing-sig: verify with null/undefined sigBlock → false", () => {
  const payload = samplePayload();
  assert.equal(verifyVerdict(payload, null, TEST_KEY), false);
  assert.equal(verifyVerdict(payload, undefined, TEST_KEY), false);
});

test("verify-wrong-alg: sigBlock.alg = 'old-algorithm' → false", () => {
  const payload = samplePayload();
  const sig = signVerdict(payload, TEST_KEY);
  const wrongAlg = { ...sig, alg: "old-algorithm" };
  assert.equal(verifyVerdict(payload, wrongAlg, TEST_KEY), false);
});

// ─── verifyVerdict — defensive edge cases (never throws) ────────────────────

test("verify-never-throws: hostile inputs → false, no throw", () => {
  const payload = samplePayload();
  const goodSig = signVerdict(payload, TEST_KEY);
  const hostile = [
    // hostile sigBlocks
    null,
    undefined,
    123,
    "string-not-object",
    {},
    { hmac: "abc" },           // missing alg
    { alg: SIGNING_ALG },      // missing hmac
    { alg: SIGNING_ALG, hmac: 123 }, // non-string hmac
    { alg: SIGNING_ALG, hmac: "" },  // empty hmac
    { alg: SIGNING_ALG, hmac: "not-hex-at-all!!" }, // non-hex hmac
    { alg: SIGNING_ALG, hmac: "deadbeef" }, // wrong length (too short)
    { alg: SIGNING_ALG, hmac: "x".repeat(64) }, // right length, wrong content
    { alg: SIGNING_ALG, hmac: goodSig.hmac + "ff" }, // too long
    // hostile payloads (paired with good sig — should still fail to verify)
    null,
    undefined,
    123,
    "string",
  ];
  for (const h of hostile) {
    let result;
    assert.doesNotThrow(() => {
      result = verifyVerdict(payload, h, TEST_KEY);
    }, `verifyVerdict threw on sigBlock: ${JSON.stringify(h)}`);
    assert.equal(result, false,
      `verifyVerdict returned non-false on hostile sigBlock: ${JSON.stringify(h)}`);
  }
  // Also: hostile payloads with a good sig
  for (const hp of [null, undefined, 123, "string", [], {}]) {
    let result;
    assert.doesNotThrow(() => {
      result = verifyVerdict(hp, goodSig, TEST_KEY);
    }, `verifyVerdict threw on payload: ${JSON.stringify(hp)}`);
    // null/undefined payloads produce different canonical than the signed one
    // → false. We only assert "does not throw" here; the exact result depends
    // on canonicalization, but none of these should match.
    assert.equal(result, false,
      `hostile payload unexpectedly verified: ${JSON.stringify(hp)}`);
  }
});

// ─── signVerdict — structure verification ───────────────────────────────────

test("signVerdict-returns-correct-structure: all 4 SigBlock fields present", () => {
  const payload = samplePayload();
  const sig = signVerdict(payload, TEST_KEY);
  // SigBlock shape: { hmac, alg, key_id, signed_at }
  assert.equal(typeof sig.hmac, "string");
  assert.equal(sig.hmac.length, 64); // SHA-256 hex = 64 chars
  assert.equal(sig.alg, "HMAC-SHA256-stableJSON-v1");
  assert.equal(sig.key_id, "op-keyring");
  assert.equal(typeof sig.signed_at, "string");
  // signed_at is ISO 8601 (parses without throwing)
  assert.doesNotThrow(() => new Date(sig.signed_at).toISOString());
});

test("signVerdict-deterministic: same payload + key → same hmac", () => {
  // Fixed signed_at so payload is identical (otherwise timestamp differs)
  const p = samplePayload({ signed_at: "2026-06-21T19:50:00.000Z" });
  const sig1 = signVerdict(p, TEST_KEY);
  const sig2 = signVerdict(p, TEST_KEY);
  assert.equal(sig1.hmac, sig2.hmac);
});

test("signVerdict-key-sensitivity: different keys → different hmacs", () => {
  const p = samplePayload({ signed_at: "2026-06-21T19:50:00.000Z" });
  const sig1 = signVerdict(p, TEST_KEY);
  const sig2 = signVerdict(p, TEST_KEY_2);
  assert.notEqual(sig1.hmac, sig2.hmac);
});

// ─── Cross-cutting: full roundtrip with realistic payload shapes ────────────

test("roundtrip-prd-payload: PRD verdict sign + verify", () => {
  const payload = samplePayload({
    kind: "prd",
    id: "prd-001",
    decision: "PASS",
  });
  const sig = signVerdict(payload, TEST_KEY);
  assert.equal(verifyVerdict(payload, sig, TEST_KEY), true);
});

test("roundtrip-fail-verdict: FAIL decision sign + verify", () => {
  const payload = samplePayload({ decision: "FAIL" });
  const sig = signVerdict(payload, TEST_KEY);
  assert.equal(verifyVerdict(payload, sig, TEST_KEY), true);
  // FAIL verdicts are validly signed (audit trail) — they just don't advance
});

test("roundtrip-warn-verdict: WARN decision sign + verify", () => {
  const payload = samplePayload({ decision: "WARN" });
  const sig = signVerdict(payload, TEST_KEY);
  assert.equal(verifyVerdict(payload, sig, TEST_KEY), true);
});
