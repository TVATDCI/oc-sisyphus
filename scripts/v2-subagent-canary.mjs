#!/usr/bin/env node
/**
 * v2-subagent-canary.mjs — deterministic canary for v2-subagent-proof.sh.
 *
 * Drives the sisyphus-gates V2 entry (plugins/sisyphus-gates.js default
 * setup(ctx), imported from the proof sandbox) and fires TWO events carrying
 * a REAL child-session identity (created via the host API with parentID —
 * the native subagent topology):
 *
 *   event A: tool=bash, catastrophic command (Layer 1) — must be BLOCKED by
 *            the gate's own verdict path ("Catastrophic command blocked")
 *   event B: tool=write under fail-closed state (no state.json) — must be
 *            BLOCKED with the fail-closed reason ("state file missing")
 *
 * Asserts per attempt: blocked-by-gate, exactly one metric event recorded
 * under the child sessionID, no canary artifact. Mini-host semantics (same
 * as v2-proof-canary.mjs): if the hook does not throw, the harness EXECUTES
 * the canary action, so a fail-open gate fails the proof.
 *
 * Usage:
 *   node scripts/v2-subagent-canary.mjs --config-dir DIR --project DIR \
 *        --home DIR --session SESSION_ID
 * Exit: 0 = proven; 1 = not proven; 2 = usage
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function failUsage(msg) {
  process.stderr.write(`usage error: ${msg}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { configDir: null, project: null, home: null, session: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => (argv[++i] !== undefined ? argv[i] : failUsage(`${a} requires a value`));
    if (a === "--config-dir") opts.configDir = next();
    else if (a === "--project") opts.project = next();
    else if (a === "--home") opts.home = next();
    else if (a === "--session") opts.session = next();
    else failUsage(`unknown argument: ${a}`);
  }
  if (!opts.configDir) failUsage("--config-dir is required");
  if (!opts.project) failUsage("--project is required");
  if (!opts.home) failUsage("--home is required");
  if (!opts.session) failUsage("--session is required");
  return opts;
}

function makeRecordingCtx(configDir, registrations) {
  const record = (surface, name, cb) => registrations.push({ surface, name, cb });
  return {
    location: { directory: configDir },
    options: {},
    tool: { hook: (name, cb) => record("tool", name, cb) },
    permission: { hook: (name, cb) => record("permission", name, cb) },
    session: { hook: (name, cb) => record("session", name, cb) },
    command: { transform: (fn) => record("command", "transform", fn) },
  };
}

function countMarkers(lines) {
  return lines.filter((l) => l.includes("[sisyphus-gates]")).length;
}

function metricEventsFor(home, sessionID) {
  const p = join(home, ".sisyphus", "metrics", "gate-events.jsonl");
  if (!existsSync(p)) return 0;
  let n = 0;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (line.trim() && line.includes(`"sessionID":"${sessionID}"`)) n++;
  }
  return n;
}

const CATASTROPHIC = "rm -rf / --no-preserve-root";
const CANARY_NAME = "subagent-pwned.txt";

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const entry = join(opts.configDir, "plugins", "sisyphus-gates.js");
  const statePath = join(opts.home, ".sisyphus", "state.json");
  const canaryPath = join(opts.project, CANARY_NAME);
  const results = [];

  if (!existsSync(entry)) {
    console.log(`canary: fail=entry not found in sandbox tree: ${entry}`);
    return 1;
  }
  if (existsSync(statePath)) {
    console.log(`canary: fail=fail-closed precondition violated (state.json present)`);
    return 1;
  }
  if (existsSync(canaryPath)) {
    console.log(`canary: fail=stale canary artifact present`);
    return 1;
  }

  const savedHome = process.env.HOME;
  const savedLog = console.log;
  const savedWarn = console.warn;
  const captured = [];
  const capture = (...args) => captured.push(args.map(String).join(" "));
  try {
    process.env.HOME = opts.home;
    console.log = capture;
    console.warn = capture;
    mkdirSync(join(opts.home, ".sisyphus", "metrics"), { recursive: true });
    mkdirSync(join(opts.home, ".sisyphus", "evidence"), { recursive: true });

    const mod = await import(pathToFileURL(entry).href);
    const definition = mod.default;
    if (!definition || definition.id !== "sisyphus-gates" || typeof definition.setup !== "function") {
      console.log = savedLog;
      console.log("canary: fail=sandbox entry is not the sisyphus-gates definition");
      return 1;
    }
    const registrations = [];
    const ctx = makeRecordingCtx(opts.configDir, registrations);
    await definition.setup(ctx);
    const execBefore = registrations.find((r) => r.surface === "tool" && r.name === "execute.before");
    if (!execBefore) {
      console.log = savedLog;
      console.log("canary: fail=no tool execute.before hook registered");
      return 1;
    }
    const markers = countMarkers(captured);
    console.log = savedLog;
    if (markers < 1) {
      console.log("canary: fail=no startup marker during init");
      return 1;
    }

    // ── Event A: gated COMMAND (bash, Layer-1 catastrophic) ──
    {
      const before = metricEventsFor(opts.home, opts.session);
      let threw = null;
      try {
        await execBefore.cb({
          sessionID: opts.session,
          tool: "bash",
          input: { command: CATASTROPHIC },
        });
      } catch (err) {
        threw = err;
      }
      const after = metricEventsFor(opts.home, opts.session);
      const blocked = Boolean(threw);
      const gateReason = threw ? String(threw.message || threw) : "";
      const correctReason = /catastrophic/i.test(gateReason);
      if (!blocked) {
        // mini-host: execute the canary action so fail-open fails the proof
        writeFileSync(canaryPath, "canary\n", "utf8");
      }
      results.push({
        event: "gated-command",
        blocked,
        reason: gateReason.slice(0, 120),
        correct_semantics: blocked && correctReason,
        metric_events: after - before,
      });
    }

    // ── Event B: gated WRITE under fail-closed ──
    {
      const before = metricEventsFor(opts.home, opts.session);
      let threw = null;
      try {
        await execBefore.cb({
          sessionID: opts.session,
          tool: "write",
          input: { filePath: canaryPath, content: "canary" },
        });
      } catch (err) {
        threw = err;
      }
      const after = metricEventsFor(opts.home, opts.session);
      const blocked = Boolean(threw);
      const gateReason = threw ? String(threw.message || threw) : "";
      const correctReason = /state file missing/i.test(gateReason) || /Gate blocked/i.test(gateReason);
      if (!blocked) {
        writeFileSync(canaryPath, "canary\n", "utf8");
      }
      results.push({
        event: "gated-write",
        blocked,
        reason: gateReason.slice(0, 120),
        correct_semantics: blocked && correctReason,
        metric_events: after - before,
      });
    }

    let ok = true;
    for (const r of results) {
      const pass = r.blocked && r.correct_semantics && r.metric_events === 1;
      if (!pass) ok = false;
      console.log(
        `canary: ${r.event} blocked=${r.blocked ? "yes" : "no"} ` +
        `semantics=${r.correct_semantics ? "correct" : "WRONG"} ` +
        `metric_events=${r.metric_events} (need exactly 1)`
      );
      if (r.reason) console.log(`canary: ${r.event} reason=${r.reason}`);
    }
    if (existsSync(canaryPath)) {
      console.log("canary: fail=canary artifact appeared (fail-open path executed)");
      ok = false;
    }
    console.log(`canary: session=${opts.session} startup_markers=${markers}`);
    console.log(`canary: verdict=${ok ? "PROVEN" : "NOT_PROVEN"}`);
    return ok ? 0 : 1;
  } catch (err) {
    console.log = savedLog;
    console.warn = savedWarn;
    console.log(`canary: fail=harness error: ${err && err.stack ? err.stack : String(err)}`);
    return 1;
  } finally {
    process.env.HOME = savedHome;
    console.log = savedLog;
    console.warn = savedWarn;
  }
}

process.exit(await main());
