/**
 * verdict-signing.js — canonical JSON + HMAC signing + verification.
 *
 * P0b Step 2: foundation for all signed verdict artifacts. Used by the
 * /sign-verdict command handler (Step 5) to create tamper-evident verdict
 * files, and by loadSignedVerdicts (Step 4) to verify them on hydration.
 *
 * ─── canonicalJSON — algorithm decision ───────────────────────────────────
 *
 * Uses a stable hand-rolled canonicalization (Option B), NOT an npm library
 * (e.g., rfc8785 / canonicalize). Reasoning:
 *   - Zero supply-chain risk: no new dependency for security-critical code.
 *   - Determinism is what matters, not RFC 8785 compliance per se. Both
 *     signer and verifier use the SAME function — the output is
 *     deterministic by construction.
 *   - Transparent: fully auditable, ~30 lines.
 *   - Versioned: algorithm ID is "stableJSON-v1". If the algorithm changes,
 *     the version bumps ("stableJSON-v2") and old signatures are rejected
 *     by verifyVerdict (alg mismatch → false). This prevents a silent
 *     invalidation where a code update changes canonicalization and all
 *     existing verdicts silently break.
 *
 * NOT RFC 8785 differences (documented, acceptable because signer+verifier
 * use the same function):
 *   - Number formatting: uses JS JSON.stringify defaults, not RFC 8785's
 *     shortest-representation rules (§3.2.2). For our payload types
 *     (integers in schema_version, ISO strings, enums), this never differs.
 *   - Key ordering: Object.keys().sort() is UTF-16 code unit order, which
 *     matches RFC 8785 §3.2.3 for the ASCII-only keys we use.
 *
 * ─── Security invariants ─────────────────────────────────────────────────
 *
 * 1. canonicalJSON is deterministic: same input → same output, across
 *    Node.js versions (depends only on Object.keys insertion order being
 *    normalized by the explicit .sort()).
 * 2. signVerdict never persists or logs the key. The key is passed in,
 *    used for HMAC, and discarded. It never leaves this function's scope.
 * 3. verifyVerdict NEVER THROWS. All error paths (bad sigBlock, bad key,
 *    tampered payload, malformed hmac) return false. A verification
 *    failure must not crash the plugin — it just means "unsigned/rejected."
 * 4. HMAC comparison uses crypto.timingSafeEqual, NOT ===. This prevents
 *    timing attacks on the HMAC comparison (an attacker measuring response
 *    time to recover the expected hmac byte-by-byte).
 * 5. Algorithm version is embedded in SigBlock.alg. Future algorithm
 *    changes bump the version → old signatures rejected (fail-closed).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const ALG = "HMAC-SHA256-stableJSON-v1";

/**
 * Deterministic JSON serialization with sorted keys and no whitespace.
 *
 * Rules (per spec):
 *   - null → "null"
 *   - boolean → "true" | "false"
 *   - number → JSON.stringify (JS native number formatting)
 *   - string → JSON.stringify (quotes + escaping)
 *   - array → "[" + elements(canonicalJSON).join(",") + "]" (ORDER PRESERVED)
 *   - object → keys sorted via .sort(); undefined/function/symbol values
 *     cause the key to be SKIPPED entirely (not serialized as null)
 *   - In arrays, undefined/function/symbol elements → "null" (matches
 *     JSON.stringify semantics; preserves array indices)
 *
 * @param {*} obj - JSON-serializable value.
 * @returns {string} Canonical JSON string. Never returns undefined for
 *   top-level calls on serializable input; function/symbol at top level
 *   (shouldn't happen for our payloads) returns "null".
 */
