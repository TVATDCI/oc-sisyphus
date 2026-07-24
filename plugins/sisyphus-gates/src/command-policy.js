/**
 * command-policy.js — destructive-command detection and read-only allowlist.
 *
 * W1.C closes the bypasses left by the W1.A DESTRUCTIVE_COMMAND_PATTERNS:
 *   - Whitespace variants (leading space/tab, double-space, env-var prefix)
 *   - Interpreter -c/-e (python, node, perl, ruby, php, awk)
 *   - Subcommand mutations (npm uninstall, git checkout, git branch -D, etc.)
 *   - Filesystem mutations (chmod -R, find -delete/-exec)
 *   - Shell redirects (>, >>, <, |, &)
 *   - Cloud/infra (kubectl, docker, terraform)
 *   - Pipe-to-shell (curl|sh, wget|bash)
 *
 * Exports:
 *   - isDestructiveCommand(cmd)  → boolean
 *   - isSafeReadOnlyCommand(cmd) → boolean  (allowlist)
 *   - extractCommandName(cmd)    → string
 *   - hasShellRedirect(cmd)      → boolean
 *   - tokenize(cmd)              → string[]  (respects quotes)
 */

import { containsSudo } from "./sudo-policy.js";

// ─── tokenize ───────────────────────────────────────────────────────────────

/**
 * Split a command string into tokens on whitespace, respecting
 * single and double quotes and backslash escapes. Returns an array of
 * tokens (no quotes preserved).
 *
 * Examples:
 *   tokenize("rm -rf /tmp")                    → ["rm", "-rf", "/tmp"]
 *   tokenize("echo 'hello world'")             → ["echo", "hello world"]
 *   tokenize('echo "hello world"')             → ["echo", "hello world"]
 *   tokenize("git commit -m 'fix: bug'")       → ["git", "commit", "-m", "fix: bug"]
 *   tokenize("")                                → []
 */
