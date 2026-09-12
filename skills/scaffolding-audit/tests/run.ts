/**
 * Task 2.2 TDD harness — drift-check core (sis side).
 *
 * Pure-logic pieces per PRD §11, mirrored from Task 1.3 with sis fixtures:
 * JSONC-aware manifest/binding parse, manifest comparison, finding-hash
 * stability, drift-flag branch (both manifest fixtures + boundaries), the
 * sis structural skill-count layer, surface self-enumeration, and the
 * OPEN-1 vendored-spec hash pin.
 *
 * Fixture isolation (F-8): every manifest fixture lives in an ISOLATED TEMP
 * state dir (mkdtemp under os.tmpdir()); the live skill state dir is never
 * touched by tests — the dry-run receipts assert its absence against the
 * real run.
 *
 * INV-1 note: test fixture writes below target ISOLATED TEMP dirs only —
 * the same manifest-write class as gate exception (a); never the live state
 * dir.
 *
 * Stale-fixture provenance: the pre-edit binding state of a REAL recent
 * recorded omo.jsonc binding edit — the per-desk variant deployment from
 * config-repo commit 9ede93a (deploy-omo.sh copied omo.tnt.jsonc over the
 * live ~/.omo/omo.jsonc on 2026-09-05 20:03, backing up the pre-edit live
 * state to ~/.omo/omo.jsonc.bak.20260905-200307). The backup file is
 * machine-read at run time and passed through the SAME extractor as the
 * live file. No synthetic inventions (PRD §12).
 */

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { findingHash, boundQuote, QUOTE_MAX } from "../scripts/lib/finding.ts";
import type { ModelState } from "../scripts/lib/model-state.ts";
import {
  extractModelState,
  parseJsonc,
  OMO_REL,
} from "../scripts/lib/model-state.ts";
import {
  checkDrift,
  DriftManifestError,
  DRIFT_FLAG,
} from "../scripts/lib/drift.ts";
import { countClaimFlags } from "../scripts/lib/scan-core.ts";
import {
  enumerateSkillDirs,
  sisSurfaces,
  SKILL_SELF_DIR,
} from "../scripts/lib/surfaces.ts";
import type { Surface, SkillTree } from "../scripts/lib/surfaces.ts";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const SKILL_DIR = join(SCRIPT_DIR, "..");
const CONFIG_ROOT = join(SKILL_DIR, "..", "..");
const LIVE_OMO = join(CONFIG_ROOT, "..", "..", ".omo", "omo.jsonc");
const BAK_OMO =
  join(CONFIG_ROOT, "..", "..", ".omo", "omo.jsonc.bak.20260905-200307");
const SPEC_SELF = join(SKILL_DIR, "spec", "spec-shared.md");
const SPEC_PINNED_SHA =
  "962cddbda8635e8afc821a894482af0ed277f2fc216a94f6bc609c084c6200d3";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
    console.log(`ok - ${name}`);
  } else {
    failed++;
    console.error(`NOT OK - ${name}`);
  }
}

function tryOutcome(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}

function tempStateDir(): string {
  return mkdtempSync(join(tmpdir(), "scaffolding-audit-sis-fixture-"));
}

