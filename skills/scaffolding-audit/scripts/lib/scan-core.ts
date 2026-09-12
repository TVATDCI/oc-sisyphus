/**
 * Deterministic classification engine + report renderer (sis twin).
 *
 * Determinism contract (shared spec §7 + E-2 harness pin): no network, no
 * model calls, no wall-clock fields in the report — output is a pure
 * function of (tree state, vendored spec, manifest anchor).
 *
 * `classifyText` is the shared classification layer, logic-identical to the
 * pi landing's (both parse the same vendored rule table — AC-13). The sis
 * structural layer below (`countClaimFlags`) verifies skill-count claims in
 * routing/count docs against the self-enumerated tree: a sis-surface
 * invariant, not a local class definition (the pi surface set contains no
 * count-claim docs, so the layer has no pi counterpart by design).
 */

import type { ScanRule, RuleTable } from "./spec.ts";
import { hashIdentity } from "./spec.ts";
import type { FlagRecord } from "./finding.ts";
import { makeFlag } from "./finding.ts";
import type { Surface, SkillTree } from "./surfaces.ts";
import { isCommentLine } from "./surfaces.ts";
import { execFileSync } from "node:child_process";

export type ScopeMode = "full" | "diff";

export type ManifestAnchor = {
  lastAuditCommit?: Record<string, string>;
};

export type ScanResult = {
  scope: ScopeMode;
  specSelf: string;
  specTwin: string | undefined;
  hashIdentical: boolean;
  skillTree: SkillTree;
  surfacesPlanned: Surface[];
  surfacesScanned: Surface[];
  flags: FlagRecord[];
  doctrineDiff: string;
};

function git(configRoot: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd: configRoot, encoding: "utf8" });
  } catch {
    return undefined;
  }
}

function ruleAppliesToLine(
  rule: ScanRule,
  line: string,
  surface: Surface,
): boolean {
  if (rule.where === "comment" && surface.kind === "ts" && !isCommentLine(line)) {
    return false;
  }
  return true;
}

function lineExcluded(rule: ScanRule, line: string): boolean {
  if (rule.excludeLine === undefined) return false;
  const re = new RegExp(rule.excludeLine, rule.excludeLineFlags ?? "");
  return re.test(line);
}

/** UTC date string (YYYY-MM-DD) for the dated-if-before rule comparison. */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function classifyText(
  text: string,
  surface: Surface,
  rules: ScanRule[],
): FlagRecord[] {
  const seen = new Set<string>();
  const flags: FlagRecord[] = [];
  const lines = text.split("\n");
  const today = utcToday();
  for (const rule of rules) {
    const re = new RegExp(rule.pattern, rule.flags);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const key = `${surface.path}\n${i + 1}\n${rule.class}`;
      if (seen.has(key)) continue;
      if (!ruleAppliesToLine(rule, line, surface)) continue;
      if (lineExcluded(rule, line)) continue;
      const match = re.exec(line);
      if (match === null) continue;
      if (rule.datedIfBefore === true) {
        const date = match[2];
        if (typeof date !== "string" || date >= today) continue;
      }
      seen.add(key);
      flags.push(
        makeFlag(surface.path, i + 1, rule.id, rule.class, line, rule.action),
      );
    }
  }
  flags.sort((a, b) =>
    a.file === b.file
      ? a.line === b.line
        ? a.class - b.class
        : a.line - b.line
      : a.file < b.file
        ? -1
        : 1
  );
  return flags;
}

// ─── sis structural layer: skill-count claim verification ────────────────────
//
// Narrow by design: only lines that mention skills / _shared AND carry a
// count claim ("N real skill director(y|ies)" or "(N total)") are checked,
// against the run-time self-enumerated tree. Historical timeline entries
// ("46 skills" in a dated changelog line) do not match these shapes and are
// left to operator arbitration via the report, never auto-edited.

const REAL_DIR_RE = /(\d+)\s+real skill director(?:y|ies)/;
const TOTAL_RE = /\((\d+)\s+total\)/;
const SKILL_CTX_RE = /skill|_shared/i;

