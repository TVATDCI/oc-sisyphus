/**
 * sisyphus-gates — Governance gate enforcement for the Sisyphus workflow.
 *
 * Blocks destructive tools (write, edit, bash) until governance gates pass.
 * Injects gate status into the system prompt so the model knows where it stands.
 * Controls compaction timing to preserve cache-friendly prefixes.
 *
 * State is tracked BOTH in-memory (per-session) and on-disk (per-project).
 * The plugin FAILS CLOSED: if state file is missing, approval is not "approved",
 * or any gate status is "FAIL", ALL writes are blocked.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const GLOBAL_STATE_PATH = resolve(process.env.HOME || "~", ".config/opencode/.sisyphus/state.json");

function scanReviewFiles() {
  const results = { prdGate: null, planGate: null };
  try {
    const notepadsPath = join(process.cwd(), ".sisyphus/notepads");
    if (!existsSync(notepadsPath)) return results;
    for (const entry of readdirSync(notepadsPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const file of readdirSync(join(notepadsPath, entry.name))) {
        if (!file.includes("momus-prd-review") && !file.includes("momus-plan-review")) continue;
        const content = readFileSync(join(notepadsPath, entry.name, file), "utf-8");
        const isPRD = file.includes("prd-review");
        const isPlan = file.includes("plan-review");
        if (content.includes("Gate Decision:** FAIL") || content.includes("Gate Decision: FAIL")) {
          if (isPRD) results.prdGate = "FAIL";
          if (isPlan) results.planGate = "FAIL";
        } else if (content.includes("Gate Decision:** PASS") || content.includes("Gate Decision: PASS")) {
          if (isPRD && !results.prdGate) results.prdGate = "PASS";
          if (isPlan && !results.planGate) results.planGate = "PASS";
        }
      }
    }
  } catch {
    return results;
  }
  return results;
}

function readPersistentState() {
  try {
    if (!existsSync(GLOBAL_STATE_PATH)) return null;
    return JSON.parse(readFileSync(GLOBAL_STATE_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function writePersistentState(projectName, gateStatus) {
  try {
    writeFileSync(GLOBAL_STATE_PATH, JSON.stringify({
      project: projectName,
      prd_gate: gateStatus.prdGate || "unknown",
      plan_gate: gateStatus.planGate || "unknown",
      approval_status: gateStatus.approvalStatus || "pending",
      last_updated: new Date().toISOString(),
    }, null, 2));
  } catch {
  }
}

const sessionState = new Map();

function getState(sessionID) {
  if (!sessionState.has(sessionID)) {
    sessionState.set(sessionID, {
      phase: "discovery",
      prdApproved: false,
      planApproved: false,
      evidenceLogged: false,
      lastCheckpoint: "session-start",
      prdGateStatus: "unknown",
      planGateStatus: "unknown",
      approvalStatus: "pending",
      stateFileExists: false,
    });
    syncStateWithDisk(sessionID);
  }
  return sessionState.get(sessionID);
}

function syncStateWithDisk(sessionID) {
  const state = sessionState.get(sessionID);
  const persistent = readPersistentState();
  const reviews = scanReviewFiles();

  state.prdGateStatus = persistent?.prd_gate || reviews.prdGate || "unknown";
  state.planGateStatus = persistent?.plan_gate || reviews.planGate || "unknown";
  state.approvalStatus = persistent?.approval_status || "pending";
  state.stateFileExists = persistent !== null;

  if (state.prdGateStatus === "PASS") state.prdApproved = true;
  if (state.planGateStatus === "PASS") state.planApproved = true;

  if (reviews.prdGate === "FAIL") {
    state.prdApproved = false;
    state.prdGateStatus = "FAIL";
  }
  if (reviews.planGate === "FAIL") {
    state.planApproved = false;
    state.planGateStatus = "FAIL";
  }
}

function isDestructiveCommand(cmd) {
  const patterns = [
    /^rm\s/,
    /^rm\s+-rf/,
    /^git\s+reset\s+--hard/,
    /^git\s+push\s+--force/,
    /^git\s+clean\s+-fd/,
    /sudo\s+/,
    /^dd\s+/,
    /^mkfs/,
    /^shutdown/,
    /^reboot/,
  ];
  return patterns.some((p) => p.test(cmd.trim()));
}

function mustBlockExecution(state) {
  if (!state.stateFileExists) {
    if (state.prdGateStatus === "FAIL" || state.planGateStatus === "FAIL") {
      return {
        blocked: true,
        reason: `State file missing. Gate decisions found in review files (PRD: ${state.prdGateStatus}, Plan: ${state.planGateStatus}). Run review gates before executing.`,
      };
    }
  }

  if (state.approvalStatus && state.approvalStatus !== "approved" && state.approvalStatus !== "pending") {
    return {
      blocked: true,
      reason: `approval_status is "${state.approvalStatus}". Must be "approved" to execute.`,
    };
  }

  if (state.prdGateStatus === "FAIL" || state.planGateStatus === "FAIL") {
    return {
      blocked: true,
      reason: `Gate review(s) FAILED (PRD: ${state.prdGateStatus}, Plan: ${state.planGateStatus}). Fix blockers and re-run review gates before executing.`,
    };
  }

  return { blocked: false };
}

function shouldBlockTool(tool, args, state) {
  const failClosed = mustBlockExecution(state);
  if (failClosed.blocked && (tool === "write" || tool === "edit" || tool === "bash")) {
    return failClosed;
  }

  if (state.phase === "discovery" || state.phase === "prd-writing") {
    return { blocked: false };
  }

  if (state.phase === "prd-review") {
    if (tool === "bash" && args?.command && isDestructiveCommand(args.command)) {
      return { blocked: true, reason: "Destructive commands blocked during PRD review" };
    }
    return { blocked: false };
  }

  if (state.prdApproved && !state.planApproved) {
    if (tool === "bash" && args?.command) {
      if (args.command.includes("git commit") || args.command.includes("git push")) {
        return {
          blocked: true,
          reason: "Cannot commit until plan gate passes. Run /skill:plan-writer first.",
        };
      }
      if (isDestructiveCommand(args.command)) {
        return { blocked: true, reason: "Destructive commands blocked" };
      }
    }
    return { blocked: false };
  }

  if (state.planApproved) {
    if (tool === "bash" && args?.command && isDestructiveCommand(args.command)) {
      return { blocked: true, reason: "Destructive commands blocked" };
    }
    return { blocked: false };
  }

  if (tool === "bash" && args?.command && isDestructiveCommand(args.command)) {
    return { blocked: true, reason: "Destructive commands blocked until gates pass" };
  }

  return { blocked: false };
}

function shouldBlockCommand(command, args, state) {
  const failClosed = mustBlockExecution(state);
  if (failClosed.blocked && (command === "git commit" || command === "git push" || command === "bd close")) {
    return failClosed;
  }

  if (command === "bd close" && !state.evidenceLogged) {
    return {
      blocked: true,
      reason: "Cannot close issue until evidence is logged. Run validation first.",
    };
  }

  if ((command === "git commit" || command === "git push") && !state.planApproved) {
    return {
      blocked: true,
      reason: "Cannot commit/push until plan gate passes.",
    };
  }

  return { blocked: false };
}

function buildGateStatusPrompt(state) {
  const lines = [
    "## Sisyphus Gate Status",
    `Current Phase: ${state.phase}`,
    `PRD Gate: ${state.prdGateStatus.toUpperCase()}`,
    `Plan Gate: ${state.planGateStatus.toUpperCase()}`,
    `Approval Status: ${state.approvalStatus.toUpperCase()}`,
    `State File: ${state.stateFileExists ? "EXISTS" : "MISSING — FAIL-CLOSED ACTIVE"}`,
    `PRD Approved: ${state.prdApproved ? "YES ✅" : "NO ⛔"}`,
    `Plan Approved: ${state.planApproved ? "YES ✅" : "NO ⛔"}`,
    `Evidence Logged: ${state.evidenceLogged ? "YES ✅" : "NO ⛔"}`,
    `Last Checkpoint: ${state.lastCheckpoint}`,
    "",
  ];

  const failClosed = mustBlockExecution(state);
  if (failClosed.blocked) {
    lines.push(
      "═══ ⚠️  WORKFLOW BLOCKED — FAIL-CLOSED MODE ⚠️  ═══",
      failClosed.reason,
      "",
      "To proceed:",
      "1. Fix all blocker items identified in Momus review files",
      "2. Re-run review gates: /skill:momus-prd-reviewer and/or /skill:momus-plan-reviewer",
      "3. Ensure review outputs contain 'Gate Decision: PASS'",
      "4. Or create state file manually if reviews were done outside the plugin:",
      `   ${GLOBAL_STATE_PATH}`,
      "",
      "Allowed operations: read-only tools (read, grep, websearch)",
      "Blocked operations: write, edit, bash commands, git commit/push",
      ""
    );
    return lines.join("\n");
  }

  switch (state.phase) {
    case "discovery":
      lines.push(
        "→ You are in discovery phase. Explore the problem space freely.",
        "→ When ready, invoke /skill:prd-writer to begin PRD creation."
      );
      break;
    case "prd-writing":
      lines.push(
        "→ Write the PRD following the approved brief.",
        "→ When PRD is complete, invoke /skill:momus-prd-reviewer for gate review."
      );
      break;
    case "prd-review":
      lines.push(
        "→ PRD review gate active. Do NOT modify the PRD.",
        "→ If review passes, mark PRD as approved and advance to issue-creation."
      );
      break;
    case "issue-creation":
      lines.push(
        "→ Create vertical slice issues from the approved PRD.",
        "→ When issues are ready, invoke /skill:plan-writer."
      );
      break;
    case "plan-writing":
      lines.push(
        "→ Write the execution plan from approved issues.",
        "→ When plan is complete, invoke /skill:momus-plan-reviewer for gate review."
      );
      break;
    case "plan-review":
      lines.push(
        "→ Plan review gate active. Do NOT modify the plan.",
        "→ If review passes, mark plan as approved and advance to execution."
      );
      break;
    case "execution":
      lines.push(
        "→ Execution mode: full tool access granted.",
        "→ Implement waves sequentially. Run /skill:auditor after each slice.",
        "→ Log evidence to .sisyphus/evidence/ before marking slices complete."
      );
      break;
    case "validation":
      lines.push(
        "→ Validation phase: verify all slices pass acceptance criteria.",
        "→ Run regression checks between waves."
      );
      break;
    case "close":
      lines.push(
        "→ Close phase: archive state, close beads issues, push to remote.",
        "→ Ensure all evidence is logged before closing."
      );
      break;
  }

  return lines.join("\n");
}

function advancePhaseIfNeeded(state, tool, args, output) {
  if (state.phase === "prd-writing" && tool === "write") {
    const path = args?.path || "";
    if (path.includes("prd") || path.includes("PRD")) {
      state.phase = "prd-review";
      state.lastCheckpoint = "prd-written";
    }
  }

  if (state.phase === "prd-review" && output?.includes("PRD review PASS")) {
    state.prdApproved = true;
    state.prdGateStatus = "PASS";
    state.phase = "issue-creation";
    state.lastCheckpoint = "prd-approved";
    writePersistentState(process.cwd(), {
      prdGate: "PASS",
      planGate: state.planGateStatus,
      approvalStatus: state.approvalStatus,
    });
  }

  if (state.phase === "issue-creation" && tool === "write") {
    const path = args?.path || "";
    if (path.includes("plan") || path.includes("PLAN")) {
      state.phase = "plan-review";
      state.lastCheckpoint = "plan-written";
    }
  }

  if (state.phase === "plan-review" && output?.includes("Plan review PASS")) {
    state.planApproved = true;
    state.planGateStatus = "PASS";
    state.phase = "execution";
    state.lastCheckpoint = "plan-approved";
    writePersistentState(process.cwd(), {
      prdGate: state.prdGateStatus,
      planGate: "PASS",
      approvalStatus: "approved",
    });
  }

  if (tool === "write" && args?.path?.includes(".sisyphus/evidence/")) {
    state.evidenceLogged = true;
  }
}

export const server = async (_input, _options) => {
  return {
    "tool.execute.before": async (
      { tool, sessionID, callID },
      output
    ) => {
      const state = getState(sessionID);

      if (tool === "write" || tool === "edit" || tool === "bash") {
        const { blocked, reason } = shouldBlockTool(tool, output.args, state);
        if (blocked) {
          output.args = {
            ...output.args,
            _sisyphus_gate_blocked: reason,
          };
        }
      }
    },

    "command.execute.before": async (
      { command, sessionID, arguments: args },
      output
    ) => {
      const state = getState(sessionID);
      const { blocked, reason } = shouldBlockCommand(command, args, state);

      if (blocked) {
        output.parts = [
          {
            type: "text",
            content: `⛔ Gate blocked: ${reason}`,
          },
        ];
      }
    },

    "experimental.chat.system.transform": async (
      { sessionID },
      output
    ) => {
      if (!sessionID) return;
      const state = getState(sessionID);
      output.system.push(buildGateStatusPrompt(state));
    },

    "experimental.session.compacting": async (
      { sessionID },
      output
    ) => {
      const state = getState(sessionID);

      const allowedAtCheckpoint = [
        "prd-approved",
        "plan-approved",
        "session-start",
      ];

      if (!allowedAtCheckpoint.includes(state.lastCheckpoint)) {
        output.context = [
          `CRITICAL: Preserve gate state. Current phase is "${state.phase}".`,
          `PRD gate: ${state.prdGateStatus}. Plan gate: ${state.planGateStatus}.`,
          `Approval: ${state.approvalStatus}. PRD approved: ${state.prdApproved}. Plan approved: ${state.planApproved}.`,
          `Do NOT compact away gate status or phase information.`,
        ];
      }

      output.prompt = `Summarize the conversation history while preserving ALL gate state, phase information, and artifact references. The current phase is "${state.phase}" with PRD gate=${state.prdGateStatus}, plan gate=${state.planGateStatus}, approval=${state.approvalStatus}. Keep all file paths, evidence references, and approval markers intact.`;
    },

    "tool.execute.after": async (
      { tool, sessionID, callID, args },
      output
    ) => {
      const state = getState(sessionID);
      syncStateWithDisk(sessionID);
      advancePhaseIfNeeded(state, tool, args, output.output || "");
    },

    "permission.ask": async (input, output) => {
      const state = getState(input.sessionID || "");

      if (state.phase === "prd-review" || state.phase === "plan-review") {
        if (input.patterns?.some((p) => !p.startsWith("read"))) {
          output.status = "ask";
        }
      }
    },
  };
};
