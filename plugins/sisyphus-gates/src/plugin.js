/**
 * plugin.js — the opencode plugin server() entry point.
 *
 * W1.A changes (the security fix):
 *   - shouldBlockTool now actually sets output.parts to block tool calls
 *     when fail-closed triggers. Annotation remains for forensic logging.
 *   - All hooks continue to call getState(sessionID), which now reads
 *     the canonical ~/.sisyphus/state.json (not the legacy sidecar).
 *
 * W1.E: server() now calls loadWorkflowConfig() at startup so the
 * yaml-driven phase machine has its config loaded before any hook fires.
 * If the workflow.yaml is missing or invalid, a warning is logged and
 * the plugin runs in fail-closed mode (gates.js will refuse execution).
 */

import { getState, syncStateWithDisk } from "./state.js";
import { shouldBlockTool, shouldBlockCommand } from "./gates.js";
import { advancePhaseIfNeeded, buildGateStatusPrompt } from "./phase-machine.js";
import { loadWorkflowConfig } from "./workflow-loader.js";
import { recordEvent } from "./metrics.js";

export const server = async (_input, _options) => {
  // W1.E: load the workflow config up front so the yaml-driven phase
  // machine and gate prompt have something to consume. Errors are caught
  // and logged so the plugin can still start (in fail-closed mode).
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

  return {
    "tool.execute.before": async (
      { tool, sessionID, callID },
      output
    ) => {
      const state = getState(sessionID);

      if (tool === "write" || tool === "edit" || tool === "bash") {
        const decision = shouldBlockTool(tool, output.args, state);
        if (decision.blocked) {
          output.args = {
            ...output.args,
            _sisyphus_gate_blocked: decision.reason,
          };
          if (decision.blockTool) {
            output.parts = [
              {
                type: "text",
                content: `⛔ Gate blocked: ${decision.reason}`,
              },
            ];
          }
          recordEvent({
            sessionID,
            tool,
            phase: state.phase,
            reason: decision.reason,
            command: tool === "bash" ? output.args?.command : undefined,
          });
        }
      }
    },

    "command.execute.before": async (
      { command, sessionID, arguments: args },
      output
    ) => {
      const state = getState(sessionID);
      const decision = shouldBlockCommand(command, args, state);

      if (decision.blocked) {
        output.parts = [
          {
            type: "text",
            content: `⛔ Gate blocked: ${decision.reason}`,
          },
        ];
        output.args = {
          ...(output.args || {}),
          _sisyphus_gate_blocked: decision.reason,
        };
        recordEvent({
          sessionID,
          tool: "command",
          phase: state.phase,
          reason: decision.reason,
          command,
        });
      }
    },

    "experimental.chat.system.transform": async (
      { sessionID },
      output
    ) => {
      if (!sessionID) return;
      const freshState = syncStateWithDisk(sessionID) ?? getState(sessionID);
      if (
        freshState.stateFileExists &&
        (freshState.prdGateStatus === "FAIL" || freshState.planGateStatus === "FAIL")
      ) {
        recordEvent({
          sessionID,
          tool: "system-transform",
          phase: freshState.phase,
          reason: `gate-status-rendered prd=${freshState.prdGateStatus} plan=${freshState.planGateStatus} approval=${freshState.approvalStatus}`,
        });
      }
      output.system.push(buildGateStatusPrompt(freshState));
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
