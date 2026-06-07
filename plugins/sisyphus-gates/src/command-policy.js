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
  if (typeof cmd !== "string") return "";
  let s = cmd.replace(/^\s+/, "");
  // Strip leading env-var assignments
  s = s.replace(/^((?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)+)/, "");
  // Strip leading sudo
  s = s.replace(/^sudo\s+/, "");
  s = s.replace(/^\s+/, "");
  if (s.length === 0) return "";
  const m = s.match(/^(\S+)/);
  return m ? m[1] : "";
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
const SUBCOMMAND_GIT = {
  safe: new Set(["status", "log", "diff", "show"]),
  flagCheck: (_sub, rest) => {
    // git branch -D/--delete is destructive
    if (rest.some((a) => /^--?D\b/.test(a) || /^--?d\b/.test(a))) return true;
    return false;
  },
  // Per-subcommand destructive check (token-1 is git, token-2 is sub)
  subCheck: (sub, rest) => {
    // git <sub> with any of these flags is destructive
    if (sub === "checkout" && (rest.includes("--") || rest.some((a) => a.startsWith("-")))) return true;
    if (sub === "reset" && rest.includes("--hard")) return true;
    if (sub === "clean" && rest.some((a) => /^-[a-zA-Z]*[fF]/.test(a))) return true;
    if (sub === "push" && rest.some((a) => /--force/.test(a) || /^-+f\b/.test(a))) return true;
    if (sub === "branch" && rest.some((a) => /^--?D\b/.test(a))) return true;
    if (sub === "restore") return true;
    if (sub === "stash" && !["list", "show", "pop", "apply", "drop", "branch"].some((s) => rest.includes(s))) return true;
    if (sub === "merge" || sub === "rebase" || sub === "cherry-pick" || sub === "revert") return true;
    if (sub === "tag" && rest.some((a) => /^-[dD]/.test(a) || /^--delete/.test(a))) return true;
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
  return tokens.slice(1).some(
    (a) =>
      a === "-R" ||
      a === "-r" ||
      a === "--recursive" ||
      /^--recursive/.test(a) ||
      /^-[a-zA-Z]*[rR]/.test(a)
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
      ].includes(a)
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
    rest.some((a) => a === "-o" || a === "-O" || /^--output/.test(a) || /^--remote-name/.test(a)),
};

const SUBCOMMAND_WGET = {
  flagCheck: (_sub, rest) =>
    rest.some((a) => a === "-O" || /^--output-document/.test(a) || a === "-o"),
};

const SUBCOMMAND_SED = {
  // sed -i is destructive
  flagCheck: (_sub, rest) =>
    rest.some((a) => a === "-i" || a === "--in-place" || /^--in-place/.test(a) || /^-i[~a-zA-Z]/.test(a)),
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
        /^-c=/.test(a)
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
export function isDestructiveCommand(cmd) {
  if (typeof cmd !== "string") return false;

  // Layer 1: sudo (anywhere as a command → destructive)
  if (containsSudo(cmd)) return true;

  // Layer 2: shell redirect metachars
  if (hasShellRedirect(cmd)) return true;

  const tokens = tokenize(cmd);
  if (tokens.length === 0) return false;

  // Get the first non-env-var command token
  const first = extractCommandName(cmd);
  if (!first) return false;

  // Layer 3: always-destructive first tokens
  if (ALWAYS_DESTRUCTIVE_FIRST_TOKEN.has(first)) return true;

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
    if (first === "kubectl" && SUBCOMMAND_KUBECTL.destructive.has(sub)) return true;
    if (first === "docker" && SUBCOMMAND_DOCKER.destructive.has(sub)) return true;
    if (first === "terraform" && SUBCOMMAND_TERRAFORM.destructive.has(sub)) return true;
    if (first === "pip" && SUBCOMMAND_PIP.destructive.has(sub)) return true;
    if (first === "pip3" && SUBCOMMAND_PIP.destructive.has(sub)) return true;
    if (first === "gem" && SUBCOMMAND_GEM.destructive.has(sub)) return true;
    if (first === "cargo" && SUBCOMMAND_CARGO.destructive.has(sub)) return true;
    if (first === "go" && SUBCOMMAND_GO.destructive.has(sub)) return true;
    if ((first === "chmod" || first === "chown") && hasRecursiveArg(tokens)) return true;
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

const SAFE_GIT_SUBCOMMANDS = new Set(["status", "log", "diff", "show"]);

export function isSafeReadOnlyCommand(cmd) {
  if (typeof cmd !== "string") return false;
  // Any redirect is not "safe" (it can mutate files or pipe to sh)
  if (hasShellRedirect(cmd)) return false;
  // sudo is never safe
  if (containsSudo(cmd)) return false;

  const tokens = tokenize(cmd);
  if (tokens.length === 0) return false;
  const first = extractCommandName(cmd);
  if (!first) return false;

  // git subcommand commands
  if (first === "git") {
    if (tokens.length < 2) return false;
    return SAFE_GIT_SUBCOMMANDS.has(tokens[1]);
  }

  // awk with no positional arg → not destructive, but is it "safe"? Yes (e.g., --version)
  if (first === "awk" || first === "gawk" || first === "mawk") {
    return !tokens.slice(1).some((a) => !a.startsWith("-"));
  }

  // sed with -i is not safe
  if (first === "sed") {
    return !tokens.slice(1).some(
      (a) => a === "-i" || a === "--in-place" || /^--in-place/.test(a) || /^-i[~a-zA-Z]/.test(a)
    );
  }

  // find with -delete/-exec is not safe
  if (first === "find") {
    return !tokens.slice(1).some((a) =>
      ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(a)
    );
  }

  // xargs is NEVER safe (can run any command)
  if (first === "xargs") return false;

  // Other safe read-only commands
  return SAFE_READ_ONLY_TOKENS.has(first);
}
