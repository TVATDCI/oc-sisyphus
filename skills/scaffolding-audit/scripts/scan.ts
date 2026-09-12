/**
 * Deterministic scan entry point — sis twin (Task 2.1; divergence-test anchor).
 *
 * Read-only: run under `deno run --allow-read` (full-scope, first run) or
 * `deno run --allow-read --allow-run=git` (diff-scope / anchored doctrine diff).
 * Scope mode is REQUIRED and invocation-selected — never auto-detected (AC-8).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { parseRuleTable } from "./lib/spec.ts";
import type { ManifestAnchor } from "./lib/scan-core.ts";
import { runScan, renderReport } from "./lib/scan-core.ts";
import { sisSurfaces, enumerateSkillDirs } from "./lib/surfaces.ts";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const SKILL_DIR = join(SCRIPT_DIR, "..");
const CONFIG_ROOT = join(SKILL_DIR, "..", "..");
const SPEC_SELF = join(SKILL_DIR, "spec", "spec-shared.md");
const SPEC_TWIN = join(
  CONFIG_ROOT,
  "..",
  "..",
  ".pi",
  "agent",
  "skills",
  "scaffolding-audit",
  "spec",
  "spec-shared.md",
);
const MANIFEST_PATH = join(SKILL_DIR, "state", "manifest.json");

function usage(): never {
  console.error(
    "usage: scan.ts --scope=full | --scope=diff\n" +
      "  --scope is REQUIRED and invocation-selected — this tool never auto-detects a mode.",
  );
  process.exit(2);
}

function parseScope(argv: string[]): "full" | "diff" | undefined {
  let scope: "full" | "diff" | undefined;
  for (const arg of argv) {
    if (arg === "--scope=full") scope = "full";
    else if (arg === "--scope=diff") scope = "diff";
    else if (arg === "--scope" || arg.startsWith("--scope=")) usage();
    else {
      console.error(`unknown argument: ${arg}`);
      usage();
    }
  }
  return scope;
}

function readIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function readAnchor(): ManifestAnchor {
  const text = readIfExists(MANIFEST_PATH);
  if (text === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error(`manifest unreadable: ${MANIFEST_PATH} does not parse`);
    process.exit(1);
  }
  if (
    typeof parsed === "object" && parsed !== null &&
    "last-audit-commit" in parsed
  ) {
    const anchor = (parsed as { "last-audit-commit": unknown })[
      "last-audit-commit"
    ];
    if (
      typeof anchor === "object" && anchor !== null &&
      !Array.isArray(anchor)
    ) {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(anchor)) {
        if (typeof v === "string") clean[k] = v;
      }
      return { lastAuditCommit: clean };
    }
  }
  return {};
}

function main(): void {
  const scope = parseScope(process.argv.slice(2));
  if (scope === undefined) usage();

  const specText = readFileSync(SPEC_SELF, "utf8");
  const table = parseRuleTable(specText);
  const twinText = readIfExists(SPEC_TWIN);
  const anchor = readAnchor();
  if (scope === "diff" && anchor.lastAuditCommit === undefined) {
    console.error(
      "diff-scope requires a manifest anchor — none on record (never audited).",
    );
    console.error("Run --scope=full and record via scripts/manifest.ts first.");
    process.exit(2);
  }

  const result = runScan(
    CONFIG_ROOT,
    scope,
    table,
    specText,
    twinText,
    sisSurfaces(CONFIG_ROOT),
    anchor,
    (p) => readFileSync(p, "utf8"),
    enumerateSkillDirs(CONFIG_ROOT),
  );
  process.stdout.write(renderReport(result));
  if (!result.hashIdentical) process.exit(3);
}

main();
