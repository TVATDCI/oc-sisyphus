# sisyphus-gates

Phase-based governance gate enforcement for the Sisyphus workflow. Blocks writes/commits until PRD/plan gates pass. Current: `v0.4.1` — extends the bd destructive-subcommand enumeration (brain-hxm P0, Jul 27), tightens quote-aware shell-metachar detection (Finding B, Jul 25), and hardens trust-root path boundaries (T4/T5, Jul 25). Layer history: 3.7 sandbox allowlist (v0.3.0); 6.5 session-close gate, 4.5 compound-allow, 1 catastrophic-defense hardening (v0.4.0).

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
| **4.5** | **Compound allow**       | **bash only**                       | **Read-only compounds — every segment independently safe-readonly + non-destructive + charset-clean. Additive allow-path; deny layers untouched.**                                                            |
| 5       | Fail-closed              | `write`, `edit`, `bash`, `task`     | Blocks if state file missing, gates unknown/fail, or approval ≠ `approved`.                                                                                                                                   |
| 6       | Phase-specific           | All tools                           | Discovery/PRD-writing: allow all. PRD-review: block destructive. Plan-approved: block destructive.                                                                                                            |
| **6.5** | **Session-close gate**   | **bash**                            | **`git push` / `bd dolt push` blocked when `session_close.status === "open"` (protocol started but not completed). Operator-side state field; prose claims of "closed" are non-authoritative.**                |

## bd ask tier (permission layer)

Independent of the decision stack above: mutating bd verbs (the PR-30 tier map — `BD_TIER_ASK` + the Finding A phase-agnostic writes) surface a permission ASK regardless of what the host's rules computed. `bdAskTierEscalation` in `src/command-policy.js` is the single decision owner, consulted by both plugin generations' permission hooks (V2 `permission.evaluate` — the live surface — and V1 `permission.ask`). It re-raises the ask even when a saved `bd *`-class grant (one always-click saves it project-wide; the host appends saved rules after configured rules, findLast-wins) or a computed-allow default would let the verb run — the grant stays but is inert for ask-tier verbs. Compound-aware: `bd ready && bd create --title x` asks even though the read prefix computes an allow. Reads, allowlisted commands, and gated/destructive classes are untouched (gates throw before permission evaluation runs).

**Stanza layer (phase-agnostic-ask-fix):** the hook governs only when it is live in the seat process — the twin desk's third finding proved bd create/update ran SILENT on a stale seat generation while the Finding-A-era stanza grants (`bd *` ALLOW on archivist + the writer-bd generator profile) computed allow at the permission layer ahead of the ask tier. Phase-agnostic therefore means not PHASE-blocked, never permission-skipped: no fleet agent stanza may allow a mutating bd verb (pinned fleet-wide by test/bd-ask-tier-stanza-sweep.test.js). Lane stanzas carry enumerated read-tier allows (bd ready/list/show/...); every mutating verb falls to the blanket shell ask and is governed by the ask tier under pure rule resolution — no hook required. The Layer-4 classification (SUBCOMMAND_BD.safe) is untouched: in fail-closed phases bd record writes still work (they ask, the supervisor approves — never hard-blocked by phase).

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