export function tokenize(cmd) {
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

// ─── normalize ──────────────────────────────────────────────────────────────

/**
 * Strip leading whitespace and env-var assignments from a command.
 * Examples:
 *   "  FOO=bar BAZ=qux rm -rf /tmp" → "rm -rf /tmp"
 *   "\trm -rf /tmp"                  → "rm -rf /tmp"
 *   "rm -rf /tmp"                    → "rm -rf /tmp"
 */
function normalize(cmd) {
  if (typeof cmd !== "string") return "";
  let s = cmd.replace(/^\s+/, "");
  // Strip one or more leading env-var assignments: FOO=bar BAZ=qux ...
  s = s.replace(/^((?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)+)/, "");
  return s;
}

// ─── extractCommandName ─────────────────────────────────────────────────────

/**
 * First token, normalized (whitespace stripped, leading env-vars stripped,
 * leading sudo stripped).
 *
 * Examples:
 *   extractCommandName("rm -rf /tmp")               → "rm"
 *   extractCommandName("FOO=bar rm -rf /tmp")        → "rm"
 *   extractCommandName("sudo apt update")            → "apt"
 *   extractCommandName("  git status")               → "git"
 *   extractCommandName("")                            → ""
 */
export function extractCommandName(cmd) {
  let s = stripLeadingEnvExport(cmd).replace(/^\s+/, "");
  // Strip leading env-var assignments
  s = s.replace(/^((?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)+)/, "");
  // Strip leading sudo
  s = s.replace(/^sudo\s+/, "");
  s = s.replace(/^\s+/, "");
  if (s.length === 0) return "";
  const m = s.match(/^(\S+)/);
  if (!m) return "";
  // F6 (#1): basename-normalize PATH-qualified commands (`/bin/rm` → `rm`)
  // so they match the denylists. No-op for bare commands (no "/").
  const name = m[1];
  const slash = name.lastIndexOf("/");
  return slash >= 0 ? name.slice(slash + 1) : name;
}

// ─── hasShellRedirect ───────────────────────────────────────────────────────

/**
 * Detect if a command contains a shell redirect metacharacter.
 * Returns true for: >, >>, <, |, single-&
 * Returns false for: &&, || (control flow, not redirect)
 *
 * Respects single and double quotes.
 *
 * Examples:
 *   hasShellRedirect("echo hello > file.txt")  → true
 *   hasShellRedirect("echo hello >> file.txt") → true
 *   hasShellRedirect("sort < input.txt")       → true
 *   hasShellRedirect("ls | tee log")           → true
 *   hasShellRedirect("sleep 60 &")             → true
 *   hasShellRedirect("cmd1 && cmd2")           → false
 *   hasShellRedirect("cmd1 || cmd2")           → false
 *   hasShellRedirect("ls -la")                 → false
 */
export function hasShellRedirect(cmd) {
  if (typeof cmd !== "string") return false;
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  while (i < cmd.length) {
    const ch = cmd[i];
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
    if (!inSingle && !inDouble) {
      if (ch === ">" || ch === "<") return true;
      if (ch === "|") {
        if (i + 1 < cmd.length && cmd[i + 1] === "|") {
          i++; // skip ||
        } else {
          return true;
        }
      } else if (ch === "&") {
        if (i + 1 < cmd.length && cmd[i + 1] === "&") {
          i++; // skip &&
        } else {
          return true;
        }
      }
    }
    i++;
  }
  return false;
}
/**
 * Check if a command contains shell metacharacters that indicate chaining,
 * substitution, or redirection. Used by both isDestructiveCommand (Layer 4
 * destructive check) and isSandboxCommand (Layer 3.7 explicit deny before
 * allowlist match).
 *
 * Consolidates the three checks that were previously inlined in both
 * isDestructiveCommand and isSafeReadOnlyCommand:
 *   1. Chaining operators: && || ; |
 *   2. Command substitution: $( ) or backtick
 *   3. Shell redirects: > >> < | & (single)
 *
 * This function is a pure consolidation — it does NOT add any new predicate
 * beyond what the three original checks already tested. The 328-test
 * regression sentinel verifies byte-identical behavior.
 *
 * Slice C (brain-ph1): extracted for reuse by Layer 3.7 sandbox command
 * matching. Layer 3.7 must NOT bypass Layer 4's metachar protections.
 */
export function hasShellMetachar(cmd) {
  if (typeof cmd !== "string") return false;
  // P-A (#1): join line-continuations first — bash removes `\<LF>` / `\<CRLF>`,
  // so the gate must too or it diverges from what the shell executes.
  cmd = cmd.replace(/\\\r?\n/g, "");
  // P-A (#1): NUL is unverifiable — execve truncates at NUL, so the gate would
  // evaluate a longer string than the shell actually runs.
  if (cmd.includes("\0")) return true;
  // Chaining operators (&&, ||, ;, |) + P-A: newline/CR as separators.
  // Closes F3 — `git status\nrm -rf /` no longer smuggles rm past the matcher.
  if (/(?:&&|\|\||[;|\n\r])/.test(cmd)) return true;
  // Command substitution ($(...) or backtick)
  if (cmd.includes("$(") || cmd.includes("`")) return true;
  // Shell redirects (>, >>, <, |, single &) — reuse existing helper
  if (hasShellRedirect(cmd)) return true;
  return false;
}

function stripLeadingEnvExport(cmd) {
  if (typeof cmd !== "string") return cmd;
  if (!cmd.startsWith("export ")) return cmd;
  // Manual scanner — bash allows values to contain `;` (as in opencode's
  // `VISUAL=''` followed by `;`), so a regex cannot disambiguate the
  // separator `;` from `;` inside a value. Values may not contain unquoted
  // whitespace or unquoted `;` — both terminate the assignment. Conservative:
  // returns the original cmd if anything deviates from `export K=V K=V ...; cmd`.
  let i = "export ".length;
  while (i < cmd.length) {
    const idStart = i;
    while (i < cmd.length && /[A-Za-z0-9_]/.test(cmd[i])) i++;
    if (i === idStart) return cmd;
    if (cmd[i] !== "=") return cmd;
    i++;
    const valStart = i;
    while (i < cmd.length && /[^\s;]/.test(cmd[i])) i++;
    if (i === valStart) return cmd;
    while (i < cmd.length && /\s/.test(cmd[i])) i++;
    if (cmd[i] === ";") {
      i++;
      while (i < cmd.length && /\s/.test(cmd[i])) i++;
      return cmd.slice(i);
    }
    if (i >= cmd.length) return cmd;
  }
  return cmd;
}
// ─── destructive detection ──────────────────────────────────────────────────

/**
 * First-token commands that are ALWAYS destructive.
 * (git/npm/kubectl/docker/terraform have subcommand-based logic below.)
 */
const ALWAYS_DESTRUCTIVE_FIRST_TOKEN = new Set([
  "rm",
  "rmdir",
  "unlink",
  "dd",
  "mkfs",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "truncate",
  "shred",
  "tee", // tee writes to file
  "userdel",
  "groupdel",
  "iptables",
  "firewall-cmd",
  "ufw",
  "crontab",
  "mount",
  "umount",
  "fdisk",
  "parted",
  "mkswap",
  "swapon",
  "swapoff",
]);

/** Subcommand-aware commands. */
const SUBCOMMAND_BD = {
  safe: new Set([
    "ready",
    "prime",
    "list",
    "show",
    "blocked",
    "search",
    "memories",
    "remember",
    "stats",
    "doctor",
    "version",
    "config",
    "dep",
    "help",
    "--help",
    "-h",
  ]),
  destructive: new Set([
    "close",
    "defer",
    "supersede",
    "forget",
    "create",
    "update",
    "mol",
    "human",
    "setup",
    "dolt",
    "preflight",
    "stale",
    "orphans",
    "lint",
    "edit",
  ]),
};

const SUBCOMMAND_GIT = {
  safe: new Set(["status", "log", "diff", "show", "ls-files"]),
  flagCheck: (_sub, rest) => {
    // git branch -D/--delete is destructive
    if (rest.some((a) => /^--?D\b/.test(a) || /^--?d\b/.test(a))) return true;
    return false;
  },
  // Per-subcommand destructive check (token-1 is git, token-2 is sub)
  subCheck: (sub, rest) => {
    // git <sub> with any of these flags is destructive
    if (
      sub === "checkout" &&
      (rest.includes("--") || rest.some((a) => a.startsWith("-")))
    )
      return true;
    if (sub === "reset" && rest.includes("--hard")) return true;
    if (sub === "clean" && rest.some((a) => /^-[a-zA-Z]*[fF]/.test(a)))
      return true;
    if (
      sub === "push" &&
      rest.some((a) => /--force/.test(a) || /^-+f\b/.test(a))
    )
      return true;
    if (sub === "branch" && rest.some((a) => /^--?D\b/.test(a))) return true;
    if (sub === "restore") return true;
    if (
      sub === "stash" &&
      !["list", "show", "pop", "apply", "drop", "branch"].some((s) =>
        rest.includes(s),
      )
    )
      return true;
    if (
      sub === "merge" ||
      sub === "rebase" ||
      sub === "cherry-pick" ||
      sub === "revert"
    )
      return true;
    if (
      sub === "tag" &&
      rest.some((a) => /^-[dD]/.test(a) || /^--delete/.test(a))
    )
      return true;
    return false;
  },
};

const SUBCOMMAND_NPM = {
  destructive: new Set([
    "uninstall",
    "remove",
    "rm",
    "publish",
    "install",
    "i",
    "add",
    "update",
    "upgrade",
    "link",
    "unlink",
    "ci",
    "pack",
  ]),
};

const SUBCOMMAND_KUBECTL = {
  destructive: new Set([
    "delete",
    "apply",
    "exec",
    "drain",
    "cordon",
    "taint",
    "rollout",
    "scale",
    "patch",
    "replace",
    "edit",
    "annotate",
    "label",
    "set",
  ]),
};

const SUBCOMMAND_DOCKER = {
  destructive: new Set([
    "rm",
    "rmi",
    "system",
    "volume",
    "stop",
    "kill",
    "prune",
    "exec",
    "run",
    "start",
    "restart",
    "pause",
    "unpause",
    "update",
    "build",
    "pull",
    "push",
    "tag",
    "load",
    "save",
    "import",
    "export",
    "create",
    "cp",
    "commit",
  ]),
};

const SUBCOMMAND_TERRAFORM = {
  destructive: new Set([
    "destroy",
    "apply",
    "taint",
    "import",
    "refresh",
    "untaint",
  ]),
};

function hasRecursiveArg(tokens) {
  return tokens
    .slice(1)
    .some(
      (a) =>
        a === "-R" ||
        a === "-r" ||
        a === "--recursive" ||
        /^--recursive/.test(a) ||
        /^-[a-zA-Z]*[rR]/.test(a),
    );
}

const SUBCOMMAND_FIND = {
  // find with -delete/-exec/-execdir/-ok/-okdir is destructive
  flagCheck: (_sub, rest) =>
    rest.some((a) =>
      [
        "-delete",
        "-exec",
        "-execdir",
        "-ok",
        "-okdir",
        "-fls",
        "-fprint",
        "-fprintf",
      ].includes(a),
    ),
};

const SUBCOMMAND_PIP = {
  destructive: new Set(["install", "uninstall", "freeze", "download"]),
};

const SUBCOMMAND_GEM = {
  destructive: new Set(["install", "uninstall"]),
};

const SUBCOMMAND_CARGO = {
  destructive: new Set(["install", "uninstall", "add", "remove", "update"]),
};

const SUBCOMMAND_GO = {
  destructive: new Set(["install", "get", "mod"]),
};

const SUBCOMMAND_CURL = {
  // curl -o / -O writes to file
  flagCheck: (_sub, rest) =>
    rest.some(
      (a) =>
        a === "-o" ||
        a === "-O" ||
        /^--output/.test(a) ||
        /^--remote-name/.test(a),
    ),
};

const SUBCOMMAND_WGET = {
  flagCheck: (_sub, rest) =>
    rest.some((a) => a === "-O" || /^--output-document/.test(a) || a === "-o"),
};

const SUBCOMMAND_SED = {
  // sed -i is destructive
  flagCheck: (_sub, rest) =>
    rest.some(
      (a) =>
        a === "-i" ||
        a === "--in-place" ||
        /^--in-place/.test(a) ||
        /^-i[~a-zA-Z]/.test(a),
    ),
};

/** Interpreter commands: dangerous when run with -c/-e/-r flag. */
const INTERPRETER_COMMANDS = new Set([
  "python",
  "python2",
  "python3",
  "pypy",
  "pypy3",
  "node",
  "nodejs",
  "perl",
  "perl5",
  "ruby",
  "php",
]);

function isInterpreterDestructive(cmd, tokens) {
  if (tokens.length < 2) return false;
  const first = cmd;
  if (!INTERPRETER_COMMANDS.has(first)) {
    // awk/gawk/mawk: any positional arg is a script
    if (first === "awk" || first === "gawk" || first === "mawk") {
      return tokens.slice(1).some((a) => !a.startsWith("-"));
    }
    return false;
  }
  const args = tokens.slice(1);
  // -c, -e, -r, --command, --eval → code execution
  if (
    args.some(
      (a) =>
        a === "-c" ||
        a === "-e" ||
        a === "-r" ||
        a === "-i" ||
        a === "--command" ||
        a === "--eval" ||
        /^-c=/.test(a),
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Check if a command is destructive. Returns true for any command that
 * could mutate filesystem, run privileged operations, or otherwise
 * require explicit user approval.
 *
 * Layered detection:
 *   1. containsSudo → destructive
 *   2. hasShellRedirect → destructive
 *   3. First token in ALWAYS_DESTRUCTIVE_FIRST_TOKEN → destructive
 *   4. Subcommand-aware commands (git, npm, kubectl, etc.) → check sub
 *   5. Interpreter commands (python, node, etc.) with -c/-e → destructive
 *
 * Examples (true):
 *   "rm -rf /tmp" / " rm -rf /tmp" / "FOO=bar rm -rf /tmp"
 *   "python -c '...rmtree(...)'"
 *   "npm uninstall --save express"
 *   "git checkout -- ."
 *   "chmod -R 777 /"
 *   "echo hello > file.txt"
 *   "curl | sh"
 *
 * Examples (false):
 *   "ls -la" / "cat /etc/passwd" / "git status" / "git log --oneline -10"
 */

// P-B2 (#1): wrapper-recursion set. When the first command token is one of
// these, the real command follows (possibly behind flags/positionals).
// Resolved by recursing isDestructiveCommand on the remainder (catches direct
// commands + subcommands) AND scanning remainder tokens for catastrophic names
// (catches commands hidden behind the wrapper's flags). Flag-agnostic — no
// per-wrapper flag-consumption table needed.
const WRAPPER_SET = new Set([
  "env",
  "nice",
  "nohup",
  "time",
  "timeout",
  "command",
  "strace",
  "ltrace",
  "gdb",
  "busybox",
  "cpulimit",
  "stdbuf",
  "ionice",
  "chrt",
  "taskset",
  "numactl",
  "setarch",
  "linux32",
  "linux64",
  "catchsegv",
  "eatmydata",
  "fakeroot",
  "fakechroot",
  "proot",
  "xvfb-run",
  "dbus-run-session",
  "setsid",
  "flock",
  "chroot",
  "nsenter",
  "unshare",
  "systemd-run",
  "su",
  "pkexec",
  "perf",
  "entr",
  "watchexec",
  "hyperfine",
  "multitime",
  "exec",
  "builtin",
  "xargs",
]);

// P-B2 (#1): remainder of cmd after the first command token (mirrors
// extractCommandName's stripping: env-export, VAR=val assignments, sudo).
function remainderAfterFirstCommand(cmd) {
  let s = stripLeadingEnvExport(cmd).replace(/^\s+/, "");
  s = s.replace(/^((?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)+)/, "");
  s = s.replace(/^sudo\s+/, "");
  s = s.replace(/^\s+/, "");
  const m = s.match(/^(\S+)\s*/);
  if (!m) return "";
  return s.slice(m[0].length);
}

// P-C (#1): dangerous env-prefix detection. VAR=val prefixes where VAR is a
// known code-exec vector (loader injection, shell startup, interpreter hooks,
// program hijack) → destructive. Pager/editor class is value-ruled (safe
// values like `cat` allowed; anything else blocked). Checked AFTER
// stripLeadingEnvExport so opencode's own 13-var prefix never flags.
const DANGEROUS_ENV_VARS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
  "GCONV_PATH",
  "OPENSSL_CONF",
  "OPENSSL_ENGINES",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "DYLD_FALLBACK_LIBRARY_PATH",
  "BASH_ENV",
  "ENV",
  "ZDOTDIR",
  "PYTHONSTARTUP",
  "PYTHONPATH",
  "PYTHONHOME",
  "PYTHONINSPECT",
  "NODE_OPTIONS",
  "NODE_PATH",
  "PERL5OPT",
  "PERL5LIB",
  "PERLLIB",
  "RUBYOPT",
  "RUBYLIB",
  "JAVA_TOOL_OPTIONS",
  "_JAVA_OPTIONS",
  "JDK_JAVA_OPTIONS",
  "PHPRC",
  "LUA_INIT",
  "PATH",
  "IFS",
  "HOME",
  "MAKEFLAGS",
  "TAR_OPTIONS",
  "GIT_EXTERNAL_DIFF",
  "GIT_SSH_COMMAND",
  "GIT_SSH",
  "GIT_EXEC_PATH",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "RSYNC_RSH",
  "BROWSER",
  "LESSOPEN",
  "LESSCLOSE",
]);

const SAFE_PAGER_VALUES = new Set([
  "cat",
  "less",
  "more",
  "most",
  "bat",
  "lv",
  "true",
  "false",
  "echo",
]);

const VALUE_RULED_ENV = new Set([
  "PAGER",
  "GIT_PAGER",
  "EDITOR",
  "GIT_EDITOR",
  "VISUAL",
]);

function hasDangerousEnvPrefix(cmd) {
  const m = cmd.match(/^((?:[A-Za-z_][A-Za-z0-9_]*=\S+\s*)+)/);
  if (!m) return false;
  for (const assign of m[1].trim().split(/\s+/)) {
    const eq = assign.indexOf("=");
    if (eq < 0) continue;
    const name = assign.slice(0, eq);
    const value = assign.slice(eq + 1);
    if (DANGEROUS_ENV_VARS.has(name)) return true;
    if (VALUE_RULED_ENV.has(name) && !SAFE_PAGER_VALUES.has(value)) return true;
  }
  return false;
}

export function isDestructiveCommand(cmd, depth = 0) {
  if (typeof cmd !== "string") return false;
  cmd = stripLeadingEnvExport(cmd);
  if (hasDangerousEnvPrefix(cmd)) return true;

  // Layer 1: sudo (anywhere as a command → destructive)
  if (containsSudo(cmd)) return true;

  // Layer 2: shell metacharacters (redirects, chaining, substitution).
  // Consolidated into hasShellMetachar() in Slice C — byte-identical to the
  // previous inline checks (hasShellRedirect + chaining regex + substitution).
  if (hasShellMetachar(cmd)) return true;

  const tokens = tokenize(cmd);
  if (tokens.length === 0) return false;

  // Get the first non-env-var command token
  const first = extractCommandName(cmd);
  if (!first) return false;
  // P-B1 (#1): first-token strictness. Structural/quote/substitution chars in
  // the command-name position = obfuscation (`"rm"`, `\rm`) or structural
  // execution (brace `{rm,ls}`, subshell `(rm`). Real command names have none,
  // so FP-neutral. Closes F2.
  if (/[(){}'"$`\\]/.test(first)) return true;
  // P-B2 (#1): wrapper-recursion. If the first token is a known wrapper, the
  // real command follows — recurse on the remainder (direct + subcommand
  // analysis) AND scan remainder tokens for catastrophic names (flag-hidden).
  if (WRAPPER_SET.has(first)) {
    if (depth >= 8) return true; // depth cap → conservative block
    const remainder = remainderAfterFirstCommand(cmd);
    if (!remainder) return false; // wrapper alone (env/time with no command)
    if (isDestructiveCommand(remainder, depth + 1)) return true;
    const restTokens = tokenize(remainder);
    if (
      restTokens.some(
        (t) => ALWAYS_DESTRUCTIVE_FIRST_TOKEN.has(t) || t.startsWith("mkfs."),
      )
    )
      return true;
    return false;
  }

  // Layer 3: always-destructive first tokens
  if (ALWAYS_DESTRUCTIVE_FIRST_TOKEN.has(first)) return true;
  // P0d (G1): bash -c, sh -c, eval, source, npx execute arbitrary commands
  // beyond what the first-token check sees — always destructive.
  const shellWrappersDestructive = new Set([
    "bash",
    "sh",
    "eval",
    "source",
    ".",
    "npx",
  ]);
  if (shellWrappersDestructive.has(first)) return true;
  // P0d (G3): mkfs.* variants (mkfs.ext4, mkfs.ntfs, etc.)
  if (first.startsWith("mkfs.")) return true;

  // Layer 4: subcommand-aware commands
  if (tokens.length >= 2) {
    const sub = tokens[1];
    const rest = tokens.slice(2);

    if (first === "git") {
      // git <sub>: destructive unless sub in safe set
      if (SUBCOMMAND_GIT.safe.has(sub)) {
        // sub is safe in general, but check flag exceptions
        if (SUBCOMMAND_GIT.flagCheck(sub, rest)) return true;
        return false;
      }
      // sub is not in safe set → check subCheck
      if (SUBCOMMAND_GIT.subCheck(sub, rest)) return true;
      // Unknown sub — be conservative and mark destructive
      return true;
    }
    if (first === "npm" && SUBCOMMAND_NPM.destructive.has(sub)) return true;
    if (first === "bd" && SUBCOMMAND_BD.destructive.has(sub)) return true;
    if (first === "kubectl" && SUBCOMMAND_KUBECTL.destructive.has(sub))
      return true;
    if (first === "docker" && SUBCOMMAND_DOCKER.destructive.has(sub))
      return true;
    if (first === "terraform" && SUBCOMMAND_TERRAFORM.destructive.has(sub))
      return true;
    if (first === "pip" && SUBCOMMAND_PIP.destructive.has(sub)) return true;
    if (first === "pip3" && SUBCOMMAND_PIP.destructive.has(sub)) return true;
    if (first === "gem" && SUBCOMMAND_GEM.destructive.has(sub)) return true;
    if (first === "cargo" && SUBCOMMAND_CARGO.destructive.has(sub)) return true;
    if (first === "go" && SUBCOMMAND_GO.destructive.has(sub)) return true;
    if ((first === "chmod" || first === "chown") && hasRecursiveArg(tokens))
      return true;
    if (first === "find" && SUBCOMMAND_FIND.flagCheck(sub, rest)) return true;
    if (first === "sed" && SUBCOMMAND_SED.flagCheck(sub, rest)) return true;
    if (first === "curl" && SUBCOMMAND_CURL.flagCheck(sub, rest)) return true;
    if (first === "wget" && SUBCOMMAND_WGET.flagCheck(sub, rest)) return true;
  }

  // Layer 5: interpreters
  if (isInterpreterDestructive(first, tokens)) return true;

  return false;
}

// ─── isSafeReadOnlyCommand ──────────────────────────────────────────────────

/**
 * Explicit allowlist of commands considered safe and read-only.
 * Returns true iff `cmd` is a safe read-only command.
 *
 * Examples (true):
 *   ls -la / cat /etc/passwd / git status / git log --oneline
 *
 * Examples (false):
 *   rm -rf /tmp / git checkout -- . / echo hello > file
 */
const SAFE_READ_ONLY_TOKENS = new Set([
  "ls",
  "cat",
  "grep",
  "egrep",
  "fgrep",
  "rgrep",
  "wc",
  "head",
  "tail",
  "echo",
  "printf",
  "pwd",
  "test",
  "[",
  "which",
  "whereis",
  "type",
  "env",
  "printenv",
  "true",
  "false",
  "stat",
  "file",
  "du",
  "df",
  "tree",
  "diff",
  "cmp",
  "md5sum",
  "sha256sum",
  "sha1sum",
  "shasum",
  "tac",
  "nl",
  "fold",
  "expand",
  "unexpand",
  "od",
  "xxd",
  "hexdump",
  "cut",
  "tr",
  "sort",
  "uniq",
  "date",
  "cal",
  "uname",
  "hostname",
  "whoami",
  "id",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "jq",
  "yq",
  "column",
  "paste",
  "join",
  "comm",
  "tsort",
  "expr",
  "bc",
  "dc",
  "seq",
  "yes",
  "sleep",
  "time",
  "timeout",
  "man",
  "info",
  "help",
  "tput",
  "stty",
  "tty",
  "uptime",
  "free",
  "vmstat",
  "iostat",
  "mpstat",
  "lsof",
  "fuser",
  "lscpu",
  "lsmem",
  "lsblk",
  "lsusb",
  "lspci",
  "lshw",
  "dmidecode",
  "ip",
  "ifconfig",
  "netstat",
  "ss",
  "route",
  "traceroute",
  "tracepath",
  "ping",
  "ping6",
  "host",
  "dig",
  "nslookup",
  "getent",
  "groups",
  "users",
  "last",
  "lastlog",
  "who",
  "w",
  "ps",
  "top",
  "htop",
  "btop",
]);

const SAFE_GIT_SUBCOMMANDS = new Set(["status", "log", "diff", "show", "ls-files"]);

export function isSafeReadOnlyCommand(cmd) {
  if (typeof cmd !== "string") return false;
  cmd = stripLeadingEnvExport(cmd);
  // P-C (#1): dangerous env-prefix → never safe. Must precede the subcommand
  // checks below, else `PATH=… git status` reads as a benign git subcommand.
  if (hasDangerousEnvPrefix(cmd)) return false;
  // Shell metacharacters (redirects, chaining, substitution) are not safe.
  // Consolidated into hasShellMetachar() in Slice C — byte-identical to the
  // previous inline checks.
  if (hasShellMetachar(cmd)) return false;
  // sudo is never safe
  if (containsSudo(cmd)) return false;

  const tokens = tokenize(cmd);
  if (tokens.length === 0) return false;
  const first = extractCommandName(cmd);
  if (!first) return false;

  // P0d (G1): reject shell wrappers. bash -c, sh -c, eval, source, npx all
  // execute arbitrary commands beyond what the first-token check sees.
  const shellWrappers = new Set(["bash", "sh", "eval", "source", ".", "npx"]);
  if (shellWrappers.has(first)) return false;

  // git subcommand commands
  if (first === "git") {
    // Drop leading VAR=val env-prefix tokens so the subcommand aligns with
    // `first` (extractCommandName strips them, tokenize does not).
    const cmdTokens = tokens.filter((t) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t));
    if (cmdTokens.length < 2) return false;
    return SAFE_GIT_SUBCOMMANDS.has(cmdTokens[1]);
  }

  // awk with no positional arg → not destructive, but is it "safe"? Yes (e.g., --version)
  if (first === "awk" || first === "gawk" || first === "mawk") {
    return !tokens.slice(1).some((a) => !a.startsWith("-"));
  }

  // sed with -i is not safe
  if (first === "sed") {
    return !tokens
      .slice(1)
      .some(
        (a) =>
          a === "-i" ||
          a === "--in-place" ||
          /^--in-place/.test(a) ||
          /^-i[~a-zA-Z]/.test(a),
      );
  }

  // find with -delete/-exec is not safe
  if (first === "find") {
    return !tokens
      .slice(1)
      .some((a) =>
        ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(a),
      );
  }

  // P-B2 (#1): wrapper-aware guard. Some "safe" tokens (env, time, timeout,
  // …) can wrap + run a destructive command. Defer to isDestructiveCommand —
  // if the payload is destructive, this is NOT a safe read-only command.
  if (isDestructiveCommand(cmd)) return false;

  // xargs is NEVER safe (can run any command)
  if (first === "xargs") return false;

  // Other safe read-only commands
  if (first === "bd") {
    if (tokens.length < 2) return false;
    return SUBCOMMAND_BD.safe.has(tokens[1]);
  }
  return SAFE_READ_ONLY_TOKENS.has(first);
}

// P2 (brain-2q4): Layer 4.5 — additive allow-path for read-only compounds.
// Deny layers (0-2) run first; this only adds an allow (never weakens a block).
const COMPOUND_EXCLUDED = new Set(["sort", "sed"]);

export function isSafeCompoundCommand(cmd) {
  if (typeof cmd !== "string") return false;
  let s = stripLeadingEnvExport(cmd);
  // Allow the two harmless stderr-redirect tokens, then reject any remaining
  // redirect/structural/substitution char.
  s = s.replace(/2>&1/g, "").replace(/2>\/dev\/null/g, "");
  if (/['"\\$`(){}<>]/.test(s)) return false;
  if (/opencode\.json|state\.json|workflow\.yaml|gate-key|\/proc\b/.test(s)) return false;
  // Split on compound separators (quote-unaware — safe, quotes pre-rejected).
  const segments = s
    .split(/&&|\|\||[|;&]|\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  if (segments.length < 2) return false;
  for (const seg of segments) {
    if (isDestructiveCommand(seg)) return false;
    if (!isSafeReadOnlyCommand(seg)) return false;
    const first = extractCommandName(seg);
    if (COMPOUND_EXCLUDED.has(first)) return false;
  }
  return true;
}

// ─── Slice C: Exports for testing + Layer 3.7 reuse ───────────────────────

/**
 * Internal helpers exported for testing and for reuse by Layer 3.7
 * (sandbox-policy.js). These are implementation details — the public
 * API remains isDestructiveCommand + isSafeReadOnlyCommand.
 *
 * Layer 3.7 reuses normalize + stripLeadingEnvExport to ensure sandbox
 * command matching uses the SAME normalization as Layer 4's safe-read check.
 */
export const _internal = {
  normalize,
  stripLeadingEnvExport,
};
