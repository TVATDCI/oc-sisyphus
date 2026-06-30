#!/usr/bin/env node
/**
 * cli.js — operator-only signing CLI for sisyphus-gates.
 *
 * REPLACES the broken /sign-verdict and /approve slash commands. In opencode
 * v1.17.5, command.execute.before throws propagate as Die defects to the TUI,
 * making two-tap slash commands unusable. PR #18559 (cancelled field) is the
 * upstream fix but has been pending for 3+ months.
 *
 * This CLI is the production signing path. It imports the SAME crypto and
 * state modules as the plugin, so verification is identical. Slash commands
 * remain available as a fallback if/when opencode fixes the throw propagation.
 *
 * ─── Why a CLI instead of slash commands? ────────────────────────────────
 *
 * 1. Slash command throws break the TUI (opencode v1.17.5 regression).
 * 2. The CLI is operator-driven (interactive terminal), so the two-tap
 *    confirmation pattern is unnecessary — the operator already confirmed
 *    by typing the command.
 * 3. The CLI writes signed artifacts to ~/.sisyphus/notepads/cli/ which
 *    the plugin's loadSignedVerdicts scans on the next syncStateWithDisk.
 *    The plugin then updates gate status from the cryptographic signature.
 *
 * ─── Path alignment (critical) ───────────────────────────────────────────
 *
 * The in-plugin sign-verdict-handler writes via getBaseDir() = process.cwd(),
 * but loadSignedVerdicts reads via getNotepadsPath() = homedir(). In production
 * these differ (cwd = project dir, homedir = $HOME). The CLI writes to
 * homedir() so the plugin's verifier finds the artifacts.
 *
 * ─── Usage ───────────────────────────────────────────────────────────────
 *
 *   node cli.js sign-verdict <kind> <id> <decision>
 *     kind:     "prd" | "plan"
 *     id:       PRD or plan identifier (any non-empty string)
 *     decision: "PASS" | "FAIL" | "WARN"
 *
 *   node cli.js approve <plan_id>
 *     plan_id: identifier matching a previously-signed plan verdict
 *
 * Options (any subcommand):
 *   --key-command <cmd>   Override verdict_key_command
 *   --cwd <path>          Set working directory for project-name resolution
 *   --dry-run             Print what would be written; persist nothing
 *   -h, --help            Show help
 *
 * Exit codes: 0 success, 2 usage error, 3 key resolution failure, 4 write error.
 */

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

import { signVerdict } from "./src/verdict-signing.js";
import { writePersistentState } from "./src/state.js";
import { getProjectName } from "./src/project-state.js";
import { resolveMemoryKey } from "./src/memory-key.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const CLI_SESSION_ID = "cli";
const DEFAULT_KEY_COMMAND = "cat ~/.local/share/sisyphus-gate-key";
const VALID_KINDS = new Set(["prd", "plan"]);
const VALID_DECISIONS = new Set(["PASS", "FAIL", "WARN"]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function getNotepadsCliDir() {
  // CRITICAL: must match loadSignedVerdicts' getNotepadsPath() which uses
  // homedir(), NOT process.cwd(). See file header "Path alignment".
  return join(homedir(), ".sisyphus", "notepads", CLI_SESSION_ID);
}

function getAuditLogPath(suffix) {
  return join(homedir(), ".config", `sisyphus-${suffix}.log`);
}

function auditLog(suffix, line) {
  // Best-effort. Failure to write audit trail does NOT undo the signing —
  // the signed artifact is the load-bearing artifact, the audit log is
  // forensic. Mirrors the handler's auditVerdict pattern.
  try {
    const logPath = getAuditLogPath(suffix);
    try {
      mkdirSync(dirname(logPath), { recursive: true });
    } catch {
      // dir may already exist — ignore
    }
    appendFileSync(logPath, line + "\n", "utf-8");
  } catch (err) {
    process.stderr.write(`[cli] audit log write failed: ${err.message}\n`);
  }
}

function fail(msg, code = 2) {
  process.stderr.write(`⛔ ${msg}\n`);
  process.exit(code);
}

// ─── Arg parsing ────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { keyCommand: null, cwd: null, dryRun: false, help: false };
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--key-command") {
      opts.keyCommand = args[++i];
      if (!opts.keyCommand) fail("--key-command requires a value");
      continue;
    }
    if (a === "--cwd") {
      opts.cwd = args[++i];
      if (!opts.cwd) fail("--cwd requires a path");
      continue;
    }
    if (a === "--dry-run") {
      opts.dryRun = true;
      continue;
    }
    if (a === "-h" || a === "--help") {
      opts.help = true;
      continue;
    }
    if (a.startsWith("--")) {
      fail(`Unknown option: ${a}`);
    }
    positional.push(a);
  }

  return { opts, positional };
}

