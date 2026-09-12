/**
 * Drift-check core (shared spec §4) — manifest comparison, pure.
 *
 * Inputs: exactly two — the recorded manifest text (or undefined = missing)
 * and the current model-state extracted from the model-binding source of
 * truth. Output: the single reminder flag, or silence. Missing manifest →
 * the same flag (never audited; no auto-rebuild). Unreadable manifest →
 * explicit DriftManifestError. No filesystem access from this module —
 * callers own the bounded read (INV-2).
 */

export const DRIFT_FLAG =
  "routing state drifted since last audit — run scaffolding-audit";

export class DriftManifestError extends Error {
  constructor(reason: string) {
    super(`manifest unreadable: ${reason}`);
    this.name = "DriftManifestError";
  }
}

export type DriftOutcome = "stale" | "fresh" | "missing";

export type DriftResult = { outcome: DriftOutcome; output: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Canonical string form: keys sorted recursively — shape-stable comparison. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    const body = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function checkDrift(
  manifestText: string | undefined,
  currentState: unknown,
): DriftResult {
  if (manifestText === undefined) {
    return { outcome: "missing", output: DRIFT_FLAG };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown parse error";
    throw new DriftManifestError(reason);
  }
  if (!isRecord(parsed) || !isRecord(parsed["model-state"])) {
    throw new DriftManifestError("model-state object missing or malformed");
  }
  const recorded = stableStringify(parsed["model-state"]);
  const current = stableStringify(currentState);
  return recorded === current
    ? { outcome: "fresh", output: "" }
    : { outcome: "stale", output: DRIFT_FLAG };
}