export function countClaimFlags(
  text: string,
  surface: Surface,
  tree: SkillTree,
): FlagRecord[] {
  const flags: FlagRecord[] = [];
  const lines = text.split("\n");
  const actualTotal = tree.realDirs + tree.sharedDirs;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (!SKILL_CTX_RE.test(line)) continue;
    const realClaim = REAL_DIR_RE.exec(line)?.[1];
    const totalClaim = TOTAL_RE.exec(line)?.[1];
    const mismatches: string[] = [];
    if (realClaim !== undefined && Number(realClaim) !== tree.realDirs) {
      mismatches.push(`real: ${realClaim} claimed / ${tree.realDirs} actual`);
    }
    if (totalClaim !== undefined && Number(totalClaim) !== actualTotal) {
      mismatches.push(`total: ${totalClaim} claimed / ${actualTotal} actual`);
    }
    if (mismatches.length === 0) continue;
    flags.push(
      makeFlag(
        surface.path,
        i + 1,
        "c4-skill-count-claim",
        4,
        line,
        `PROPOSE ONLY — operator arbitrates: skill-count claim stale against the self-enumerated tree (${mismatches.join("; ")}); update the routing/count doc when arbitrated.`,
      ),
    );
  }
  return flags;
}

// ─── diff-scope + doctrine diff (git-anchored in the config repo) ────────────

function changedSince(
  configRoot: string,
  anchor: Record<string, string> | undefined,
  surfaces: Surface[],
): Surface[] {
  if (anchor === undefined) return surfaces;
  const commit = Object.values(anchor)[0];
  if (commit === undefined || commit === "") return surfaces;
  const diffNames = git(configRoot, [
    "diff", "--name-only", `${commit}..HEAD`,
  ]) ?? "";
  const porcelain = git(configRoot, ["status", "--porcelain", "-uall"]) ?? "";
  const changed = new Set<string>();
  for (const name of diffNames.split("\n")) {
    if (name !== "") changed.add(name);
  }
  for (const row of porcelain.split("\n")) {
    if (row === "") continue;
    // "?? path" / " M path" — path starts at column 4 in porcelain -uall output.
    const path = row.slice(3).replace(/^"|"$/g, "");
    changed.add(path);
  }
  return surfaces.filter((s) => changed.has(s.path));
}

function doctrineDiffSection(
  configRoot: string,
  anchor: Record<string, string> | undefined,
  surfaces: Surface[],
): string {
  if (anchor === undefined) {
    return [
      "No manifest on record — doctrine-diff baseline is not yet anchored.",
      "This run establishes the baseline; record it with an explicit non-dry",
      "audit run (scripts/manifest.ts) to anchor future diffs.",
    ].join("\n");
  }
  const commit = Object.values(anchor)[0];
  if (commit === undefined || commit === "") {
    return "Manifest carries an empty last-audit-commit anchor — re-record the manifest.";
  }
  // Repo-relative surfaces only; the live binding config (~-prefixed) is
  // outside the config repo and is anchored by the model-state source digest
  // (drift check), not by a git commit.
  const paths = surfaces.map((s) => s.path).filter((p) => !p.startsWith("~"));
  const stat = git(configRoot, [
    "diff", "--stat", `${commit}..HEAD`, "--", ...paths,
  ]);
  const lines: string[] = [];
  lines.push(
    "~/.omo/omo.jsonc (live, untracked): anchored by the model-state source digest — see the drift check.",
  );
  if (stat === undefined) {
    lines.push(`git anchor unavailable — last-audit-commit ${commit} not diffable here.`);
    return lines.join("\n");
  }
  if (stat.trim() === "") {
    lines.push(`No doctrine-bearing changes since last-audit-commit ${commit}.`);
  } else {
    lines.push(`Changes since last-audit-commit ${commit}:`);
    lines.push(stat.trimEnd());
  }
  return lines.join("\n");
}