export function resolveKeyCommand(opts) {
  // Priority: --key-command flag → env → opencode.json.full → opencode.json → default.
  if (opts.keyCommand) return opts.keyCommand;
  if (process.env.SISYPHUS_VERDICT_KEY_COMMAND) {
    return process.env.SISYPHUS_VERDICT_KEY_COMMAND;
  }

  const candidates = [
    join(homedir(), ".config", "opencode", "opencode.json.full"),
    join(homedir(), ".config", "opencode", "opencode.json"),
  ];
  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) continue;
      const config = JSON.parse(readFileSync(candidate, "utf-8"));
      const plugins = Array.isArray(config.plugin) ? config.plugin : [];
      const entry = plugins.find(
        (p) => Array.isArray(p) && p[0] && typeof p[0] === "string" && p[0].includes("sisyphus-gates")
      );
      if (entry && entry[1] && typeof entry[1].verdict_key_command === "string") {
        return entry[1].verdict_key_command;
      }
    } catch {
      // unreadable/unparseable — try next candidate
    }
  }

  return DEFAULT_KEY_COMMAND;
}

function showHelp() {
  process.stdout.write(`sisyphus-gates CLI — operator-only signing path

Usage:
  node cli.js sign-verdict <kind> <id> <decision>
    kind      "prd" | "plan"
    id        PRD or plan identifier
    decision  "PASS" | "FAIL" | "WARN"

  node cli.js approve <plan_id>
    plan_id   identifier matching a previously-signed plan verdict

Options:
  --key-command <cmd>   Override verdict_key_command
  --cwd <path>          Set working directory for project-name resolution
  --dry-run             Show what would be written; persist nothing
  -h, --help            Show this help

Exit codes:
  0  success
  2  usage error
  3  MEMORY_KEY resolution failure
  4  artifact / state write failure

The CLI writes signed artifacts to ~/.sisyphus/notepads/cli/. The plugin
picks them up via loadSignedVerdicts on the next syncStateWithDisk call.
`);
}

// ─── Subcommands ────────────────────────────────────────────────────────────

