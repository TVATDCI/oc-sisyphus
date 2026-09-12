/**
 * sis audited-surface enumeration (shared spec §6).
 *
 * Surfaces are self-enumerated at run time — never a hardcoded skill count.
 * The scaffolding-audit skill dir itself is excluded from TEXT scanning
 * (self-exclusion: its docs and vendored spec legitimately quote specimens
 * and token lists), but IS counted by the skill-tree enumeration (the twin
 * is a real skill dir — the 51st at landing time, never pinned in code).
 *
 * Symlinked entries count by what they are, not how they appear:
 * `_`-prefixed entries (the shared-refs dir) count as shared refs regardless
 * of type, and symlinked skill dirs (herdr / herdr-collab →
 * ~/.agents/skills/) count as real skill dirs — representation must not
 * skew the count. Home is derived from the config root (two ups), not
 * os.homedir() — keeps the read-only grant pure (`--allow-read` alone; no
 * sys access needed).
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const SKILL_SELF_DIR = "scaffolding-audit";

export type Surface = {
  /** Repo-relative (or ~-abbreviated) path as it should appear in flags. */
  path: string;
  /** Absolute path to read. */
  absPath: string;
  /** ".ts"-kind surfaces (TypeScript + JSONC) apply comment-where rules to comment lines only. */
  kind: "ts" | "md";
  /** Routing/count docs get the sis structural skill-count verification. */
  countDoc?: boolean;
};

export type SkillTree = {
  realDirs: number;
  sharedDirs: number;
  names: string[];
};

/** Skill-tree self-enumeration: real skill dirs + `_`-prefixed shared-ref entries. */
export function enumerateSkillDirs(configRoot: string): SkillTree {
  const skillsDir = join(configRoot, "skills");
  const names: string[] = [];
  let shared = 0;
  let entries;
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return { realDirs: 0, sharedDirs: 0, names: [] };
  }
  for (const entry of entries) {
    if (entry.name.startsWith("_")) {
      shared++;
      continue;
    }
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    names.push(entry.name);
  }
  names.sort();
  return { realDirs: names.length, sharedDirs: shared, names };
}

export function sisSurfaces(configRoot: string): Surface[] {
  const surfaces: Surface[] = [
    {
      path: "~/.omo/omo.jsonc",
      // config root = ~/.config/opencode → two ups = ~
      absPath: join(configRoot, "..", "..", ".omo", "omo.jsonc"),
      kind: "ts",
    },
  ];
  // Repo-root routing/count docs — self-enumerated root *.md, sorted.
  const rootMds: string[] = [];
  try {
    const rootEntries = readdirSync(configRoot, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile() && entry.name.endsWith(".md")) rootMds.push(entry.name);
    }
  } catch {
    // config root unreadable — fall through to skill bodies only
  }
  rootMds.sort();
  for (const name of rootMds) {
    surfaces.push({
      path: name,
      absPath: join(configRoot, name),
      kind: "md",
      countDoc: true,
    });
  }
  // Skill bodies — self-enumerated, self-excluded, `_`-prefixed refs skipped.
  const tree = enumerateSkillDirs(configRoot);
  for (const name of tree.names) {
    if (name === SKILL_SELF_DIR) continue;
    const skillMd = join(configRoot, "skills", name, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    surfaces.push({ path: `skills/${name}/SKILL.md`, absPath: skillMd, kind: "md" });
  }
  return surfaces;
}

/** Comment-line test for .ts/.jsonc surfaces (shared spec §7 `where: comment`). */
export function isCommentLine(line: string): boolean {
  return /^\s*(?:\/\/|\/\*|\*)/.test(line);
}