export function runScan(
  configRoot: string,
  scope: ScopeMode,
  table: RuleTable,
  specSelfText: string,
  specTwinText: string | undefined,
  surfaces: Surface[],
  anchor: ManifestAnchor,
  readText: (absPath: string) => string,
  skillTree: SkillTree,
): ScanResult {
  const identity = hashIdentity(specSelfText, specTwinText);
  const planned = scope === "diff"
    ? changedSince(configRoot, anchor.lastAuditCommit, surfaces)
    : surfaces;
  const flags: FlagRecord[] = [];
  const seen = new Set<string>();
  const scanned: Surface[] = [];
  for (const surface of planned) {
    let text: string;
    try {
      text = readText(surface.absPath);
    } catch {
      continue; // surface vanished between enumeration and read — skip, stay read-only
    }
    scanned.push(surface);
    // Shared rule-table layer first (table order wins), then the sis
    // structural layer — deduped per (file, line, class).
    for (const flag of classifyText(text, surface, table.rules)) {
      const key = `${flag.file}\n${flag.line}\n${flag.class}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flags.push(flag);
    }
    if (surface.countDoc === true) {
      for (const flag of countClaimFlags(text, surface, skillTree)) {
        const key = `${flag.file}\n${flag.line}\n${flag.class}`;
        if (seen.has(key)) continue;
        seen.add(key);
        flags.push(flag);
      }
    }
  }
  flags.sort((a, b) =>
    a.file === b.file
      ? a.line === b.line
        ? a.class - b.class
        : a.line - b.line
      : a.file < b.file
        ? -1
        : 1
  );
  return {
    scope,
    specSelf: identity.self,
    specTwin: identity.twin,
    hashIdentical: identity.identical,
    skillTree,
    surfacesPlanned: surfaces,
    surfacesScanned: scanned,
    flags,
    doctrineDiff: doctrineDiffSection(configRoot, anchor.lastAuditCommit, surfaces),
  };
}

const CLASS_NAMES: Record<FlagRecord["class"], string> = {
  1: "model identifiers (current AND historical) in prose",
  2: "workaround language tied to named failure modes",
  3: "quota/limit constants pinned to a plan/model era",
  4: "tier/doctrine references",
  5: "knowledge now redundant with newer training data",
};

export function renderReport(result: ScanResult): string {
  const out: string[] = [];
  out.push("# scaffolding-audit report — sis surface");
  out.push("");
  out.push(`- scope: ${result.scope} (operator-selected argument)`);
  out.push(`- vendored spec sha256: ${result.specSelf}`);
  out.push(
    result.specTwin === undefined
      ? "- pi landing spec copy: not reachable on this desk (hash recorded for cross-desk comparison)"
      : `- pi landing spec sha256: ${result.specTwin} (hash-identity: ${
        result.hashIdentical ? "MATCH" : "MISMATCH — HARD STOP"
      })`,
  );
  out.push(
    `- skill tree (self-enumerated): ${result.skillTree.realDirs} real skill dirs + ${result.skillTree.sharedDirs} shared-ref dir(s)`,
  );
  out.push(
    `- surfaces scanned: ${result.surfacesScanned.length} of ${result.surfacesPlanned.length} planned (self-enumerated)`,
  );
  out.push(`- flags: ${result.flags.length}`);
  out.push("");
  if (!result.hashIdentical) {
    out.push("## HARD STOP — spec divergence (AC-13)");
    out.push("");
    out.push(
      "Vendored spec copies differ. Re-vendor identical copies into BOTH landings before auditing.",
    );
    return out.join("\n") + "\n";
  }
  out.push("## Flags");
  out.push("");
  if (result.flags.length === 0) {
    out.push("_None — no rule-table hits on scanned surfaces._");
  }
  for (const flag of result.flags) {
    out.push(
      `### [class ${flag.class} — ${CLASS_NAMES[flag.class]}] ${flag.file}:${flag.line}`,
    );
    out.push(`- rule: \`${flag.rule}\``);
    out.push(`- quote: \`${flag.quote}\``);
    out.push(`- action: ${flag.action}`);
    out.push(`- finding-hash: \`${flag.hash}\``);
    out.push("");
  }
  out.push("## Doctrine diff");
  out.push("");
  out.push(result.doctrineDiff);
  out.push("");
  out.push("## omo doctor leg (validation — D4)");
  out.push("");
  out.push("Script leg does not run the doctor (determinism: no spawn here). Run");
  out.push(
    "`omo doctor` (non-interactive fallback: node ~/.cache/opencode/packages/oh-my-openagent@<ver>/node_modules/oh-my-openagent/bin/oh-my-opencode.js doctor)",
  );
  out.push(
    "and embed its output verbatim here; if unavailable, record a noted-missing",
  );
  out.push("leg — the text audit above still stands.");
  return out.join("\n") + "\n";
}
