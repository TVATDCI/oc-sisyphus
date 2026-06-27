# sisyphus-gates

Phase-based governance gate enforcement for the Sisyphus workflow. Blocks writes/commits until PRD/plan gates pass. v0.3.0 adds Layer 3.7 — path-scoped sandbox allowlist for routine dev work in disposable directories.

## Decision stack

`shouldBlockTool` evaluates layers in order. The first layer that returns a decision wins.

| Layer   | Name                     | Applies to                          | Behavior                                                                                                                                                                                                      |
| ------- | ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0       | Trust-root path denylist | All tools                           | Blocks read/write to `~/.sisyphus/state.json`, `workflow.yaml`, verdict files, plugin source, `/proc`, `opencode.json` (write-only). Unconditional.                                                           |
| 1       | Catastrophic denylist    | bash                                | Blocks `rm -rf /`, `dd`, `mkfs`, `git push --force`, `shutdown`, etc. in ALL phases.                                                                                                                          |
| 2       | Sudo                     | bash                                | Blocks `sudo` in ALL phases.                                                                                                                                                                                  |
| 3       | Safe read-only tools     | `read`, `grep`, `websearch`, `glob` | Always allowed.                                                                                                                                                                                               |
| 3.5     | MCP classification       | MCP tools (`{server}_{tool}`)       | Read-classified → allowed. Write-classified → normalized to `write` for downstream layers. Unknown → blocked.                                                                                                 |
| **3.7** | **Sandbox allowlist**    | **bash only**                       | **If cwd resolves into a `sandbox_paths` prefix AND command matches a `sandbox_allowed_commands` entry → allowed with audit. Only relaxes the command allowlist — Layers 0–3.5 still apply unconditionally.** |
| 4       | Safe bash allowlist      | bash                                | `ls`, `cat`, `git status`, `git log`, etc. Always allowed, even when fail-closed.                                                                                                                             |
| 5       | Fail-closed              | `write`, `edit`, `bash`, `task`     | Blocks if state file missing, gates unknown/fail, or approval ≠ `approved`.                                                                                                                                   |
| 6       | Phase-specific           | All tools                           | Discovery/PRD-writing: allow all. PRD-review: block destructive. Plan-approved: block destructive.                                                                                                            |

## Sandbox allowlist (Layer 3.7)

**Opt-in.** When `sandbox_paths` is not configured or empty, behavior is byte-identical to v0.2.0 without the feature.

### Config schema (opencode.json plugin block)

```jsonc
[
  "./plugins/sisyphus-gates",
  {
    "verdict_key_command": "cat ~/.local/share/sisyphus-gate-key",
    "sandbox_paths": ["/tmp/"],
    "sandbox_allowed_commands": [
      "npm install",
      "npm test",
      "npm run ",
      "bun add ",
      "bun install",
      "bunx ",
      "node ",
      "tsc --noEmit",
      "git diff",
      "git show",
      "git log",
    ],
  },
]
```

### Semantics

- **`sandbox_paths`**: list of path prefixes (trailing `/` required). A cwd is "in sandbox" iff `realpath(cwd) + "/"` starts with the prefix. Uses `realpath` resolution to prevent symlink escape.
- **`sandbox_allowed_commands`**: list of command prefixes. A command matches iff its normalized form (after stripping env-var prefixes + leading whitespace) matches the entry via a word-boundary regex: trim entry → `escapeRegExp` → replace spaces with `\s+` → anchor `^` → append `(?=\s|$)` lookahead.
- Both keys are optional. Missing or empty `sandbox_paths` = feature disabled.

### Security invariants

1. Layers 0–3.5 run BEFORE Layer 3.7 evaluates — catastrophic/sudo/trust-root protections are unconditional.
2. Layer 3.7 fires ONLY for `tool === "bash"` — write/edit/task/MCP are unaffected.
3. Commands with shell metacharacters (`>`, `|`, `&`, `;`, `$(`, backtick) are denied by `hasShellMetachar()` before allowlist matching.
4. Every Layer 3.7 allow is recorded as a metric event with `event_subtype: "sandbox-allow"` and forensic fields: `cwd`, `realpath_cwd`, `command`, `matched_pattern`, `matched_sandbox_path`.
5. `opencode.json` itself is write-protected by Layer 0 — the agent cannot tamper with its own sandbox config.

### Default-off

Without `sandbox_paths` configured, the plugin behaves identically to v0.2.0. No relaxation occurs. This is an opt-in feature for operators who want to reduce ceremony for routine sandbox dev work (e.g., `npm install` in `/tmp/opencode/some-test/`).

## npm scripts

```bash
npm test              # unit tests (test/*.test.js + test/adversarial/*.test.js)
npm run self-test     # e2e scenarios (test/self-test/run.js)
npm run test:all      # both
npm run metrics:summary  # summarize gate-events.jsonl
```

## See also

- [THREAT-MODEL.md](./THREAT-MODEL.md) — attack surface analysis and threat model
- [CHANGELOG.md](./CHANGELOG.md) — version history
