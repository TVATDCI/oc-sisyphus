/**
 * v2.js — the OpenCode V2 plugin surface (setup(ctx)) for sisyphus-gates.
 *
 * Dual-export port (fm/oc-v2-adapt, 2026-10-20):
 *   - The V1 `server()` entry point in plugin.js is UNTOUCHED and stays
 *     the enforcement path on the pinned 1.18.31 install.
 *   - This module adds the V2 definition registered through ctx domains
 *     per the official plugin migration guide:
 *       tool.execute.before  -> ctx.tool.hook("execute.before")
 *       tool.execute.after   -> ctx.tool.hook("execute.after")
 *       permission.ask       -> ctx.permission.hook("evaluate")
 *       experimental.chat.system.transform
 *                            -> ctx.session.hook("context")
 *       experimental.session.compacting
 *                            -> ctx.session.hook("compaction")
 *       command.execute.before (no one-to-one V2 hook)
 *                            -> ctx.command.transform wrapper for the
 *                               gated command names + ctx.session.hook
 *                               ("prompt") admission net (guide: "use
 *               the prompt hook when the real intent is to modify
 *               prompts submitted by commands and other prompt sources").
 *
 * All decisions route through the SAME gates.js shouldBlockTool /
 * shouldBlockCommand the V1 hooks use — no logic fork, one owner.
 *
 * Options: ctx.options when the host delivered them (config object
 * route). Because 2.1.0 empirically ignores config-declared local-dir
 * plugins entirely (scout matrix rows 2-5), the proven V2 loading route
 * is auto-discovery of a plain file under plugins/, which delivers NO
 * options — so resolveOptions() falls back to reading the sisyphus-gates
 * options block straight out of opencode.json(c) in the config tree.
 *
 * State: the canonical ~/.sisyphus/state.json contract (state.js) is
 * kept for BOTH generations. ctx.storage is deliberately unused: the
 * state file is shared with the CLI, bd, and the V1 install during the
 * dual-run window; forking it into plugin-scoped storage would split
 * the trust root at cutover time.
 *
 * Blocking semantics parity: V1 throws `⛔ Gate blocked: <reason>` from
 * the hook (the empirically proven enforcement mechanism — output.parts
 * does NOT block). V2 hook callbacks propagate throws the same way
 * (guide example: `throw new Error("Do not read .env files")`).
 *
 * Loading layout (empirically settled in the sandbox probes):
 *   - V1 (pinned 1.18.31) loads the package via the opencode.json tuple
 *     -> dist/index.js named `server` export (byte-identical pre-port
 *     file). IMPORTANT: dist must NOT also export a default definition —
 *     V1 1.18.31 double-instantiates a module carrying both shapes
 *     (two startup markers per run, proven by A/B in the proof sandbox).
 *   - V2 (2.1.0) auto-discovers the repo-level plain file
 *     plugins/sisyphus-gates.js, whose default export is this
 *     definition. Config-declared local-dir routes are ignored by
 *     2.1.0 (scout matrix rows 2-5); if a later V2 fixes them, the
 *     package's dist entry would need the default moved back in —
 *     re-verify single-load behavior before any pin move.
 */

import { getState, syncStateWithDisk, setMemoryKey, setSandboxConfig } from "./state.js";
import { shouldBlockTool, shouldBlockCommand } from "./gates.js";
import { advancePhaseIfNeeded } from "./phase-machine.js";
import { loadWorkflowConfig } from "./workflow-loader.js";
import { recordEvent } from "./metrics.js";
import { loadMcpPrefixes } from "./mcp-classifier.js";
import { resolveMemoryKey } from "./memory-key.js";
import { loadSandboxConfig } from "./sandbox-policy.js";
import { server } from "./plugin.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * V2 tool-name aliases onto the V1 names the shared decision layer
 * (gates.js) is keyed on. opencode 2.1.0 renamed the live tools
 * (tool/plugin/shell.ts exports name "shell"; the subagent tool is
 * "subagent"), while every bash/task-specific layer in shouldBlockTool
 * matches `tool === "bash"` / `tool === "task"`. Without this alias the
 * hooks fire but every command-string defense — catastrophic, sudo,
 * trust-root bash tiers, sandbox allowlist, safe-read, the compound
 * metachar screen, fail-closed — silently skips for live sessions
 * (metachar-p0: proven live by scripts/v2-live-metachar-proof.sh, red
 * pre-alias, green post-alias). V1 dist path stays keyed on V1 names
 * exactly as before; the alias lives ONLY in this V2 shim.
 */