export function cmdSignVerdict(positional, opts) {
  const [kind, id, decision] = positional;

  if (!kind || !id || !decision) {
    fail("Usage: sign-verdict <kind> <id> <decision>");
  }
  if (!VALID_KINDS.has(kind)) {
    fail(`Invalid kind "${kind}". Must be one of: ${[...VALID_KINDS].join(", ")}`);
  }
  if (!VALID_DECISIONS.has(decision)) {
    fail(`Invalid decision "${decision}". Must be one of: ${[...VALID_DECISIONS].join(", ")}`);
  }

  const keyCommand = resolveKeyCommand(opts);
  const memoryKey = resolveMemoryKey({ verdict_key_command: keyCommand });
  if (!memoryKey) {
    fail(`Failed to resolve MEMORY_KEY from: ${keyCommand}`, 3);
  }

  const signed_at = new Date().toISOString();
  const payload = {
    kind,
    decision,
    id,
    schema_version: "2.0.0",
    signed_at,
    sessionID: CLI_SESSION_ID,
    operator: "primary",
  };

  const sig = signVerdict(payload, memoryKey);

  // Write artifact to the path loadSignedVerdicts scans (homedir-based).
  const cliDir = getNotepadsCliDir();
  const safeTimestamp = signed_at.replace(/[:.]/g, "-");
  const filePath = join(cliDir, `momus-${kind}-review-${safeTimestamp}.md`);
  const content =
    `<!-- SISYPHUS_GATE ${JSON.stringify(payload)} -->\n` +
    `<!-- SISYPHUS_GATE_SIG ${JSON.stringify(sig)} -->\n`;

  if (opts.dryRun) {
    process.stdout.write(`[dry-run] Would write artifact:\n  ${filePath}\n${content}`);
    if (decision === "PASS") {
      process.stdout.write(
        `[dry-run] Would update persistent state for project "${getProjectName(process.cwd())}":\n`
      );
      if (kind === "prd") {
        process.stdout.write(`  phase=issue-creation, prd_gate=PASS, prd_id=${id}\n`);
      } else {
        process.stdout.write(`  plan_gate=PASS, plan_id=${id}\n`);
      }
    } else {
      process.stdout.write(
        `[dry-run] No state mutation (decision=${decision} !== PASS; signed verdict still recorded).\n`
      );
    }
    return;
  }

  try {
    try {
      mkdirSync(cliDir, { recursive: true });
    } catch {
      // dir exists — writeFileSync will surface real errors
    }
    writeFileSync(filePath, content, "utf-8");
  } catch (err) {
    fail(`Failed to write verdict artifact: ${err.message}`, 4);
  }

  // Update persistent state so plugin hydrates state.prdId/state.planId and
  // (for PRD) advances phase to issue-creation. Mirrors what the original
  // handler did before the if(false) escape hatch was added.
  //
  // Security invariant: only PASS verdicts advance state (mirrors phase-machine.js
  // advanceAfterSign's `if (verdict.decision !== "PASS") return;` guard).
  // FAIL/WARN are signed for audit only — recording them in state would let
  // a FAIL verdict wrongly unlock the next phase.
  if (decision !== "PASS") {
    process.stdout.write(
      `  Decision=${decision} recorded in signed artifact; no workflow advancement.\n`
    );
    return;
  }

  const projectName = getProjectName(process.cwd());
  try {
    if (kind === "prd") {
      writePersistentState(
        projectName,
        { phase: "issue-creation", prdGate: "PASS" },
        { prd_id: id }
      );
    } else {
      writePersistentState(projectName, { planGate: "PASS" }, { plan_id: id });
    }
  } catch (err) {
    process.stderr.write(
      `[cli] WARN: signed artifact written but persistent state update failed: ${err.message}\n`
    );
    process.stderr.write(
      `[cli] The signed verdict is still valid; plugin will pick up gate status from the artifact.\n`
    );
  }

  auditLog(
    "verdicts",
    `${signed_at} session=${CLI_SESSION_ID} kind=${kind} id=${id} ` +
      `decision=${decision} result=SUCCESS operator=primary`
  );

  const phaseNote =
    kind === "prd"
      ? `Phase advanced to: issue-creation`
      : `Plan gate set to PASS. Run: node cli.js approve ${id}`;
  process.stdout.write(
    `✓ Signed ${kind} verdict: ${id} ${decision}\n` +
      `  Artifact: ${filePath}\n` +
      `  ${phaseNote}\n` +
      `  Plugin will sync on next hook fire.\n`
  );
}

