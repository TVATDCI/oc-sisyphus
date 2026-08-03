/**
 * verdict-parser.js — structured verdict block parser for sisyphus-gates.
 *
 * W1.B: replaces the brittle string-match gate detection (which triggered on
 * `content.includes("Gate Decision:** PASS")` and had false positives /
 * negatives) with a parser that understands a structured HTML comment block:
 *
 *   <!-- SISYPHUS_GATE {"kind": "prd", "decision": "PASS", "blockers": [],
 *                       "schema_version": "1.0.0",
 *                       "timestamp": "2026-06-05T22:00:00.000Z",
 *                       "reviewer": "momus-prd-reviewer"} -->
 *   **Gate Decision:** PASS
 *
 * The parser is tolerant of whitespace variations in the comment markers
 * (`<!--SISYPHUS_GATE ...-->`, `<!--  SISYPHUS_GATE  ...  -->`). It does NOT
 * throw on malformed JSON — it collects errors and returns empty/invalid
 * entries. The last verdict of a given kind wins (last write wins).
 *
 * @typedef {Object} Verdict
 * @property {"prd" | "plan"} kind
 * @property {"PASS" | "FAIL" | "WARN"} decision
 * @property {string[]} blockers
 * @property {string} schema_version
 * @property {string} timestamp
 * @property {string} reviewer
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} errors
 */

/** The schema_version this parser understands as the current contract. */
export const SUPPORTED_SCHEMA_VERSION = "2.0.0";

/**
 * Compare two dotted version strings (e.g. "1.0.0", "2.0.0", "10.2.3")
 * numerically by component. Returns true iff `ver` is strictly newer than
 * `base`. Replaces the previous lexicographic string `>` comparison, which
 * incorrectly classified "10.0.0" as not-newer-than "2.0.0" (because
 * '1' < '2' at index 0).
 *
 * @param {string} ver
 * @param {string} base
 * @returns {boolean}
 */
function isNewerVersion(ver, base) {
  const a = String(ver).split(".").map((n) => Number(n) || 0);
  const b = String(base).split(".").map((n) => Number(n) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}

/**
 * Find all SISYPHUS_GATE HTML comment blocks in `content` and parse them
 * into Verdict objects.
 *
 * @param {string} content
 * @returns {Verdict[]} verdicts in document order; empty array if none found
 */
export function parseVerdictBlocks(content) {
  if (typeof content !== "string" || content.length === 0) return [];

  // Regex breakdown:
  //   <!--\s*           : opening "<!--" with optional whitespace
  //   SISYPHUS_GATE\s+  : literal token, then at least one whitespace
  //   (\{[\s\S]*?\})    : the JSON payload (non-greedy, captures braces)
  //   \s*-->\s*         : closing "-->" with optional whitespace
  // We deliberately do not anchor the start to `<!--` followed by NO
  // characters — we accept `<!--SISYPHUS_GATE ...` as well as
  // `<!-- SISYPHUS_GATE ...`.
  const blockRegex = /<!--\s*SISYPHUS_GATE\s+(\{[\s\S]*?\})\s*-->/g;

  const verdicts = [];
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const jsonText = match[1];
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      // Malformed JSON: do NOT throw. We return no verdict for this block.
      // Errors are surfaced via validateVerdict when the caller inspects
      // the structure. We log to stderr for forensic visibility.
      console.warn(
        `[sisyphus-gates] verdict-parser: malformed JSON in SISYPHUS_GATE block: ${err.message}`
      );
      continue;
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      // JSON parsed to a non-object (e.g. "null", "42", "[]"). Skip.
      console.warn(
        "[sisyphus-gates] verdict-parser: SISYPHUS_GATE block did not parse to an object"
      );
      continue;
    }

    // Normalize: ensure blockers is always an array of strings.
    const blockers = Array.isArray(parsed.blockers)
      ? parsed.blockers.map((b) => String(b))
      : [];

    verdicts.push({
      kind: typeof parsed.kind === "string" ? parsed.kind : undefined,
      decision: typeof parsed.decision === "string" ? parsed.decision : undefined,
      blockers,
      schema_version:
        typeof parsed.schema_version === "string" ? parsed.schema_version : undefined,
      // v1 field, with v2 alias fallback (signed_at -> timestamp) so v1-only
      // callers continue to work on v2 payloads.
      timestamp:
        typeof parsed.timestamp === "string"
          ? parsed.timestamp
          : typeof parsed.signed_at === "string"
            ? parsed.signed_at
            : undefined,
      // v1 field, with v2 alias fallback (operator -> reviewer). NOTE: this
      // alias is semantically lossy — see bd memory key reason:schema_alias_reviewer.
      reviewer:
        typeof parsed.reviewer === "string"
          ? parsed.reviewer
          : typeof parsed.operator === "string"
            ? parsed.operator
            : undefined,
      // v2 pass-through fields (additive; ignored by v1 callers, available
      // to v2-aware callers such as id-scoped gate checks).
      id: typeof parsed.id === "string" ? parsed.id : undefined,
      sessionID: typeof parsed.sessionID === "string" ? parsed.sessionID : undefined,
      signed_at: typeof parsed.signed_at === "string" ? parsed.signed_at : undefined,
      operator: typeof parsed.operator === "string" ? parsed.operator : undefined,
    });
  }

  return verdicts;
}

/**
 * Return the most recent verdict of the given `kind` from `content`.
 * "Most recent" = last one in document order (last write wins).
 *
 * @param {string} content
 * @param {"prd" | "plan"} kind
 * @returns {Verdict | null}
 */
export function getLatestVerdict(content, kind) {
  const verdicts = parseVerdictBlocks(content);
  let latest = null;
  for (const v of verdicts) {
    if (v.kind === kind) latest = v;
  }
  return latest;
}

/**
 * Validate a parsed Verdict object. Checks that all required fields are
 * present and of the right type, and that schema_version is supported.
 *
 * @param {Verdict} verdict
 * @returns {ValidationResult}
 */
export function validateVerdict(verdict) {
  const errors = [];
  if (!verdict || typeof verdict !== "object") {
    return { valid: false, errors: ["verdict is not an object"] };
  }

  if (verdict.kind !== "prd" && verdict.kind !== "plan") {
    errors.push(`kind must be "prd" or "plan" (got: ${JSON.stringify(verdict.kind)})`);
  }

  if (
    verdict.decision !== "PASS" &&
    verdict.decision !== "FAIL" &&
    verdict.decision !== "WARN"
  ) {
    errors.push(
      `decision must be "PASS", "FAIL", or "WARN" (got: ${JSON.stringify(verdict.decision)})`
    );
  }

  if (!Array.isArray(verdict.blockers)) {
    errors.push("blockers must be an array");
  }

  if (typeof verdict.schema_version !== "string") {
    errors.push("schema_version must be a string");
  } else if (isNewerVersion(verdict.schema_version, SUPPORTED_SCHEMA_VERSION)) {
    errors.push(
      `schema_version ${verdict.schema_version} is newer than supported ${SUPPORTED_SCHEMA_VERSION}`
    );
  }

  if (typeof verdict.timestamp !== "string") {
    errors.push("timestamp must be a string");
  }

  if (typeof verdict.reviewer !== "string") {
    errors.push("reviewer must be a string");
  }

  return { valid: errors.length === 0, errors };
}

// ─── Internal: allow tests to introspect internals if needed ───────────────

export const _internal = {
  SUPPORTED_SCHEMA_VERSION,
};