export const V2_TOOL_ALIASES = {
  shell: "bash",
  subagent: "task",
};

/** Map a live V2 tool name onto the decision layer's V1 vocabulary. */
export function gateToolName(tool) {
  return V2_TOOL_ALIASES[tool] ?? tool;
}

/**
 * Command names the V1 command.execute.before hook gates (gates.js
 * layer-4 checks). The V2 port re-registers each of these names with a
 * guarded executor so the same decisions fire on the V2 command surface.
 */
export const GATED_COMMAND_NAMES = [
  "git commit",
  "git push",
  "bd close",
  "bd dolt push",
];

/**
 * Strip JSONC line/block comments so opencode.jsonc can be parsed with
 * JSON.parse. Conservative: no string-aware state machine, but the fleet's
 * config files carry no comment-like strings inside values. If parsing
 * still fails, callers treat options as absent (fail-closed stays intact
 * because resolveMemoryKey defaults to no key -> verdicts unsigned ->
 * gates fail closed).
 */
function stripJsonComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

/**
 * Directories whose opencode.json(c) may carry the sisyphus-gates
 * options block, in order:
 *   1. the directory the host reported (ctx.location.directory — the
 *      config root when the host hands us one)
 *   2. each ancestor of that directory (bounded — a session server
 *      reports the PROJECT cwd, not the config root; the config root
 *      is an ancestor only in single-tree deployments, so also 3)
 *   3. the config root this module is DEPLOYED under (auto-discovery
 *      loads <configroot>/plugins/sisyphus-gates.js -> this file at
 *      <configroot>/plugins/sisyphus-gates/src/v2.js — three levels up)
 *   4. the XDG/home config roots (belt and braces for exotic layouts)
 * readOptionsFromConfig parses each candidate with the same logic; the
 * first candidate carrying a sisyphus-gates entry wins.
 */
export function optionsSearchPath(directory) {
  const seen = new Set();
  const out = [];
  const push = (d) => {
    if (typeof d === "string" && d && !seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  };

  // 1 + 2: reported directory and its ancestors (bounded walk)
  if (typeof directory === "string" && directory) {
    let current = directory;
    for (let i = 0; i < 10 && current; i++) {
      push(current);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  // 3: the config root this module is deployed under
  try {
    push(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))));
  } catch {
    /* non-file module layout — skip */
  }

  // 4: XDG/home config roots
  if (process.env.XDG_CONFIG_HOME) push(join(process.env.XDG_CONFIG_HOME, "opencode"));
  if (process.env.HOME) push(join(process.env.HOME, ".config", "opencode"));

  return out;
}

/**
 * Read the sisyphus-gates options block from the config tree's
 * opencode.json / opencode.jsonc. Understands both declaration shapes:
 *   V1 tuple:  ["./plugins/sisyphus-gates", { ...options }]
 *   V2 object: { "package": "./plugins/sisyphus-gates", "options": { ... } }
 * Returns {} when nothing is found (never null — callers spread it).
 *
 * metachar-p0: the search now spans the optionsSearchPath candidates.
 * Auto-discovery delivers no ctx.options AND ctx.location.directory is
 * the server's project cwd — before this fix the lookup found nothing,
 * silently disarming verdict signing ("Verdict signing disabled" in the
 * live serve log) and with it every gate-status-aware layer.
 */
export function readOptionsFromConfig(directory) {
  for (const candidateDir of optionsSearchPath(directory)) {
    const options = readOptionsFromDir(candidateDir);
    if (options && Object.keys(options).length > 0) return options;
  }
  return {};
}

