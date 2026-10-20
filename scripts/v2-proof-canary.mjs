#!/usr/bin/env node
/**
 * v2-proof-canary.mjs — the DETERMINISTIC canary for v2-enforcement-proof.sh.
 *
 * Replaces the free-model-compliance canary (flaky twice on the live tree:
 * one 0-byte stall, one disobedient model) with a direct drive of the
 * sisyphus-gates enforcement path under each generation's loading contract:
 *
 *   generation 1 (opencode 1.18.31) — the host resolves the opencode.json
 *     tuple ["./plugins/sisyphus-gates", options] to dist/index.js and calls
 *     its named `server` export. The harness imports the same entry from the
 *     proof sandbox and invokes server({directory}, options) exactly like
 *     the host, then fires the returned "tool.execute.before" hook.
 *
 *   generation 2 (opencode 2.1.0) — the host auto-discovers the plain file
 *     plugins/sisyphus-gates.js and calls its default export's setup(ctx).
 *     The harness imports that entry from the proof sandbox, calls setup()
 *     with a recording ctx, then fires the registered "execute.before"
 *     callback.
 *
 * The harness is a mini-host: it owns the write tool. If the gate's hook
 * throws, the write never happens (that is the host's throw-blocks-tool
 * contract); if the hook returns without throwing, the mini-host EXECUTES
 * the canary write, so a fail-open gate produces pwned.txt and fails the
 * proof. "No canary artifact" is therefore a real assertion, not a vacuous
 * one.
 *
 * Proven per run, all deterministically (no model, no network):
 *   1. LOAD   — the generation's entry initializes and emits at least one
 *               "[sisyphus-gates]" startup marker line from the gate itself;
 *               the V1 entry shape guard (named server, NO default export)
 *               rejects the double-instantiation shape outright.
 *   2. ENFORCE — one write-tool event under fail-closed state (no state.json)
 *               is BLOCKED by the gate's own verdict path: the hook throws
 *               "Gate blocked" with the fail-closed reason, exactly one
 *               metric event is recorded (single verdict, no double fire).
 *   3. CLEAN  — pwned.txt is absent after the blocked attempt.
 *
 * Usage:
 *   node scripts/v2-proof-canary.mjs --generation 1|2 --config-dir DIR \
 *        --project DIR [--home DIR] [--entry FILE]
 *
 *   --config-dir  the proof sandbox's opencode config tree (the copy under
 *                 test; entries are imported FROM HERE, never from the live
 *                 or repo tree directly).
 *   --project     scratch project dir; the canary file would land here.
 *   --home        sandbox HOME for state/metrics resolution (default
 *                 $HOME at call time; must have no .sisyphus/state.json).
 *   --entry       override the entry file path (test fixture control only;
 *                 the production proof never passes it).
 *
 * Exit: 0 = canary PROVEN (blocked, no artifact, single verdict)
 *       1 = NOT proven (details printed)
 *       2 = usage error
 *
 * Output (grep-able, one fact per line):
 *   canary: generation=N blocked=yes|no canary_file=absent|present \
 *          metric_events=N startup_markers=N
 *   canary: reason=<the gate's own block reason, when blocked>
 *   canary: fail=<why not proven, when not proven>
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SESSION_ID = "v2-proof-canary";
const CANARY_NAME = "pwned.txt";
const CANARY_CONTENT = "canary";

function failUsage(msg) {
  process.stderr.write(`usage error: ${msg}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { generation: null, configDir: null, project: null, home: null, entry: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => (argv[++i] !== undefined ? argv[i] : failUsage(`${a} requires a value`));
    if (a === "--generation") opts.generation = next();
    else if (a === "--config-dir") opts.configDir = next();
    else if (a === "--project") opts.project = next();
    else if (a === "--home") opts.home = next();
    else if (a === "--entry") opts.entry = next();
    else failUsage(`unknown argument: ${a}`);
  }
  if (opts.generation !== "1" && opts.generation !== "2") {
    failUsage("--generation must be 1 or 2");
  }
  if (!opts.configDir) failUsage("--config-dir is required");
  if (!opts.project) failUsage("--project is required");
  if (!opts.home) opts.home = process.env.HOME || null;
  if (!opts.home) failUsage("--home (or $HOME) is required");
  return opts;
}

async function importModule(path) {
  return import(pathToFileURL(path).href);
}

/**
 * Resolve the generation-appropriate entry file inside the config tree.
 * Mirrors what each generation's opencode host actually loads (see the
 * loading-layout notes in plugins/sisyphus-gates/src/v2.js and
 * plugins/sisyphus-gates.js).
 */
