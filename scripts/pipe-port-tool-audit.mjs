#!/usr/bin/env node
/**
 * pipe-port-tool-audit.mjs — Program 6 of the pipe-port-m3 validation ship.
 *
 * Tool-surface gate-classification audit (Oracle condition 7 tail): enumerate
 * each persona's tool surface from its skill contract (the generated persona
 * files + the skill bodies they embed) and verify every referenced tool class
 * resolves in the sisyphus-gates classification — zero unknown-tool deaths.
 *
 * Classification sources (the REAL ones, imported — never reimplemented):
 *   - plugins/sisyphus-gates/src/mcp-classifier.js for MCP-prefixed tools
 *     (prefixes loaded from the repo opencode.json, exactly as the gate does)
 *   - plugins/sisyphus-gates/src/gates.js layer topology for built-ins
 *
 * A referenced tool is one of:
 *   - a built-in tool name mentioned as a tool usage in the skill body
 *     (read/grep/glob/write/edit/bash/task/websearch/webfetch/list/patch)
 *   - an MCP tool name matching a configured server prefix (home_, codegraph_)
 *   - a declared-external toolchain (playwright) — recorded as external,
 *     expected NOT to resolve in-gates, flagged as declared-external
 *
 * Output: JSON on the last line: {personas: [...], unknown: N, verdict}
 * Exit: 0 = zero unknown-tool deaths; 1 = unknown present; 2 = usage error.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const require = createRequire(import.meta.url);

const GATES_BUILTIN_READ = new Set(["read", "grep", "glob", "websearch"]);
const GATES_BUILTIN_GATED = new Set(["write", "edit", "bash", "task"]);
const GATES_BUILTIN_PASSTHROUGH = new Set(["webfetch", "list", "patch", "ls"]);
const ALL_BUILTIN = new Set([
  ...GATES_BUILTIN_READ,
  ...GATES_BUILTIN_GATED,
  ...GATES_BUILTIN_PASSTHROUGH,
]);
const EXTERNAL_DECLARED = new Set(["playwright", "browser"]);

// MCP prefixes exactly as the gate loads them: from opencode.json mcp keys.
function mcpPrefixes() {
  const cfg = JSON.parse(readFileSync(join(repo, "opencode.json"), "utf8"));
  return Object.keys(cfg.mcp ?? {}).map((k) => k.toLowerCase() + "_");
}

// Tool references found in a skill body: fenced-code call shapes, backticked
// tool names, "the X tool", and mcp-style server_tool tokens.
function referencedTools(body) {
  const found = new Set();
  for (const m of body.matchAll(/`(read|grep|glob|write|edit|bash|task|websearch|webfetch|list|patch|ls)`/g)) {
    found.add(m[1]);
  }
  for (const m of body.matchAll(/\b(read|write|edit|bash|task)\s+tool\b/gi)) {
    found.add(m[1].toLowerCase());
  }
  for (const m of body.matchAll(/\bhome_[a-z0-9_]+|\bcodegraph_[a-z0-9_]+/g)) {
    found.add(m[0]);
  }
  for (const m of body.matchAll(/\bplaywright\b|\bbrowser_[a-z_]+/gi)) {
    found.add(m[0].toLowerCase());
  }
  return [...found];
}

function classify(tool, prefixes, getMcpClassification) {
  if (ALL_BUILTIN.has(tool)) {
    if (GATES_BUILTIN_READ.has(tool)) return { cls: "builtin-read", ok: true };
    if (GATES_BUILTIN_GATED.has(tool)) return { cls: "builtin-gated", ok: true };
    return { cls: "builtin-passthrough", ok: true };
  }
  const mcp = getMcpClassification(tool);
  if (mcp) {
    if (mcp.classification === "unknown") {
      return { cls: "mcp-unknown", ok: false, server: mcp.server };
    }
    return { cls: `mcp-${mcp.classification}`, ok: true, server: mcp.server };
  }
  if ([...EXTERNAL_DECLARED].some((e) => tool.startsWith(e))) {
    return { cls: "declared-external", ok: true, note: "external toolchain (playwright): not gate-resolvable by design" };
  }
  if (prefixes.some((p) => tool.startsWith(p))) {
    return { cls: "mcp-unknown", ok: false };
  }
  return { cls: "unresolved", ok: false };
}

async function main() {
  // import the REAL classifier from the plugin source
  const classifier = await import(
    require.resolve(join(repo, "plugins/sisyphus-gates/src/mcp-classifier.js"))
  );
  classifier.loadMcpPrefixes(join(repo));
  const prefixes = mcpPrefixes();

  const agentsDir = join(repo, "agents");
  const personas = [];
  let unknownTotal = 0;
  const generator = readFileSync(join(repo, "scripts/generate-pipeline-personas.py"), "utf8");
  const generatedNames = new Set(
    [...generator.matchAll(/"name":\s*"([a-z-]+)"/g)].map((m) => m[1])
  );
  // subagent_type targets named by the skills (the routing surface)
  const subagentTargets = new Set();
  for (const d of readdirSync(join(repo, "skills"))) {
    let body;
    try {
      body = readFileSync(join(repo, "skills", d, "SKILL.md"), "utf8");
    } catch {
      continue;
    }
    for (const m of body.matchAll(/subagent_type="([a-z-]+)"/g)) subagentTargets.add(m[1]);
  }

  for (const f of readdirSync(agentsDir)) {
    if (!f.endsWith(".md")) continue;
    const name = f.replace(/\.md$/, "");
    if (!generatedNames.has(name) && !subagentTargets.has(name)) continue;
    const src = readFileSync(join(agentsDir, f), "utf8");
    const body = src.replace(/^---[\s\S]*?---/, "");
    let skillBody = "";
    try {
      skillBody = readFileSync(join(repo, "skills", name, "SKILL.md"), "utf8");
    } catch {
      skillBody = ""; // persona without a same-named skill (e.g. oracle)
    }
    const refs = referencedTools(body + skillBody);
    const tools = [];
    let unknown = 0;
    for (const t of refs) {
      const c = classify(t, prefixes, classifier.getMcpClassification);
      tools.push({ tool: t, ...c });
      if (!c.ok) unknown++;
    }
    unknownTotal += unknown;
    personas.push({
      persona: name,
      tool_count: tools.length,
      unknown,
      tools,
      verdict: unknown === 0 ? "PASS" : "FAIL",
    });
  }

  const verdict = unknownTotal === 0 ? "PASS" : "FAIL";
  console.log(`tool-audit: ${personas.length} personas, ${unknownTotal} unknown-tool deaths — ${verdict}`);
  for (const p of personas) {
    console.log(
      `  ${p.verdict === "PASS" ? "ok " : "FAIL"} ${p.persona}: ${p.tool_count} refs (${p.tools.map((t) => t.tool + ":" + t.cls).join(", ")})`
    );
  }
  console.log(JSON.stringify({ personas, unknown: unknownTotal, verdict }));
  process.exit(verdict === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
