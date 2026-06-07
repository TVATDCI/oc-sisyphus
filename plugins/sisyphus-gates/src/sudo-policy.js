/**
 * sudo-policy.js — sudo detection and catastrophic-command denylist.
 *
 * W1.C standalone module for sudo and catastrophic checks.
 * These are split out from command-policy.js because:
 *   1. `containsSudo` is used by command-policy's isDestructiveCommand
 *   2. `isAlwaysBlocked` is called separately by gates.js to block
 *      catastrophic commands in ALL phases, including execution.
 *
 * Catastrophic commands (isAlwaysBlocked) are NEVER allowed:
 *   - rm -rf / (root wipe)
 *   - dd if=... (low-level disk write)
 *   - mkfs.* (filesystem format)
 *   - shutdown / reboot / halt / poweroff (system halt)
 *   - git push --force origin main|master (force-push to default branch)
 *   - git reset --hard (wipe working tree)
 *   - git clean -fd (wipe untracked files + directories)
 */

/**
 * Check if `cmd` starts with `sudo` as a standalone command token
 * (not as a substring of another word, not as an argument to another command).
 *
 * Examples:
 *   containsSudo("sudo apt update")     → true   (sudo at command position)
 *   containsSudo("FOO=bar sudo rm -rf") → true   (env-var prefix stripped)
 *   containsSudo("echo sudo")           → false  (sudo is an arg, not command)
 *   containsSudo("sudoku-cli --solve")  → false  (sub-string of word)
 *   containsSudo("rm -rf /tmp")         → false  (no sudo present)
 */
export function containsSudo(cmd) {
  if (typeof cmd !== "string") return false;
  // Strip leading whitespace
  let s = cmd.replace(/^\s+/, "");
  // Strip leading env-var assignments (one or more WORD=VALUE pairs)
  s = s.replace(/^((?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)+)/, "");
  // First non-env token must be "sudo" (followed by whitespace, end, or shell metachar)
  return /^sudo(\s|$|;|\||&)/.test(s);
}

/**
 * Tokenize a command into whitespace-separated tokens while respecting
 * single and double quotes. Exported from this module as a helper for
 * isAlwaysBlocked's token-level checks. Also re-exported by command-policy.
 */
function tokenize(cmd) {
  if (typeof cmd !== "string") return [];
  const tokens = [];
  let current = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  while (i < cmd.length) {
    const ch = cmd[i];
    if (ch === "\\" && i + 1 < cmd.length) {
      // Escape: include the next char literally
      current += cmd[i + 1];
      i += 2;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      i++;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      i++;
      continue;
    }
    if (!inSingle && !inDouble && /\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

/**
 * Check if `cmd` is in the catastrophic denylist. These are NEVER allowed
 * in any phase, including execution.
 *
 * Examples (→ true):
 *   rm -rf /            dd if=/dev/zero of=/dev/sda
 *   mkfs.ext4 /dev/sda  shutdown -h now   reboot
 *   git push --force origin main|master
 *   git reset --hard    git clean -fd
 *
 * Examples (→ false):
 *   ls -la              cat /etc/passwd       git status
 */
export function isAlwaysBlocked(cmd) {
  if (typeof cmd !== "string") return false;
  const tokens = tokenize(cmd);
  if (tokens.length === 0) return false;

  // rm -rf / (or /*, //, /.) — root wipe
  if (tokens[0] === "rm") {
    const args = tokens.slice(1);
    const hasRecursive = args.some(
      (a) =>
        a === "-r" ||
        a === "-R" ||
        a === "--recursive" ||
        /^-[a-zA-Z]*[rR]/.test(a)
    );
    if (hasRecursive) {
      const hasRootTarget = args.some(
        (a) => a === "/" || a === "//" || a === "/*" || a === "/." || a === "/./"
      );
      if (hasRootTarget) return true;
    }
  }

  // dd if=... (low-level disk read/write)
  if (tokens[0] === "dd" && tokens.some((a) => /^if=/.test(a))) {
    return true;
  }

  // mkfs.* (any filesystem format)
  if (/^mkfs(\.|$)/.test(tokens[0])) {
    return true;
  }

  // System halt/reboot
  if (["shutdown", "reboot", "halt", "poweroff"].includes(tokens[0])) {
    return true;
  }

  // git push --force origin main|master
  if (tokens[0] === "git" && tokens[1] === "push") {
    const rest = tokens.slice(2);
    const hasForce = rest.some(
      (a) => a === "--force" || a === "-f" || /--force/.test(a) || /^-+f$/.test(a)
    );
    if (hasForce) {
      const hasDefaultBranch = rest.some(
        (a) => a === "main" || a === "master" || a === "origin/main" || a === "origin/master"
      );
      if (hasDefaultBranch) return true;
    }
  }

  // git reset --hard
  if (
    tokens[0] === "git" &&
    tokens[1] === "reset" &&
    tokens.includes("--hard")
  ) {
    return true;
  }

  // git clean -fd (or -f + -d, or -df, etc.)
  if (tokens[0] === "git" && tokens[1] === "clean") {
    const rest = tokens.slice(2);
    const hasForce = rest.some((a) => /^-[a-zA-Z]*[fF]/.test(a));
    const hasDir = rest.some((a) => /^-[a-zA-Z]*[dD]/.test(a));
    if (hasForce && hasDir) return true;
  }

  return false;
}