function entryPathFor(generation, configDir) {
  return generation === "1"
    ? join(configDir, "plugins", "sisyphus-gates", "dist", "index.js")
    : join(configDir, "plugins", "sisyphus-gates.js");
}

/**
 * A recording stand-in for the V2 host's ctx domains. Every hook
 * registration is captured so the harness can fire exactly the surface the
 * proof cares about (tool execute.before) while setup() runs unmodified.
 */
function makeRecordingCtx(configDir, registrations) {
  const record = (surface, name, cb) => {
    registrations.push({ surface, name, cb });
  };
  return {
    location: { directory: configDir },
    options: {},
    tool: { hook: (name, cb) => record("tool", name, cb) },
    permission: { hook: (name, cb) => record("permission", name, cb) },
    session: { hook: (name, cb) => record("session", name, cb) },
    command: {
      transform: (fn) => record("command", "transform", fn),
    },
  };
}

/** Count lines carrying the gate's own startup marker. */
function countMarkers(lines) {
  return lines.filter((l) => l.includes("[sisyphus-gates]")).length;
}

/** Count metric events recorded for this proof's session. */
function countSessionMetricEvents(home) {
  const metricsPath = join(home, ".sisyphus", "metrics", "gate-events.jsonl");
  if (!existsSync(metricsPath)) return 0;
  const raw = readFileSync(metricsPath, "utf8");
  let n = 0;
  for (const line of raw.split("\n")) {
    if (line.trim() && line.includes(`"sessionID":"${SESSION_ID}"`)) n++;
  }
  return n;
}

/**
 * Run the deterministic canary. Returns a result object; never throws.
 *
 * opts: { generation: "1"|"2", configDir, project, home, entry? }
 */