export function cmdApprove(positional, opts) {
  const [planId] = positional;

  if (!planId) {
    fail("Usage: approve <plan_id>");
  }

  const keyCommand = resolveKeyCommand(opts);
  const memoryKey = resolveMemoryKey({ verdict_key_command: keyCommand });
  if (!memoryKey) {
    fail(`Failed to resolve MEMORY_KEY from: ${keyCommand}`, 3);
  }

  // NOTE: We do NOT check planGateStatus=PASS here. The CLI is operator-driven;
  // if the operator explicitly approves a plan without a signed verdict, that
  // is their decision. The plugin's in-process /approve handler checks
  // prerequisites as a safety net, but the CLI trusts the operator.
  // The signed approval artifact is the audit trail.

  const signed_at = new Date().toISOString();
  const payload = {
    decision: "approved",
    kind: "plan",
    operator: "primary",
    plan_id: planId,
    schema_version: "1.0.0",
    sessionID: CLI_SESSION_ID,
    signed_at,
  };
  const sig = signVerdict(payload, memoryKey);

  const cliDir = getNotepadsCliDir();
  const safeTimestamp = signed_at.replace(/[:.]/g, "-");
  const filePath = join(cliDir, `momus-plan-approval-${safeTimestamp}.md`);
  const content =
    `<!-- SISYPHUS_APPROVE ${JSON.stringify(payload)} -->\n` +
    `<!-- SISYPHUS_APPROVE_SIG ${JSON.stringify(sig)} -->\n`;

  if (opts.dryRun) {
    process.stdout.write(`[dry-run] Would write artifact:\n  ${filePath}\n${content}`);
    process.stdout.write(
      `[dry-run] Would update persistent state for project "${getProjectName(process.cwd())}":\n`
    );
    process.stdout.write(`  phase=execution, approvalStatus=approved, plan_id=${planId}\n`);
    return;
  }

  try {
    try {
      mkdirSync(cliDir, { recursive: true });
    } catch {
      // dir exists
    }
    writeFileSync(filePath, content, "utf-8");
  } catch (err) {
    fail(`Failed to write approval artifact: ${err.message}`, 4);
  }

  // Atomic-ish state mutation: phase=execution + approvalStatus=approved.
  // Plugin reads these from persistent state on next syncStateWithDisk.
  // plan_id is also written so downstream tools can correlate.
  const projectName = getProjectName(process.cwd());
  try {
    writePersistentState(
      projectName,
      { phase: "execution", approvalStatus: "approved" },
      { plan_id: planId }
    );
  } catch (err) {
    process.stderr.write(
      `[cli] WARN: signed artifact written but persistent state update failed: ${err.message}\n`
    );
    process.stderr.write(
      `[cli] The signed approval is recorded, but the gate may not open until state is updated.\n`
    );
  }

  auditLog(
    "approvals",
    `${signed_at} session=${CLI_SESSION_ID} kind=plan plan_id=${planId} ` +
      `result=SUCCESS operator=primary`
  );

  process.stdout.write(
    `✓ Approved plan: ${planId}\n` +
      `  Artifact: ${filePath}\n` +
      `  State: phase=execution, approvalStatus=approved\n` +
      `  Gate will open on plugin's next sync.\n`
  );
}
export function cmdProtocol(positional, opts) {
  var action = positional[0];
  var protocolName = positional[1];

  if (action !== 'start' && action !== 'complete' && action !== 'override') {
    fail("Unknown protocol action '" + action + "'. Use: start | complete | override.");
  }
  if (protocolName !== 'session-close') {
    fail("Unknown protocol '" + protocolName + "'. MVP supports only 'session-close'.");
  }
  if (action === 'override' && !opts.reason) {
    fail('--reason <text> is required for protocol override.');
  }

  var projectName = getProjectName(opts.cwd || process.cwd());

  // Read current state to preserve session_close prior fields
  var statePath = join(homedir(), '.sisyphus', 'state.json');
  var currentSc = {};
  if (existsSync(statePath)) {
    try {
      var state = JSON.parse(readFileSync(statePath, 'utf-8'));
      currentSc = state.session_close || {};
    } catch (e) { /* default empty */ }
  }

  var now = new Date().toISOString();
  var newSc;
  var summary;

  if (action === 'start') {
    newSc = Object.assign({}, currentSc, {
      status: 'open',
      started_at: now,
      completed_at: undefined,
      override_reason: undefined,
      override_at: undefined
    });
    summary = 'OPEN (started_at=' + now + ')';
  } else if (action === 'complete') {
    newSc = Object.assign({}, currentSc, {
      status: 'complete',
      completed_at: now
    });
    summary = 'COMPLETE (completed_at=' + now + ')';
  } else {
    newSc = Object.assign({}, currentSc, {
      status: 'overridden',
      override_reason: opts.reason,
      override_at: now
    });
    summary = 'OVERRIDDEN (reason="' + opts.reason + '")';
  }

  if (opts.dryRun) {
    process.stdout.write('[dry-run] Would write: state.session_close = ' + JSON.stringify(newSc) + '\n');
    return;
  }

  writePersistentState(projectName, {}, { session_close: newSc });

  process.stdout.write(
    '\u2713 Protocol ' + summary + '\n' +
    '  Gate will ' + (newSc.status === 'open' ? 'BLOCK' : 'ALLOW') + ' git push / bd dolt push.\n'
  );
}


// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const { opts, positional } = parseArgs(process.argv);

  if (opts.help) {
    showHelp();
    process.exit(0);
  }
  if (positional.length === 0) {
    showHelp();
    process.exit(2);
  }

  if (opts.cwd) {
    try {
      process.chdir(opts.cwd);
    } catch (err) {
      fail(`--cwd ${opts.cwd}: ${err.message}`);
    }
  }

  const [subcommand, ...rest] = positional;

  switch (subcommand) {
    case "sign-verdict":
      cmdSignVerdict(rest, opts);
      break;
    case "approve":
      cmdApprove(rest, opts);
      break;
    default:
      fail(`Unknown subcommand: ${subcommand}`);
  }
}

// Only run main() when executed directly via `node cli.js …`, not when
// imported for testing. This is the standard ESM main-module guard.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
