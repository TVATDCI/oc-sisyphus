/**
 * Task 2.5 divergence-test harness (E-2 pinned).
 *
 * Runs the SAME fixture set through BOTH landings' deterministic
 * classification logic and prints a side-by-side table:
 *   - pi side (committed code, read-only import): classifyText + checkDrift
 *     from ~/.pi/agent/skills/scaffolding-audit/scripts/lib/
 *   - sis side (this landing): the same-named modules under ../scripts/lib/
 * Each side parses the rule table from its OWN vendored spec copy; the
 * audit-time hash-identity check runs first — if the copies diverged, the
 * harness says so and nothing else matters.
 *
 * The sis structural skill-count layer (countClaimFlags) is reported in its
 * own annotation: a sis-surface invariant, not part of the shared
 * classification layer (AC-13 guards the shared layer).
 *
 * Determinism (E-2 (c)): everything is computed TWICE in-process and
 * compared; no network, no model calls, no wall-clock in output.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyText as piClassifyText } from "/home/vladi/.pi/agent/skills/scaffolding-audit/scripts/lib/scan-core.ts";
import { parseRuleTable as piParseRuleTable, specSha256 as piSpecSha256 } from "/home/vladi/.pi/agent/skills/scaffolding-audit/scripts/lib/spec.ts";
import { checkDrift as piCheckDrift } from "/home/vladi/.pi/agent/skills/scaffolding-audit/scripts/lib/drift.ts";
import { classifyText, countClaimFlags } from "../scripts/lib/scan-core.ts";
import { parseRuleTable, specSha256 } from "../scripts/lib/spec.ts";
import { checkDrift } from "../scripts/lib/drift.ts";
import { extractModelState, OMO_REL } from "../scripts/lib/model-state.ts";
import { enumerateSkillDirs } from "../scripts/lib/surfaces.ts";
import type { Surface, SkillTree } from "../scripts/lib/surfaces.ts";
import type { FlagRecord } from "../scripts/lib/finding.ts";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const SKILL_DIR = join(SCRIPT_DIR, "..");
const CONFIG_ROOT = join(SKILL_DIR, "..", "..");
const PI_SPEC = "/home/vladi/.pi/agent/skills/scaffolding-audit/spec/spec-shared.md";
const SIS_SPEC = join(SKILL_DIR, "spec", "spec-shared.md");
const LIVE_OMO = join(CONFIG_ROOT, "..", "..", ".omo", "omo.jsonc");
const BAK_OMO =
  join(CONFIG_ROOT, "..", "..", ".omo", "omo.jsonc.bak.20260905-200307");

// Fixtures — specimen lines verbatim from the tree (pinned):
const TIER_168 =
  " * but L3 may consult it to downshift architecture→4.7 if a dispatch lands in peak.";
const TIER_151 =
  "  // Promo window (single source of truth — update the date as Z AI extends/ends it)";
const TIER_159 =
  'export const PROMO_SUNSET_ISO = "2026-09-07"; // promo text removed from docs 2026-09-08 (was 2026-09-30)';
const COUNT_25 =
  "│ ├── skills/ # 47 real skill directories + 1 \\_shared refs (48 total)";

const tierSurface: Surface = {
  path: "extensions/orchestration-engine/tier-map.ts",
  absPath: "extensions/orchestration-engine/tier-map.ts",
  kind: "ts",
};
const docSurface: Surface = {
  path: "COMPLETE-CODEBASE.md",
  absPath: "COMPLETE-CODEBASE.md",
  kind: "md",
};

function summarize(flags: FlagRecord[]): string {
  if (flags.length === 0) return "none";
  return flags
    .map((f) => `class${f.class}:${f.rule}`)
    .sort()
    .join(",");
}

function manifestJson(modelState: unknown): string {
  return JSON.stringify(
    {
      "recorded-at": "2026-09-05T20:03:07.000Z",
      "surface-scope": "sis",
      "last-audit-commit": { "~/.config/opencode": "9ede93a" },
      "model-state": modelState,
      "finding-hashes": [],
    },
    null,
    2,
  ) + "\n";
}

function compute(): string[] {
  const lines: string[] = [];
  const piSpecText = readFileSync(PI_SPEC, "utf8");
  const sisSpecText = readFileSync(SIS_SPEC, "utf8");
  const piTable = piParseRuleTable(piSpecText);
  const sisTable = parseRuleTable(sisSpecText);
  lines.push(
    `spec hash identity: pi=${piSpecSha256(piSpecText)} sis=${specSha256(sisSpecText)} identical=${
      piSpecSha256(piSpecText) === specSha256(sisSpecText)
    }`,
  );

  const fixtureRows: [string, string, Surface][] = [
    ["tier-map:168 downshift residue", TIER_168, tierSurface],
    ["tier-map:151 promo comment", TIER_151, tierSurface],
    ["tier-map:159 PROMO_SUNSET_ISO", TIER_159, tierSurface],
    ["COMPLETE-CODEBASE:25 count claim", COUNT_25, docSurface],
  ];
  for (const [name, line, surface] of fixtureRows) {
    const pi = summarize(piClassifyText(line, surface, piTable.rules));
    const sis = summarize(classifyText(line, surface, sisTable.rules));
    lines.push(`${name} | ${pi} | ${sis} | ${pi === sis}`);
  }

  const tree: SkillTree = enumerateSkillDirs(CONFIG_ROOT);
  const sisStructural = summarize(
    countClaimFlags(COUNT_25, docSurface, tree),
  );
  lines.push(
    `sis structural layer (count claim, tree=${tree.realDirs}+${tree.sharedDirs}): ${sisStructural}`,
  );

  const liveText = readFileSync(LIVE_OMO, "utf8");
  const preEditText = readFileSync(BAK_OMO, "utf8");
  const currentState = extractModelState(liveText, OMO_REL);
  const preEditState = extractModelState(preEditText, OMO_REL);
  const staleManifest = manifestJson(preEditState);
  const freshManifest = manifestJson(currentState);

  const piStale = piCheckDrift(staleManifest, currentState);
  const sisStale = checkDrift(staleManifest, currentState);
  lines.push(
    `drift stale manifest | ${piStale.outcome} | ${sisStale.outcome} | ${piStale.outcome === sisStale.outcome && sisStale.output === "routing state drifted since last audit — run scaffolding-audit"}`,
  );
  const piFresh = piCheckDrift(freshManifest, currentState);
  const sisFresh = checkDrift(freshManifest, currentState);
  lines.push(
    `drift fresh manifest | ${piFresh.outcome} | ${sisFresh.outcome} | ${piFresh.outcome === sisFresh.outcome && sisFresh.output === ""}`,
  );
  return lines;
}

const run1 = compute();
const run2 = compute();
const deterministic = JSON.stringify(run1) === JSON.stringify(run2);
for (const line of run1) console.log(line);
console.log(`determinism: two consecutive computations identical: ${deterministic}`);
if (!deterministic) {
  throw new Error("divergence harness is not deterministic");
}
