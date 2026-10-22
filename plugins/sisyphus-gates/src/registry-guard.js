/**
 * registry-guard.js — the agent-registry silent-default defense (P1-b).
 *
 * Defect being guarded (live-proven 2026-10-22, backlog-impl probes in
 * the oc-sisyphus worktree; pipe-port-m3 R1/R2 groundwork):
 *   1. The registry surfaces are DARK: `opencode api agent.list`,
 *      agent.get, and `opencode debug agents` return [] / 404 for
 *      CONFIGURED agents (repo agent map + agents/*.md) on fresh
 *      standalone servers AND the long-running background service —
 *      zero entries even where runtime resolution works. The surface,
 *      not the registration, is blind.
 *   2. The silent-default trap: a session that references an agent
 *      name which is not registered proceeds on DEFAULT model
 *      resolution with the agent label stamped (the Oct-17 "OK reply"
 *      rows; probe A ses_e9c4bc0d5… ran agent=sisyphus with NO
 *      committed model and served a free default).
 *
 * Fleet-side mitigation, plugin-side (the only blockable hook is
 * tool.execute.before — session hooks cannot fail per
 * packages/core/src/plugin/hooks.ts):
 *   - BLOCKING guard: a tool call whose session agent label — or whose
 *     subagent spawn type — is neither a V2 built-in nor a configured
 *     agent name is refused loudly instead of proceeding on a default
 *     model.
 *   - One-time startup validation: the in-process registry
 *     (ctx.agent.list()) vs the configured set; divergence is logged
 *     loudly once per process (a dark registry is the defect surface
 *     itself; spawns still resolve at runtime).
 *
 * Deliberate gap (documented in the upstream draft): pure-chat runs
 * that never call a tool are not blockable on any V2 hook — they are
 * detectable only via session-row parity (generator
 * --check-variant-parity) or the startup validation log.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * V2 built-in agent ids (packages/core/src/plugin/agent.ts, 2.1.x):
 * build (default), general, explore, compaction, title, summary.
 * These exist regardless of any config and must never be refused.
 */
export const BUILTIN_AGENT_IDS = [
  "build",
  "general",
  "explore",
  "compaction",
  "title",
  "summary",
];

/** Legacy markdown source directories the V2 loader scans (config/plugin/agent.ts). */
const AGENT_MD_DIRS = ["agents", "agent", "modes", "mode"];

/** Config file candidates, mirroring readOptionsFromDir's list. */
const CONFIG_FILES = ["opencode.json", "opencode.jsonc"];

/**
 * The configured agent names of ONE config root: the opencode.json(c)
 * `agent` map keys plus the *.md stems under the loader's markdown
 * directories. Missing files/dirs contribute nothing (never throws —
 * a blocking guard must not break on an unreadable tree).
 */
export function configuredAgentsIn(directory) {
  const names = new Set();
  if (typeof directory !== "string" || !directory) return names;

  for (const file of CONFIG_FILES) {
    let raw;
    try {
      raw = readFileSync(join(directory, file), "utf8");
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(stripJsonComments(raw));
    } catch {
      continue;
    }
    const map = parsed?.agent;
    if (map && typeof map === "object" && !Array.isArray(map)) {
      for (const key of Object.keys(map)) names.add(key);
    }
  }

  for (const dir of AGENT_MD_DIRS) {
    let entries;
    try {
      entries = readdirSync(join(directory, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        names.add(entry.name.replace(/\.md$/, ""));
      }
    }
  }
  return names;
}

/** Same conservative JSONC strip the options reader uses. */
function stripJsonComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

/**
 * The allowed agent-name set for a session directory: built-ins plus
 * every configured name found along the options search path (the same
 * candidates readOptionsFromConfig walks, so project-local agents,
 * deployed-config agents, and home-config agents all count — over-
 * collecting biases the BLOCKING guard away from false refusals).
 */
export function allowedAgents(searchDirs) {
  const allowed = new Set(BUILTIN_AGENT_IDS);
  for (const dir of searchDirs ?? []) {
    for (const name of configuredAgentsIn(dir)) allowed.add(name);
  }
  return allowed;
}

/**
 * Guard verdict for one agent label. Returns the block reason when the
 * label is set and NOT allowed; null otherwise (empty/undefined labels
 * and allowed names pass — the guard never refuses label-less tools).
 */
export function unregisteredAgentReason(label, allowed) {
  if (typeof label !== "string" || label === "") return null;
  if (allowed.has(label)) return null;
  return (
    `unregistered agent "${label}" — silent-default trap refused ` +
    `(V2 would proceed on a default model with the agent label ` +
    `stamped); use a configured agent (opencode.json agent map / ` +
    `agents/*.md) or a built-in (${BUILTIN_AGENT_IDS.slice(0, 3).join(", ")}, …)`
  );
}

/**
 * Startup-validation divergence between the configured set and the
 * live in-process registry: names configured but absent from the
 * registry. (Extra registry entries are not a defect — built-ins and
 * other plugins register too.)
 */
export function registryDivergence(configured, registryIds) {
  const registry = new Set(registryIds ?? []);
  const missing = [...configured].filter((name) => !registry.has(name)).sort();
  return { missing, registrySize: registry.size };
}
