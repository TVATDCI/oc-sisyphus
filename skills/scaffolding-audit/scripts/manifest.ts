/**
 * Manifest CLI (sis) — the EXPLICIT non-dry audit run.
 *
 * INV-1 exception (a): the writeFileSync below is the skill's ONLY write —
 * its own state-dir manifest (DESK-SUFFIXED, hostname-resolved:
 * state/manifest.<ddd|tnt>.json, ruling 2026-10-28), on this explicit
 * non-dry invocation only. Never at session start; superseded by each new
 * audit; no cleanup job. Each desk commits ONLY its own suffixed file —
 * pulls never conflict. The one-time legacy-seed migration (below) is the
 * same write class; the legacy shared manifest.json is never deleted here.
 *
 * Invocation: deno run --allow-read --allow-run=git --allow-env \
 *   --allow-write=<skill-dir>/state scripts/manifest.ts --scope=full
 *
 * BUILD #14 rider — idempotence guard: a run whose extracted state
 * (model-state + finding-hashes) is unchanged from the prior manifest is a
 * NO-OP (nothing written). Before the guard, `recorded-at` +
 * `last-audit-commit` churned on every run, so a second run always produced
 * a self-reference diff (commit-loop bait). Trade-off, accepted: when only
 * non-routing commits land, the anchor is intentionally NOT advanced — the
 * no-op notice makes that visible, and the next real state change
 * re-records with a fresh anchor.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { parseRuleTable } from "./lib/spec.ts";
import { runScan, renderReport } from "./lib/scan-core.ts";
import type { ManifestAnchor } from "./lib/scan-core.ts";
import { sisSurfaces, enumerateSkillDirs } from "./lib/surfaces.ts";
import { extractModelState, resolveOmoSource } from "./lib/model-state.ts";
import { resolveManifestPaths, seedSuffixedFromLegacy } from "./lib/manifest-path.ts";

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
const STATE_DIR = join(SKILL_DIR, "state");
// Desk-suffixed manifest (captain ruling 2026-10-28): hostname-resolved
// like the omo variant (one hostname mechanism); the legacy shared
// manifest.json seeds it one-time and stays in place, inert.
const MANIFEST_PATHS = resolveManifestPaths(STATE_DIR);
const MANIFEST_PATH = MANIFEST_PATHS.activePath;
// Binding source: the hostname-resolved per-desk REPO VARIANT at the config
// root (omo-retire 2026-10-22; was the retired ~/.omo/omo.jsonc).
const OMO_SOURCE = resolveOmoSource(CONFIG_ROOT);

function usage(): never {
  console.error(
    "usage: manifest.ts --scope=full | --scope=diff\n" +
      "  --scope is REQUIRED and invocation-selected — never auto-detected.",
  );
  process.exit(2);
}

function parseScope(argv: string[]): "full" | "diff" | undefined {
  let scope: "full" | "diff" | undefined;
  for (const arg of argv) {
    if (arg === "--scope=full") scope = "full";
    else if (arg === "--scope=diff") scope = "diff";
    else usage();
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

function headCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: CONFIG_ROOT,
    encoding: "utf8",
  }).trim();
}

/** Stable serialization for value comparison (same-producer key order). */
function stableJson(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

function main(): void {
  const scope = parseScope(process.argv.slice(2));
  if (scope === undefined) usage();

  // Desk-suffixed manifests migration (captain ruling 2026-10-28): when
  // this desk's suffixed manifest is absent and the legacy shared
  // manifest.json is present, seed the suffixed file from it (one-time;
  // the prior-manifest read below then sees the seed). The legacy file is
  // left in place untouched — inert; a follow-up per-desk captain commit
  // removes it at leisure. Never deleted in a code change.
  if (seedSuffixedFromLegacy(MANIFEST_PATHS)) {
    console.error(
      `migrated: seeded ${MANIFEST_PATH} from the legacy shared ` +
        `manifest.json — legacy left in place (inert); remove it in a ` +
        `follow-up commit.`,
    );
  }

  const specText = readFileSync(SPEC_SELF, "utf8");
  const table = parseRuleTable(specText);
  const twinText = readIfExists(SPEC_TWIN);

  let anchor: ManifestAnchor = {};
  let priorManifest: Record<string, unknown> | undefined;
  const priorText = readIfExists(MANIFEST_PATH);
  if (priorText !== undefined) {
    try {
      const prior: unknown = JSON.parse(priorText);
      if (typeof prior === "object" && prior !== null) {
        priorManifest = prior as Record<string, unknown>;
      }
      if (
        typeof prior === "object" && prior !== null &&
        "last-audit-commit" in prior
      ) {
        const a = (prior as { "last-audit-commit": unknown })[
          "last-audit-commit"
        ];
        if (typeof a === "object" && a !== null && !Array.isArray(a)) {
          const clean: Record<string, string> = {};
          for (const [k, v] of Object.entries(a)) {
            if (typeof v === "string") clean[k] = v;
          }
          anchor = { lastAuditCommit: clean };
        }
      }
    } catch {
      console.error("prior manifest unreadable — refusing to record over it");
      process.exit(1);
    }
  }
  if (scope === "diff" && anchor.lastAuditCommit === undefined) {
    console.error(
      "diff-scope requires a manifest anchor — none on record (never audited).",
    );
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

  const omoText = readFileSync(OMO_SOURCE.absPath, "utf8");
  const nextModelState = extractModelState(omoText, OMO_SOURCE.relPath);
  const nextFindingHashes = result.flags.map((f) => f.hash);

  // BUILD #14 idempotence guard: no-op when extracted state unchanged.
  // Compares model-state + finding-hashes ONLY — recorded-at and
  // last-audit-commit are deliberately excluded from the comparison
  // (timestamp/anchor churn alone must never produce a manifest diff).
  if (
    priorManifest !== undefined &&
    stableJson(priorManifest["model-state"]) === stableJson(nextModelState) &&
    stableJson(priorManifest["finding-hashes"]) ===
      stableJson(nextFindingHashes)
  ) {
    process.stdout.write(
      "\nmanifest unchanged (model-state + finding-hashes identical to prior)" +
        " — no-op, nothing written.\n",
    );
    return;
  }

  const manifest = {
    "recorded-at": new Date().toISOString(),
    "surface-scope": "sis",
    "last-audit-commit": { "~/.config/opencode": headCommit() },
    "model-state": nextModelState,
    "finding-hashes": nextFindingHashes,
  };
  mkdirSync(STATE_DIR, { recursive: true });
  // INV-1 exception (a): the skill's own state-dir manifest, explicit non-dry
  // run only — the single permitted write in this entire skill.
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  process.stdout.write(`\nmanifest recorded: ${MANIFEST_PATH}\n`);
}

main();
