/**
 * memory-key.js — resolve MEMORY_KEY from operator keyring at plugin startup.
 *
 * P0b Step 1 (Decision D2): the HMAC signing key is resolved by executing a
 * shell command specified in the plugin options (verdict_key_command). The
 * key never touches disk in plaintext, never enters process.env, and is not
 * in MCP roots. The command pattern (e.g., `!op read ...`,
 * `!security find-generic-password ...`, `!pass show ...`) is
 * operator-configured via opencode.json plugin options.
 *
 * Security invariants (enforced here):
 *   - Key NEVER written to process.env.
 *   - Key NEVER written to disk.
 *   - Key NEVER logged. This module logs OUTCOMES ONLY (resolved/failed,
 *     error messages, key LENGTH) to ~/.sisyphus/logs/gate-debug.log via
 *     gate-logger.js — never the key value itself. This preserves the
 *     no-leakage invariant while making silent failures diagnosable.
 *   - stdio is piped (suppressed) on the execSync call so keyring stderr
 *     or debug output doesn't leak key material to the opencode log.
 *
 * Error handling invariant: resolveMemoryKey NEVER throws. All error paths
 * return null. A keyring failure must not crash the plugin — the caller
 * treats null as "signing disabled" and continues (gates still enforce
 * fail-closed on execution; only verdict signing is degraded).
 *
 * Residual (out-of-tier, documented in v2 §11): process-memory extraction
 * via /proc/<pid>/mem can read the resolved key from this process's memory.
 * Signing's job is to close the CHEAP forgery (writing an unsigned verdict
 * file), not process-memory extraction. The /proc read-denylist (HOLE 1f,
 * Layer 0 Tier 2) raises the bar.
 */

import { execSync } from "node:child_process";
import { logGateEvent } from "./gate-logger.js";

/**
 * Resolve MEMORY_KEY from operator keyring.
 *
 * @param {Record<string, unknown> | null | undefined} options - Plugin
 *   options from opencode.json. Expected key: `verdict_key_command` (string,
 *   optional). If the value starts with "!", the "!" is stripped (convention
 *   for "run this command and use stdout as the value").
 * @returns {string | null} The resolved key (trimmed), or null if resolution
 *   failed for any reason (missing, wrong type, empty, command error,
 *   timeout, empty output).
 */
export function resolveMemoryKey(options) {
  // Defensive: null/undefined/non-object options → null (no throw)
  if (!options || typeof options !== "object") {
    logGateEvent("memory-key", "resolveMemoryKey: options missing or non-object", { hasOptions: !!options });
    return null;
  }

  const raw = options.verdict_key_command;

  // Must be a non-empty string
  if (typeof raw !== "string" || raw.length === 0) {
    logGateEvent("memory-key", "resolveMemoryKey: verdict_key_command missing or empty", { rawType: typeof raw });
    return null;
  }

  // Strip leading "!" if present (convention: "!command" → "command")
  const cmd = raw.replace(/^!/, "");

  // Guard: raw was just "!" → empty command → null
  if (cmd.length === 0) {
    return null;
  }

  try {
    const stdout = execSync(cmd, {
      encoding: "utf-8",
      timeout: 5000,
      // Pipe all stdio to suppress keyring stderr/debug output — prevents
      // accidental key material leakage to the opencode process log.
      stdio: ["pipe", "pipe", "pipe"],
    });
    const trimmed = stdout.trim();
    if (trimmed.length === 0) {
      logGateEvent("memory-key", "resolveMemoryKey: command produced empty output", { cmd });
      return null;
    }
    logGateEvent("memory-key", "resolveMemoryKey: key resolved", { keyLen: trimmed.length });
    return trimmed;
  } catch (e) {
    // ANY error: command not found, timeout, non-zero exit, signal, etc.
    // Log the OUTCOME (NOT the key) for diagnosability, then return null.
    logGateEvent("memory-key", "resolveMemoryKey: command failed", { cmd, error: e.message });
    return null;
  }
}
