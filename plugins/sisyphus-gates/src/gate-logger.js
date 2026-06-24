// src/gate-logger.js — file-based diagnostic logger for sisyphus-gates.
// Writes append-only JSONL to ~/.sisyphus/logs/gate-debug.log (override via
// SISYPHUS_GATE_LOG_PATH env for tests/verification).
//
// CRITICAL CONTRACT: logging must NEVER throw — it must not break the gate's
// fail-closed logic. All fs errors are swallowed.
// SECURITY: callers must never pass key material as details — log OUTCOMES only.
import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const LOG_PATH =
  process.env.SISYPHUS_GATE_LOG_PATH ||
  join(homedir(), ".sisyphus", "logs", "gate-debug.log");

/**
 * Append one JSONL event to the gate debug log.
 * @param {string} category  - logical source (e.g. "memory-key", "scan", "sync", "state")
 * @param {string} message   - human-readable event description
 * @param {object} [details] - structured fields merged into the entry (NO key material)
 */
export function logGateEvent(category, message, details = {}) {
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      pid: process.pid,
      category,
      message,
      ...details,
    };
    appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Swallow — logging MUST NOT break the gate.
  }
}