export function canonicalJSON(obj) {
  if (obj === null) return "null";
  const t = typeof obj;
  if (t === "boolean") return obj ? "true" : "false";
  if (t === "number") return JSON.stringify(obj);
  if (t === "string") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    const parts = obj.map((el) => {
      const et = typeof el;
      // Match JSON.stringify: undefined/function/symbol → null in arrays
      if (el === undefined || et === "function" || et === "symbol") return "null";
      return canonicalJSON(el);
    });
    return "[" + parts.join(",") + "]";
  }
  if (t === "object") {
    const keys = Object.keys(obj).sort();
    const parts = [];
    for (const k of keys) {
      const v = obj[k];
      const vt = typeof v;
      // Skip keys with undefined/function/symbol values (not serialized)
      if (v === undefined || vt === "function" || vt === "symbol") continue;
      parts.push(JSON.stringify(k) + ":" + canonicalJSON(v));
    }
    return "{" + parts.join(",") + "}";
  }
  // function or symbol at top level — shouldn't happen for valid payloads.
  // Return "null" rather than throw (JSON.stringify does the same).
  return "null";
}

/**
 * Sign a verdict payload with HMAC-SHA256.
 *
 * @param {object} payload - VerdictPayload (kind, decision, id,
 *   schema_version, signed_at, sessionID, operator). Caller is responsible
 *   for constructing the payload; this function canonicalizes + signs.
 * @param {string} memoryKey - Non-empty HMAC key from operator keyring.
 *   PRECONDITION: caller validates non-empty (Step 1 resolveMemoryKey
 *   returns null on failure; Step 5 handler checks for null before calling).
 * @returns {{hmac: string, alg: string, key_id: string, signed_at: string}}
 *   SigBlock. The caller writes payload + SigBlock to the verdict file.
 */
export function signVerdict(payload, memoryKey) {
  const canonical = canonicalJSON(payload);
  const hmac = createHmac("sha256", memoryKey).update(canonical).digest("hex");
  return {
    hmac,
    alg: ALG,
    key_id: "op-keyring",
    signed_at: new Date().toISOString(),
  };
}

/**
 * Verify a verdict payload against its SigBlock.
 *
 * NEVER THROWS. All error paths return false. A false return means
 * "unsigned, tampered, wrong key, or algorithm mismatch" — caller treats
 * all of these as "reject this verdict."
 *
 * @param {object} payload - VerdictPayload to verify.
 * @param {*} sigBlock - SigBlock (or hostile value) from the verdict file.
 * @param {*} memoryKey - HMAC key (or null/undefined if signing disabled).
 * @returns {boolean} true iff HMAC matches and algorithm is current.
 */
export function verifyVerdict(payload, sigBlock, memoryKey) {
  try {
    // 1. sigBlock must be an object
    if (!sigBlock || typeof sigBlock !== "object") return false;
    // 2. Algorithm must match current version (rejects old/mismatched)
    if (sigBlock.alg !== ALG) return false;
    // 3. hmac must be a non-empty string
    if (typeof sigBlock.hmac !== "string" || sigBlock.hmac.length === 0) return false;
    // 4. memoryKey must be present (signing disabled → nothing verifies)
    if (!memoryKey || typeof memoryKey !== "string") return false;

    // 5-6. Recompute HMAC over canonical payload
    const canonical = canonicalJSON(payload);
    const recomputed = createHmac("sha256", memoryKey).update(canonical).digest("hex");
    const recomputedBuf = Buffer.from(recomputed, "hex");
    const sigBuf = Buffer.from(sigBlock.hmac, "hex");

    // 7. timingSafeEqual requires equal-length buffers. SHA-256 hex is
    // always 64 chars (32 bytes), but attacker-controlled sigBlock.hmac
    // may be malformed → Buffer.from("hex") truncates at first non-hex
    // char → length mismatch → false (not a throw).
    if (recomputedBuf.length !== sigBuf.length) return false;
    return timingSafeEqual(recomputedBuf, sigBuf);
  } catch {
    // ANY unexpected error → reject. No throw escapes verifyVerdict.
    return false;
  }
}

/** Exposed for tests / version checks. Do NOT mutate. */
export const SIGNING_ALG = ALG;
