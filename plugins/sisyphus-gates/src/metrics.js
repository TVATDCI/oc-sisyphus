/**
 * metrics.js — append-only metrics recorder for gate events.
 *
 * Wave 4D: instrument the plugin's block decisions so the user can observe
 * how often gates are firing, which paths/commands are blocked, and which
 * reasons are most common. The data is written as one JSON object per line
 * to $HOME/.sisyphus/metrics/gate-events.jsonl so it can be queried with
 * `jq`, `grep`, or the `npm run metrics:summary` script.
 *
 * Design constraints:
 *   - Synchronous append (appendFileSync): the metrics write must complete
 *     before the hook returns so the event is captured even if opencode
 *     exits immediately. fs.appendFileSync is ~1ms per call.
 *   - No DB: the plugin already ships with @opencode-ai/plugin + js-yaml.
 *     Adding SQLite would be a new dep. JSONL is queryable with standard
 *     Unix tools and rotates trivially (rename .1, .2, etc.).
 *   - HOME read at call time (not module load): the plugin's test sandbox
 *     redirects process.env.HOME, and the existing pattern is to read HOME
 *     per-call. See test/helpers.js for the rationale.
 *   - Silent failure on write error: metrics must NEVER cause a gate
 *     decision to fail. If the write fails, log to console.error and
 *     continue. The plugin's primary job is gate enforcement, not metrics.
 *
 * Event shape:
 *   {
 *     timestamp: "2026-06-06T...",         // ISO 8601
 *     sessionID: "ses_...",                // opencode session ID
 *     event_subtype: "gate-failed" | "catastrophic" | "sudo" | "fail-closed" | "destructive",
 *     tool: "bash" | "write" | "edit" | "command",
 *     phase: "discovery" | "prd-writing" | ... | "execution" | "close",
 *     reason: "full reason string from gate decision",
 *     command: "rm -rf /"                  // for bash; undefined for write/edit
 *   }
 *
 * The event_subtype is auto-classified by inspecting the reason string.
 * This is fragile if reason text changes, but it keeps the API simple
 * (one field, easy to filter).
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";

/** Resolve the metrics file path at call time (so test sandbox HOME works). */
function getMetricsPath() {
  const home = process.env.HOME || "~";
  return join(home, ".sisyphus", "metrics", "gate-events.jsonl");
}

/** Ensure the metrics directory exists. Idempotent. */
function ensureDir() {
  const path = getMetricsPath();
  mkdirSync(dirname(path), { recursive: true });
}

/**
 * Classify a block reason into an event_subtype.
 * Returns one of: "gate-failed" | "catastrophic" | "sudo" | "fail-closed" | "destructive".
 *
 * Classification rules (matched in order):
 *   1. Reason starts with "gate-status-rendered" → gate-failed
 *   2. Reason starts with "Catastrophic" → catastrophic
 *   3. Reason starts with "sudo" (case-insensitive) → sudo
 *   4. Reason matches fail-closed patterns (state, gate, workflow) → fail-closed
 *   5. Everything else → destructive
 */
function classifySubtype(reason) {
  if (typeof reason !== "string") return "destructive";
  if (/^gate-status-rendered/i.test(reason)) return "gate-failed";
  if (/^Catastrophic/i.test(reason)) return "catastrophic";
  if (/^sudo/i.test(reason)) return "sudo";
  if (
    /^State file/i.test(reason) ||
    /^Gate status/i.test(reason) ||
    /^Gate review/i.test(reason) ||
    /^approval_status/i.test(reason) ||
    /^Workflow config/i.test(reason)
  ) {
    return "fail-closed";
  }
  return "destructive";
}

/**
 * Record a single gate event. Called from src/plugin.js when a block decision
 * is made. Silently fails on write error to never interfere with gate logic.
 *
 * @param {object} event - { sessionID, tool, phase, reason, command? }
 */
export function recordEvent(event) {
  try {
    ensureDir();
    const line =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event_subtype: classifySubtype(event.reason),
        ...event,
      }) + "\n";
    appendFileSync(getMetricsPath(), line);
  } catch (err) {
    // Never let metrics break the plugin.
    console.error("[sisyphus-gates] Failed to record metric:", err.message);
  }
}

/**
 * Read all recorded events. Returns an array of objects. Returns [] if no
 * metrics file exists. Used by the `npm run metrics:summary` script and
 * by self-test scenarios.
 */
export function getEvents() {
  const path = getMetricsPath();
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

/**
 * Delete the metrics file. Used by tests to start from a clean slate.
 */
export function clearEvents() {
  const path = getMetricsPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

/**
 * Return the absolute path of the metrics file. Used by tests and the
 * summary script to display the file location.
 */
export function getMetricsFilePath() {
  return getMetricsPath();
}