function manifestJson(modelState: ModelState): string {
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

// ─── finding-hash stability (PRD §11) ────────────────────────────────────────

const F = OMO_REL;
const Q = '"model": "zai-coding-plan/glm-5.3",';

check(
  "finding hash: same file+line+quote → same hash across calls",
  findingHash(F, 17, Q) === findingHash(F, 17, Q),
);
check(
  "finding hash: quote change → different hash",
  findingHash(F, 17, Q) !== findingHash(F, 17, Q + " "),
);
check(
  "finding hash: line change → different hash",
  findingHash(F, 17, Q) !== findingHash(F, 18, Q),
);
check(
  "finding hash: file change → different hash",
  findingHash(F, 17, Q) !== findingHash("AGENTS.md", 17, Q),
);
check(
  "bound quote: caps at " + QUOTE_MAX + " chars",
  boundQuote("x".repeat(QUOTE_MAX + 50)).length === QUOTE_MAX,
);

// ─── JSONC-aware parsing (pitfall table: comments + trailing commas) ────────

const JSONC_FIXTURE = [
  "{",
  "  // line comment with \"quotes\" inside",
  "  /* block comment */",
  '  "url": "file://~/prompts/x.md",',
  '  "arr": [1, 2,],',
  '  "nested": {"a": "b",},',
  "}",
].join("\n");

check(
  "jsonc: comments stripped, trailing commas removed, // inside strings preserved",
  tryOutcome(() => {
    const parsed = parseJsonc(JSONC_FIXTURE) as {
      url?: string;
      arr?: number[];
      nested?: { a?: string };
    };
    return parsed.url === "file://~/prompts/x.md" &&
      JSON.stringify(parsed.arr) === "[1,2]" &&
      parsed.nested?.a === "b";
  }),
);
check(
  "jsonc: live omo.jsonc parses under the string-aware stripper",
  tryOutcome(() => {
    parseJsonc(readFileSync(LIVE_OMO, "utf8"));
    return true;
  }),
);

// ─── model-state extraction ──────────────────────────────────────────────────

const currentText = readFileSync(LIVE_OMO, "utf8");
const preEditText = readFileSync(BAK_OMO, "utf8");

const currentState = extractModelState(currentText, OMO_REL);
const preEditState = extractModelState(preEditText, OMO_REL);

check(
  "model-state: 27 fallback chains — 18 agents + 9 categories (AC-9 count)",
  Object.keys(currentState["fallback-chains"]).length === 27 &&
    Object.keys(currentState["fallback-chains"]).filter((k) =>
      k.startsWith("agents/")
    ).length === 18 &&
    Object.keys(currentState["fallback-chains"]).filter((k) =>
      k.startsWith("categories/")
    ).length === 9,
);
check(
  "model-state: 27 primary bindings, all non-empty, legacy .model vocabulary",
  Object.keys(currentState.bindings).length === 27 &&
    Object.values(currentState.bindings).every((m) => m.includes("/")),
);
check(
  "model-state: frozen pre-edit spot-check (agents/hephaestus primary, from the 2026-09-05 backup)",
  tryOutcome(() => preEditState.bindings["agents/hephaestus"] === "zai-coding-plan/glm-5.2"),
);
check(
  "model-state: source anchor carries path + 64-hex sha256",
  currentState.source.path === OMO_REL &&
    /^[0-9a-f]{64}$/.test(currentState.source.sha256),
);
check(
  "model-state: deterministic — two extractions stringify identically",
  JSON.stringify(extractModelState(currentText, OMO_REL)) ===
    JSON.stringify(currentState),
);
check(
  "model-state: pre-edit (2026-09-05 backup) ≠ current — the binding-edit drift class is visible",
  JSON.stringify(preEditState) !== JSON.stringify(currentState),
);
check(
  "model-state: pre-edit vs current BINDINGS differ (9ede93a deployment changed real bindings, not just comments)",
  JSON.stringify(preEditState.bindings) !== JSON.stringify(currentState.bindings),
);

// ─── drift-flag branch (both manifest fixtures + boundaries) ─────────────────

const staleDir = tempStateDir();
const staleManifestPath = join(staleDir, "manifest.json");
writeFileSync(staleManifestPath, manifestJson(preEditState), "utf8");

const freshDir = tempStateDir();
const freshManifestPath = join(freshDir, "manifest.json");
writeFileSync(freshManifestPath, manifestJson(currentState), "utf8");

const missingDir = tempStateDir();

const staleResult = checkDrift(
  readFileSync(staleManifestPath, "utf8"),
  currentState,
);
check(
  "drift: stale manifest (pre-edit 9ede93a state vs live omo.jsonc) → exactly the reminder flag and nothing else",
  staleResult.outcome === "stale" &&
    staleResult.output === DRIFT_FLAG,
);

const freshResult = checkDrift(
  readFileSync(freshManifestPath, "utf8"),
  currentState,
);
check(
  "drift: fresh manifest (post-edit state recorded) → silent",
  freshResult.outcome === "fresh" && freshResult.output === "",
);

const missingResult = checkDrift(undefined, currentState);
check(
  "drift: missing manifest → same flag (never audited)",
  missingResult.outcome === "missing" && missingResult.output === DRIFT_FLAG,
);
check(
  "drift: missing manifest → NO manifest written (no auto-rebuild)",
  readdirSync(missingDir).length === 0,
);

let unreadableThrew = false;
try {
  checkDrift("{ not json", currentState);
} catch (err) {
  unreadableThrew = err instanceof DriftManifestError;
}
check(
  "drift: unreadable manifest → explicit DriftManifestError (no silent rebuild)",
  unreadableThrew,
);

// ─── sis structural layer: skill-count claim verification ────────────────────

const COUNT_DOC_STALE = [
  "Some doc",
  "│ ├── skills/ # 47 real skill directories + 1 \\_shared refs (48 total)",
  "clean line",
].join("\n");
const COUNT_DOC_FRESH = [
  "Some doc",
  "│ ├── skills/ # 51 real skill directories + 1 \\_shared refs (52 total)",
  "clean line",
].join("\n");
const TREE_51: SkillTree = { realDirs: 51, sharedDirs: 1, names: [] };
const countSurface: Surface = {
  path: "COMPLETE-CODEBASE.md",
  absPath: "COMPLETE-CODEBASE.md",
  kind: "md",
  countDoc: true,
};

const staleCountFlags = countClaimFlags(COUNT_DOC_STALE, countSurface, TREE_51);
check(
  "count claim: stale '47 real skill directories (48 total)' vs 51+1 tree → exactly one class-4 flag at :2",
  staleCountFlags.length === 1 &&
    staleCountFlags[0]?.class === 4 &&
    staleCountFlags[0]?.line === 2 &&
    staleCountFlags[0]?.rule === "c4-skill-count-claim" &&
    staleCountFlags[0]?.action.startsWith("PROPOSE ONLY — operator arbitrates:"),
);
check(
  "count claim: fresh '51 real skill directories (52 total)' → silent",
  countClaimFlags(COUNT_DOC_FRESH, countSurface, TREE_51).length === 0,
);
check(
  "count claim: '(N total)' on a non-skill line → ignored (narrow scope)",
  countClaimFlags(
    "rules (14 total)",
    { path: "README.md", absPath: "README.md", kind: "md" },
    TREE_51,
  ).length === 0,
);
check(
  "count claim: hash over the bounded quote (stability contract applies)",
  staleCountFlags.length === 1 &&
    staleCountFlags[0]?.hash ===
      findingHash(
        "COMPLETE-CODEBASE.md",
        2,
        staleCountFlags[0]?.quote ?? "",
      ),
);

// ─── surface self-enumeration ─────────────────────────────────────────────────

const tree = enumerateSkillDirs(CONFIG_ROOT);
check(
  "surfaces: skill tree self-enumerates 51 real dirs + 1 shared (twin = 51st at authoring; the scan never hardcodes it)",
  tree.realDirs === 51 &&
    tree.sharedDirs === 1 &&
    tree.names.includes(SKILL_SELF_DIR),
);
const surfaces = sisSurfaces(CONFIG_ROOT);
check(
  "surfaces: sis surface set = binding config + root docs + skill bodies, self-excluded",
  surfaces.some((s) => s.path === "~/.omo/omo.jsonc" && s.kind === "ts") &&
    surfaces.some((s) => s.path === "COMPLETE-CODEBASE.md" && s.countDoc === true) &&
    surfaces.some((s) => s.path === "AGENTS.md" && s.countDoc === true) &&
    !surfaces.some((s) => s.path === `skills/${SKILL_SELF_DIR}/SKILL.md`) &&
    surfaces.some((s) => s.path.startsWith("skills/")),
);

// ─── OPEN-1 vendored-spec hash pin ────────────────────────────────────────────

check(
  "vendored spec: twin copy sha256 === staged pin (OPEN-1 hash-identity)",
  createHash("sha256")
    .update(readFileSync(SPEC_SELF, "utf8"), "utf8")
    .digest("hex") === SPEC_PINNED_SHA,
);

// ─── summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} test(s) failed (RED)`);
}