function readOptionsFromDir(directory) {
  const candidates = [
    join(directory, "opencode.json"),
    join(directory, "opencode.jsonc"),
  ];
  for (const path of candidates) {
    let raw;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(stripJsonComments(raw));
    } catch {
      continue;
    }
    const entries = [
      ...(Array.isArray(parsed?.plugin) ? parsed.plugin : []),
      ...(Array.isArray(parsed?.plugins) ? parsed.plugins : []),
    ];
    for (const entry of entries) {
      if (Array.isArray(entry) && typeof entry[0] === "string" &&
          entry[0].includes("sisyphus-gates") && entry[1] && typeof entry[1] === "object") {
        return entry[1];
      }
      if (entry && typeof entry === "object" && typeof entry.package === "string" &&
          entry.package.includes("sisyphus-gates") && entry.options && typeof entry.options === "object") {
        return entry.options;
      }
    }
  }
  return {};
}

/**
 * Merge host-delivered ctx.options with the config-file fallback.
 * ctx.options wins per key (it is the sanctioned delivery path when the
 * host supports it); the config fallback fills what the host could not
 * deliver (2.1.0 auto-discovery route).
 */
export function resolveOptions(ctx) {
  const fromHost = ctx?.options && typeof ctx.options === "object" ? ctx.options : {};
  const fromConfig = readOptionsFromConfig(ctx?.location?.directory || process.cwd());
  return { ...fromConfig, ...fromHost };
}

/**
 * Normalize a V2 tool input for the shared decision layer. V2 renamed
 * the write/edit path field to `filePath`; trust-root matching already
 * tolerates all spellings, but the phase machine's file_write matcher
 * reads `args.path` exclusively — alias it so V2 sessions advance
 * phases identically to V1. Returns a shallow copy; never mutates the
 * host's event object beyond the caller's own assignments.
 */
export function normalizeToolArgs(input) {
  const args = { ...(input ?? {}) };
  if (args.path === undefined && args.filePath !== undefined) {
    args.path = args.filePath;
  }
  return args;
}

/**
 * Extract a plain text string from a V2 tool result for the phase
 * machine's output_contains transitions. Tolerates the shapes seen
 * across V2 minor versions: plain string, { content: string },
 * { content: [{ type: "text", text }] }.
 */
export function resultToText(result) {
  if (result == null) return "";
  if (typeof result === "string") return result;
  const content = result.content ?? result.output;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" ? part.text ?? "" : String(part)))
      .join("\n");
  }
  if (result.error?.message) return String(result.error.message);
  return "";
}

/**
 * The V2 plugin definition. Hand-rolled plain object (the
 * herdr-agent-state.js pattern empirically proven to auto-discover and
 * load under 2.1.0) — Plugin.define() from @opencode/plugin is a typed
 * identity helper and is not required at runtime.
 *
 * Also carries `server` so a future npm-package consolidation can use
 * the official one-default-export dual-support shape (V1 >= 1.18.29
 * calls server(), V2 reads id + setup()). Today the repo deliberately
 * splits entries instead: dist/index.js keeps ONLY the named `server`
 * (byte-identical pre-port file, single V1 instance — see the loading
 * layout note at the top of this file), and the V2 default lives in the
 * repo-level plugins/sisyphus-gates.js auto-discovery shim.
 */