export async function runProof(opts) {
  const generation = opts.generation;
  const configDir = opts.configDir;
  const project = opts.project;
  const home = opts.home;
  const entry = opts.entry || entryPathFor(generation, configDir);
  const canaryPath = join(project, CANARY_NAME);
  const result = {
    generation,
    entry,
    blocked: false,
    blockMessage: null,
    canaryFile: "absent",
    metricEvents: 0,
    startupMarkers: 0,
    ok: false,
    fail: null,
  };

  // Precondition 1: the entry the generation loads must exist in the tree
  // under test.
  if (!existsSync(entry)) {
    result.fail = `generation ${generation} entry not found in config tree: ${entry}`;
    return result;
  }

  // Precondition 2: fail-closed state — no state.json under the sandbox home.
  // A present state file (or a wrongly-pointed HOME) voids the proof.
  const statePath = join(home, ".sisyphus", "state.json");
  if (existsSync(statePath)) {
    result.fail = `fail-closed precondition violated: state.json exists at ${statePath}`;
    return result;
  }

  // Precondition 3: clean project — no stale canary artifact.
  if (existsSync(canaryPath)) {
    result.fail = `canary artifact already present before the attempt: ${canaryPath}`;
    return result;
  }

  // Sandbox the plugin's path resolution: state, metrics, notepads, and the
  // verdict key all resolve from HOME read at call time.
  const savedHome = process.env.HOME;
  const savedLog = console.log;
  const savedWarn = console.warn;
  const captured = [];
  const capture = (...args) => {
    captured.push(args.map(String).join(" "));
  };
  let hookToFire = null;
  let eventArgs = null;

  try {
    process.env.HOME = home;
    console.log = capture;
    console.warn = capture;
    // The gate's writers (metrics, evidence log) must find their directories
    // under the sandbox home regardless of who prepared it.
    mkdirSync(join(home, ".sisyphus", "metrics"), { recursive: true });
    mkdirSync(join(home, ".sisyphus", "evidence"), { recursive: true });

    const mod = await importModule(entry);

    if (generation === "1") {
      // V1 shape guard: the 1.18.31 host calls the named `server` export of
      // dist/index.js, and that module must NOT also carry a default
      // definition — the dual shape double-instantiates under V1 (proven in
      // the adaptation sandbox).
      if (typeof mod.server !== "function") {
        result.fail = `generation 1 entry has no named server export: ${entry}`;
        return result;
      }
      if ("default" in mod) {
        result.fail = `generation 1 entry also exports default (double-instantiation shape): ${entry}`;
        return result;
      }
      // Options: same resolution the V1 host performs for the opencode.json
      // tuple. readOptionsFromConfig is the plugin's own owner of that
      // parsing (understands the tuple and object shapes).
      const { readOptionsFromConfig } = await importModule(
        join(configDir, "plugins", "sisyphus-gates", "src", "v2.js")
      );
      const options = readOptionsFromConfig(configDir);
      const hooks = await mod.server({ directory: configDir }, options);
      const execBefore = hooks && hooks["tool.execute.before"];
      if (typeof execBefore !== "function") {
        result.fail = "generation 1 server() returned no tool.execute.before hook";
        return result;
      }
      hookToFire = async () => {
        // V1 hook signature: (eventArgs, output) — output carries args.
        await execBefore(
          { tool: "write", sessionID: SESSION_ID, callID: "proof-1" },
          { args: { path: canaryPath, content: CANARY_CONTENT } }
        );
      };
    } else {
      // V2: default-exported definition; host calls setup(ctx).
      const definition = mod.default;
      if (!definition || definition.id !== "sisyphus-gates" || typeof definition.setup !== "function") {
        result.fail = `generation 2 entry is not the sisyphus-gates definition: ${entry}`;
        return result;
      }
      const registrations = [];
      const ctx = makeRecordingCtx(configDir, registrations);
      await definition.setup(ctx);
      const execBefore = registrations.find(
        (r) => r.surface === "tool" && r.name === "execute.before"
      );
      if (!execBefore) {
        result.fail = "generation 2 setup(ctx) registered no tool execute.before hook";
        return result;
      }
      hookToFire = async () => {
        // V2 hook signature: single event object; input carries the args.
        eventArgs = {
          sessionID: SESSION_ID,
          tool: "write",
          input: { filePath: canaryPath, content: CANARY_CONTENT },
        };
        await execBefore.cb(eventArgs);
      };
    }

    result.startupMarkers = countMarkers(captured);
    if (result.startupMarkers < 1) {
      result.fail = "gate produced no startup marker line ([sisyphus-gates]) during init";
      return result;
    }

    // ── The canary attempt, through the gate's own verdict path ──
    let threw = null;
    try {
      await hookToFire();
    } catch (err) {
      threw = err;
    }

    if (threw) {
      result.blocked = true;
      result.blockMessage = String(threw.message || threw);
      if (!result.blockMessage.includes("Gate blocked")) {
        result.fail = `hook threw a non-gate error: ${result.blockMessage}`;
        return result;
      }
      // This proof's precondition is fail-closed (no state.json): the verdict
      // must say so. Any other block reason means the sandbox leaked state.
      if (!/state file missing/i.test(result.blockMessage)) {
        result.fail = `block reason is not the fail-closed verdict: ${result.blockMessage}`;
        return result;
      }
    } else {
      // Mini-host semantics: no throw means the host would run the tool.
      mkdirSync(project, { recursive: true });
      writeFileSync(canaryPath, CANARY_CONTENT, "utf8");
      result.canaryFile = "present";
      result.fail = "gate did NOT block the write (fail-open): canary file was created";
      return result;
    }

    result.metricEvents = countSessionMetricEvents(home);
    if (result.metricEvents !== 1) {
      result.fail = `expected exactly 1 metric event for the blocked attempt, got ${result.metricEvents}`;
      return result;
    }

    if (existsSync(canaryPath)) {
      result.canaryFile = "present";
      result.fail = "canary artifact appeared despite the block";
      return result;
    }

    result.ok = true;
    return result;
  } catch (err) {
    result.fail = `harness error: ${err && err.stack ? err.stack : String(err)}`;
    return result;
  } finally {
    process.env.HOME = savedHome;
    console.log = savedLog;
    console.warn = savedWarn;
    void eventArgs;
  }
}

function report(result) {
  const line1 =
    `canary: generation=${result.generation} blocked=${result.blocked ? "yes" : "no"}` +
    ` canary_file=${result.canaryFile} metric_events=${result.metricEvents}` +
    ` startup_markers=${result.startupMarkers}`;
  process.stdout.write(line1 + "\n");
  if (result.blockMessage) {
    process.stdout.write(`canary: reason=${result.blockMessage}\n`);
  }
  if (result.fail) {
    process.stdout.write(`canary: fail=${result.fail}\n`);
  }
}

export async function main(argv) {
  const opts = parseArgs(argv);
  const result = await runProof(opts);
  report(result);
  return result.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)));
}
