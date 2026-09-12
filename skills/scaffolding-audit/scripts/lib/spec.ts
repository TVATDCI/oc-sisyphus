/**
 * Vendored-spec loader + audit-time hash-identity check (OPEN-1 ruling).
 *
 * The shared spec (spec/spec-shared.md) is the single vocabulary + manifest-schema
 * authority for both landings. The deterministic rule table is embedded in it as the
 * JSON block following the `<!-- sca-rule-table-v1 -->` marker; this module extracts
 * and validates it. Both landings parse the same table — classification divergence
 * is impossible by construction (AC-13).
 */

import { createHash } from "node:crypto";

export const RULE_TABLE_MARKER = "<!-- sca-rule-table-v1 -->";

export type RuleWhere = "comment" | "any";

export type ScanRule = {
  id: string;
  class: 1 | 2 | 3 | 4 | 5;
  pattern: string;
  flags: string;
  where: RuleWhere;
  excludeLine?: string;
  excludeLineFlags?: string;
  datedIfBefore?: boolean;
  action: string;
};

export type RuleTable = {
  version: number;
  rules: ScanRule[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isClass(value: unknown): value is ScanRule["class"] {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
  );
}

function isWhere(value: unknown): value is RuleWhere {
  return value === "comment" || value === "any";
}

function parseRule(raw: unknown): ScanRule | undefined {
  if (!isRecord(raw)) return undefined;
  const id = asString(raw["id"]);
  const pattern = asString(raw["pattern"]);
  const flags = asString(raw["flags"]) ?? "";
  const where = raw["where"];
  const action = asString(raw["action"]);
  const ruleClass = raw["class"];
  if (
    id === undefined || pattern === undefined || action === undefined ||
    !isClass(ruleClass) || !isWhere(where)
  ) {
    return undefined;
  }
  const rule: ScanRule = { id, class: ruleClass, pattern, flags, where, action };
  const excludeLine = asString(raw["exclude-line"]);
  if (excludeLine !== undefined) {
    rule.excludeLine = excludeLine;
    rule.excludeLineFlags = asString(raw["exclude-line-flags"]) ?? "";
  }
  if (raw["dated-if-before"] === true) rule.datedIfBefore = true;
  return rule;
}

export function parseRuleTable(specText: string): RuleTable {
  const markerAt = specText.indexOf(RULE_TABLE_MARKER);
  if (markerAt < 0) {
    throw new Error("vendored spec: rule-table marker not found");
  }
  const afterMarker = specText.slice(markerAt + RULE_TABLE_MARKER.length);
  const fenceOpen = afterMarker.indexOf("```json");
  if (fenceOpen < 0) {
    throw new Error("vendored spec: no ```json fence after rule-table marker");
  }
  const bodyStart = fenceOpen + "```json".length;
  const fenceClose = afterMarker.indexOf("```", bodyStart);
  if (fenceClose < 0) {
    throw new Error("vendored spec: unterminated rule-table fence");
  }
  const jsonText = afterMarker.slice(bodyStart, fenceClose);
  const parsed: unknown = JSON.parse(jsonText);
  if (!isRecord(parsed) || !Array.isArray(parsed["rules"])) {
    throw new Error("vendored spec: rule table is not { version, rules[] }");
  }
  const version = parsed["version"];
  if (typeof version !== "number") {
    throw new Error("vendored spec: rule table version missing");
  }
  const rules: ScanRule[] = [];
  for (const raw of parsed["rules"]) {
    const rule = parseRule(raw);
    if (rule === undefined) {
      throw new Error("vendored spec: malformed rule entry");
    }
    // Compile eagerly so a bad pattern fails at load, not mid-scan.
    new RegExp(rule.pattern, rule.flags);
    rules.push(rule);
  }
  return { version, rules };
}

/** sha256 hex digest of the vendored spec — the OPEN-1 hash-identity anchor. */
export function specSha256(specText: string): string {
  return createHash("sha256").update(specText, "utf8").digest("hex");
}

/**
 * Audit-time hash-identity check (spec §0): both vendored copies must hash
 * identically when both are reachable. Returns the comparison result; the caller
 * decides the hard-stop report per the spec.
 */
export function hashIdentity(
  piSpecText: string,
  twinSpecText: string | undefined,
): { self: string; twin: string | undefined; identical: boolean } {
  const self = specSha256(piSpecText);
  if (twinSpecText === undefined) {
    return { self, twin: undefined, identical: true };
  }
  const twin = specSha256(twinSpecText);
  return { self, twin, identical: self === twin };
}