export const v2Definition = {
  id: "sisyphus-gates",

  async setup(ctx) {
    // ── Startup parity with server() ────────────────────────────────
    // Same four startup steps, same failure handling: warn and continue
    // (gates.js keeps fail-closed when config/state inputs are missing).
    try {
      const config = loadWorkflowConfig();
      if (!config) {
        console.warn(
          "[sisyphus-gates] No workflow.yaml found at $HOME/.sisyphus/workflow.yaml. " +
            "Plugin will run in fail-closed mode: gates will refuse execution " +
            "and phase transitions will be no-ops."
        );
      }
    } catch (err) {
      console.warn(
        "[sisyphus-gates] Failed to load workflow config: " + err.message + ". " +
          "Plugin will run in fail-closed mode."
      );
    }

    try {
      loadMcpPrefixes(ctx?.location?.directory || process.cwd());
    } catch {
      // Non-fatal — MCP tools will be classified as unknown and denied by default.
    }

    const options = resolveOptions(ctx);
    const MEMORY_KEY = resolveMemoryKey(options);
    setMemoryKey(MEMORY_KEY);
    if (!MEMORY_KEY) {
      console.warn(
        "[sisyphus-gates] Verdict signing disabled — no verdict_key_command " +
          "configured or resolution failed. Gate status will be 'unknown' for all sessions."
      );
    }

    try {
      const sandboxCfg = loadSandboxConfig(options);
      setSandboxConfig(sandboxCfg);
      if (sandboxCfg === null) {
        console.warn(
          "[sisyphus-gates] sandbox_paths config is malformed — feature disabled. " +
            "Check opencode.json (entries must end with '/')."
        );
      } else if (sandboxCfg.sandboxPaths.length > 0) {
        console.log(
          "[sisyphus-gates] Layer 3.7 sandbox relaxation enabled for " + sandboxCfg.sandboxPaths.length + " path(s)."
        );
      }
    } catch (err) {
      console.warn(
        "[sisyphus-gates] Failed to load sandbox config: " + err.message + ". Feature disabled."
      );
      setSandboxConfig(null);
    }

    // ── Hook registrations ──────────────────────────────────────────

    await ctx.tool.hook("execute.before", async (event) => {
      const sessionID = event.sessionID ?? "";
      const tool = event.tool;
      const gateTool = gateToolName(tool); // V2 "shell"/"subagent" -> V1 "bash"/"task"
      const state = getState(sessionID);
      const args = normalizeToolArgs(event.input);

      // Route ALL tools through shouldBlockTool (not just write/edit/bash),
      // exactly like the V1 hook.
      const decision = shouldBlockTool(gateTool, args, state);
      if (decision.blocked) {
        event.input = {
          ...args,
          _sisyphus_gate_blocked: decision.reason,
        };
        recordEvent({
          sessionID,
          tool,
          phase: state.phase,
          reason: decision.reason,
          command: gateTool === "bash" ? args?.command : undefined,
        });
        if (decision.blockTool) {
          // Throw is the enforcement mechanism (V1-proven parity; V2 hook
          // callbacks propagate throws to the tool executor).
          throw new Error(`⛔ Gate blocked: ${decision.reason}`);
        }
      } else if (decision.sandboxAllow) {
        // Slice E (brain-9z9) audit parity: record sandbox-allow decisions.
        recordEvent({
          sessionID,
          tool,
          phase: state.phase,
          event_subtype: "sandbox-allow",
          reason: "Layer 3.7 sandbox allow",
          command: args?.command,
          cwd: decision.sandboxAllow.cwd,
          realpath_cwd: decision.sandboxAllow.realpathCwd,
          matched_pattern: decision.sandboxAllow.matchedPattern,
          matched_sandbox_path: decision.sandboxAllow.matchedSandboxPath,
        });
      }
    });

    await ctx.tool.hook("execute.after", async (event) => {
      const sessionID = event.sessionID ?? "";
      const state = getState(sessionID);
      syncStateWithDisk(sessionID);
      advancePhaseIfNeeded(state, gateToolName(event.tool), normalizeToolArgs(event.input), resultToText(event.result));
    });

    await ctx.permission.hook("evaluate", (event) => {
      const state = getState(event.sessionID || "");

      if (state.phase === "prd-review" || state.phase === "plan-review") {
        // V1 semantics: during review phases every non-read permission
        // request escalates to ask. V2 carries one action string instead
        // of a patterns[] list; the startsWith("read") test is preserved.
        const action = event.action ?? "";
        if (action && !action.startsWith("read")) {
          event.effect = "ask";
        }
      }
    });

    await ctx.session.hook("context", async (event) => {
      if (!event.sessionID) return;
      const freshState = syncStateWithDisk(event.sessionID) ?? getState(event.sessionID);
      if (
        freshState.stateFileExists &&
        (freshState.prdGateStatus === "FAIL" || freshState.planGateStatus === "FAIL")
      ) {
        recordEvent({
          sessionID: event.sessionID,
          tool: "system-transform",
          phase: freshState.phase,
          reason: `gate-status-rendered prd=${freshState.prdGateStatus} plan=${freshState.planGateStatus} approval=${freshState.approvalStatus}`,
        });
      }
      // V1 parity: gate status is tracked internally; no system-prompt
      // injection (the visible prompt block was removed pre-port).
    });

    await ctx.session.hook("compaction", async (event) => {
      const sessionID = event.sessionID ?? "";
      const state = getState(sessionID);

      const allowedAtCheckpoint = [
        "prd-approved",
        "plan-approved",
        "session-start",
      ];

      if (!allowedAtCheckpoint.includes(state.lastCheckpoint)) {
        // V1 set output.context (string list) + output.prompt (summary
        // instruction). The V2 compaction event has neither field; the
        // equivalent surface is event.system (SystemPart[]) — OpenCode
        // appends its own summary prompt after hooks run, so the preserve
        // instruction rides the system block instead.
        event.system?.push({
          type: "text",
          text: [
            `CRITICAL: Preserve gate state. Current phase is "${state.phase}".`,
            `PRD gate: ${state.prdGateStatus}. Plan gate: ${state.planGateStatus}.`,
            `Approval: ${state.approvalStatus}. PRD approved: ${state.prdApproved}. Plan approved: ${state.planApproved}.`,
            `Do NOT compact away gate status or phase information.`,
          ].join("\n"),
        });
      }
    });

    // ── command.execute.before replacement (no one-to-one V2 hook) ──
    // Primary route per the migration guide + firstmate spec: re-register
    // each gated command name with a guarded executor (a later command
    // registration overrides the same effective name).
    await ctx.command.transform((editor) => {
      for (const name of GATED_COMMAND_NAMES) {
        editor.add({
          name,
          description: "sisyphus-gates guarded command (V2 port of command.execute.before)",
          execute: async ({ sessionID, prompt, delivery }) => {
            const state = getState(sessionID ?? "");
            const decision = shouldBlockCommand(name, prompt?.text ?? "", state);
            if (decision.blocked) {
              recordEvent({
                sessionID: sessionID ?? "",
                tool: "command",
                phase: state.phase,
                reason: decision.reason,
                command: name,
              });
              throw new Error(`⛔ Gate blocked: ${decision.reason}`);
            }
            await ctx.session.prompt({ ...prompt, sessionID, delivery });
          },
        });
      }
    });

    // Safety net: commands submit through session.prompt, so the prompt
    // admission hook sees command-originated prompts. When the host
    // identifies the source command in event.metadata, enforce the same
    // decision there too (throw => prompt not admitted => command does
    // not run). Covers command surfaces the wrapper set cannot
    // re-register (e.g. hosts that reject same-name overrides).
    await ctx.session.hook("prompt", async (event) => {
      const meta = event.metadata;
      const command =
        (meta && typeof meta === "object" &&
          (typeof meta.command === "string" ? meta.command : undefined)) ??
        (meta && typeof meta === "object" && typeof meta.command?.name === "string"
          ? meta.command.name
          : undefined);
      if (!command) return;
      const sessionID = event.sessionID ?? "";
      const state = getState(sessionID);
      const decision = shouldBlockCommand(command, event.prompt?.text ?? "", state);
      if (decision.blocked) {
        recordEvent({
          sessionID,
          tool: "command",
          phase: state.phase,
          reason: decision.reason,
          command,
        });
        throw new Error(`⛔ Gate blocked: ${decision.reason}`);
      }
    });
  },

  // V1 dual-support (guide: "V1 calls server() and uses the returned
  // hooks"). Delegates to the untouched V1 implementation — identical
  // enforcement whichever resolution path a V1 host prefers.
  async server(input, options) {
    return server(input, options);
  },
};

export default v2Definition;
