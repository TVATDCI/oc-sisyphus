# OpenCode + Sisyphus Config

> A governance system that makes AI coding agents safe enough to trust with
> real work — by forcing them through a review workflow with cryptographic
> gates that the AI cannot forge.

## What is this?

This repo configures [OpenCode](https://github.com/sst/opencode) — an AI agent
that can read, write, and run code on your machine. An AI with that much power
is risky on its own: it can delete files, run destructive commands, or commit
unfinished work. This config adds a **safety and structure layer** on top so the
agent stays powerful but can't cause damage.

Think of it as seatbelts and traffic lights for your AI coding assistant.

## Why does it exist?

AI coding agents are useful, but they move fast, don't always understand
context, and can't be fully trusted with destructive operations. This config
solves three problems:

1. **Damage control** — block `rm -rf`, force-pushes, and other catastrophic
   commands before they ever run.
2. **Process discipline** — force the AI through a review workflow
   (plan → review → build → verify) instead of letting it improvise.
3. **Accountability** — require a human's cryptographic signature to advance
   key phases, so the AI can never "self-approve" its own work.

## How does it work?

Five layers work together:

### 1. Governance Plugin (`sisyphus-gates`)

A Node.js plugin that sits between OpenCode and every tool call the AI tries.
It inspects each action, blocks the dangerous ones, and enforces a phased
workflow. 18 source modules, 446 unit tests across 21 test files, 22 end-to-end scenarios.

**Decision stack** (checked in order, first match wins):

| Layer | What it checks | Example |
|-------|---------------|---------|
| 0 — Trust-root paths | No tool may write/read state.json, workflow.yaml, verdict files, /proc, or plugin source | AI tries to write state.json → blocked |
| 1 — Catastrophic denylist | `rm -rf /`, `dd`, `mkfs`, `git push --force`, `shutdown` — blocked in all phases | AI tries `rm -rf /` → blocked |
| 2 — Sudo | Never allowed, any phase | `sudo apt update` → blocked |
| 3 — Safe read-only tools | `read`, `grep`, `glob`, `websearch` — always allowed | `read file.js` → allowed |
| 3.5 — MCP classification | External MCP tools classified as read/write/unknown; unknown denied by default | `myfiles_unknown_tool` → blocked |
| 3.7 — Sandbox allowlist | If cwd resolves into a `sandbox_paths` prefix AND command matches `sandbox_allowed_commands` → allowed with audit (Layers 0–3.5 still apply) | `npm install` in `/tmp/` → allowed |
| 4 — Safe bash allowlist | `ls`, `cat`, `git status`, `git log` — allowed even when fail-closed | `ls -la` → allowed |
| 5 — Fail-closed | If state missing, gates unknown, or config unavailable → block everything except reads | No state.json → blocked |
| 6 — Phase-specific | During review phases: write/edit/git commit blocked. During execution: destructive commands blocked (stricter policy) | PRD review phase + `git commit` → blocked |
| 6.5 — Session-close gate | `git push` / `bd dolt push` blocked when `session_close.status === "open"` (protocol started but not completed). Operator-side state field; prose claims of "closed" are non-authoritative | Agent claims "session closed" + `git push` without running `cli.js protocol complete session-close` → blocked |

Enforcement is via `throw` — the tool call is aborted, not just annotated.

### 2. Workflow (9-Phase State Machine)

The AI follows a structured workflow defined in `~/.sisyphus/workflow.yaml`:

```
Discovery → PRD Writing → PRD Review → Issue Creation → Plan Writing
→ Plan Review → Execution → Validation → Close
```

Each phase has a skill, gates, and blocking rules. The AI cannot skip phases
or improvise. The plugin reads the yaml at startup — change the workflow
without touching code.

### 3. HMAC Signing (Cryptographic Gates)

Gate decisions are HMAC-SHA256-signed artifacts, not forgeable text. The
signing key lives at `~/.local/share/sisyphus-gate-key` (chmod 600). The AI
cannot read this file, cannot read `/proc` to extract the key from memory, and
cannot read the plugin source to study the algorithm.

When you (the human) review the AI's work and decide it passes:

```bash
cd ~/.config/opencode/plugins/sisyphus-gates
node cli.js sign-verdict prd my-prd-001 PASS
node cli.js sign-verdict plan my-plan-001 PASS
node cli.js approve my-plan-001
```

The plugin verifies the HMAC signature using `crypto.timingSafeEqual` (prevents
timing attacks). Unsigned, tampered, or wrong-key verdicts are rejected. If no
signed verdicts exist, gates stay "unknown" → fail-closed.

**Session-close protocol (anti-drift, Phase 1.5+):** `git push` and `bd dolt push`
are blocked when `session_close.status === "open"`. The state field is the source
of truth — prose claims of "closed" are non-authoritative.

```bash
cd ~/.config/opencode/plugins/sisyphus-gates
node cli.js protocol start session-close                    # marks protocol active; gate will block push
node cli.js protocol complete session-close                 # marks all 4 layers done; gate allows push
node cli.js protocol override session-close --reason "..."  # operator bypass for legit cases
```

### 4. Skills (46 Instruction Modules)

`SKILL.md` files that teach the AI specific tasks — reusable instruction
manuals triggered by domain match:

- **Planning**: `discovery-orchestrator`, `prd-writer`, `plan-writer`, `issue-creator`
- **Review**: `momus-prd-reviewer`, `momus-plan-reviewer`, `code-review`, `security-auditor`
- **Execution**: `wave-executor`, `tdd-executor`, `build-resolver`, `regression-gate`
- **Research**: `athena-research`, `teach`, `toolkit-lsp`, `toolkit-research`, `website-analyzer`
- **Development**: `fullstack-dev`, `frontend-ui-ux`, `skill-creator`, `agent-development`
- **System**: `session-close`, `shell-safety`, `system-reference`, `opencode-expert`

### 5. Agents (18 Specialized Personas)

Different tasks need different AI models. The system routes work to 18 agents,
each with its own model, tools, and permissions. Of these 18, **8 are user-defined**
(`~/.config/opencode/agents/*.md`: oracle, archivist, athena, auditor, explorer,
reviewer, post-reviewer, fullstack-dev-tester) and **10 are plugin-bundled** inside
the oh-my-openagent plugin install (sisyphus, hephaestus, librarian, explore,
multimodal-looker, prometheus, metis, momus, atlas, sisyphus-junior). Most agents
are read-only. Only 2 have write access — archivist (scoped to vault paths) and
fullstack-dev-tester (broad `edit: *`, needed to build apps anywhere in a project
workspace) — and even those are blocked by Layer 0 from touching governance files.

9 categories dispatch tasks by domain (deep, quick, visual-engineering, writing,
etc.) using a 3-tier fallback strategy: zai-coding-plan subscription (primary)
→ opencode-go lite subscription (fallback) → opencode pre-pay-as-you-go (final
fallback).

## Getting Started

**Prerequisites:** Node.js 22, npm, OpenCode.

```bash
npm install            # install dependencies
npm run install:hooks  # install the git pre-push hook
```

Generate the HMAC signing key:

```bash
openssl rand -hex 32 > ~/.local/share/sisyphus-gate-key
chmod 600 ~/.local/share/sisyphus-gate-key
```

Verify everything works:

```bash
cd plugins/sisyphus-gates
npm test              # 446 unit tests across 21 files (~5s)
npm run self-test     # 22 end-to-end scenarios (~50ms)
npm run test:all      # unit + self-test combined
```

## Signing Verdicts (Operator Guide)

The AI cannot advance gates on its own. After reviewing the AI's work, sign
verdicts from a terminal (not through OpenCode):

```bash
cd ~/.config/opencode/plugins/sisyphus-gates

# Sign a PRD verdict (after momus-prd-reviewer outputs PASS)
node cli.js sign-verdict prd <prd-id> PASS

# Sign a plan verdict (after momus-plan-reviewer outputs PASS)
node cli.js sign-verdict plan <plan-id> PASS

# Approve the plan (unlocks execution)
node cli.js approve <plan-id>

# Preview without writing
node cli.js sign-verdict prd test-001 PASS --dry-run
```

The plugin picks up signed artifacts on the next tool call. Gates update from
the cryptographic signature — never from forgeable text.

## Repository Layout

```
~/.config/opencode/
├── opencode.json              # Entry-point config (plugin, MCP, permissions)
├── oh-my-openagent.json       # 18 agents + 9 categories + model routing
├── AGENTS.md                  # Root system prompt (compaction, routing, rules)
├── COMPLETE-CODEBASE.md       # Full system map (architecture, timeline, routing)
├── plugins/sisyphus-gates/    # Governance plugin
│   ├── src/                   # 18 source modules
│   ├── cli.js                 # Operator-only signing CLI (sign-verdict, approve, protocol)
│   ├── test/                  # 21 test files (446 tests) + 22 self-test scenarios
│   └── THREAT-MODEL.md        # Attack surface analysis
├── skills/                    # 46 skill packs
├── rules/                     # Language + concern rules
├── scripts/                   # Git hooks, drift checks, validators
├── agents/                    # Subagent definitions with permissions
├── prompts/                   # External agent prompts (file:// archive for prompt_append)
└── .github/workflows/ci.yml   # CI: test + nightly canary
```

Operator state lives outside the repo at `~/.sisyphus/` (gitignored):
`state.json`, `workflow.yaml`, `notepads/` (signed verdicts), `evidence/`,
`plans/`, `hotcache.md`.

## Key Concepts

| Term | Meaning |
|------|---------|
| **Fail-closed** | If anything is uncertain (missing state, unknown gates, invalid config), block all actions by default. The safe default is "no." |
| **Phase gate** | A checkpoint the AI cannot pass on its own. PRD and plan review phases block writes and commits until a human signs a verdict. |
| **HMAC verdict** | A cryptographic signature proving a human approved advancing a phase. The AI cannot forge it; produced by `cli.js`. |
| **Trust-root** | The canonical state location (`~/.sisyphus/`) and protected paths the AI is never allowed to edit — enforced unconditionally by Layer 0. |
| **Skill pack** | A `SKILL.md` file that teaches the AI one specific task. |
| **Agent routing** | OpenCode dispatches work to 18 agents or 9 categories, each with its own model and permissions. |

## Security Design

**The AI cannot self-approve.** Gate decisions require HMAC signatures from a
key the AI cannot read. The signing CLI runs in the operator's terminal, not
through OpenCode's tool API.

**The AI cannot tamper with governance.** State files, workflow config, verdict
files, plugin source, and `/proc` are all protected by trust-root paths that no
tool, no agent, no phase, and no approval can override.

**The system is fail-closed by design.** Missing state, unknown gates, invalid
config, or a missing signing key → block everything except read-only tools.

**Everything is tested adversarially.** 446 unit tests include attack
simulations: chaining bypass (`ls && rm -rf /`), command substitution
(`echo $(rm -rf /)`), shell wrappers (`bash -c`, `eval`, `npx`), MCP bypass,
subagent escape, trust-root path traversal, forged verdicts, and session-close
gate regression (subprocess-based CLI dispatch verification).

## Known Limitations

- **Terminal escape (TMUX)**: The AI could spawn a tmux session and run commands
  outside OpenCode's tool pipeline. The plugin only gates what flows through
  OpenCode. Defense requires OS-level controls (AppArmor, containers).
- **Process memory extraction**: An attacker with OS access to `/proc/<pid>/mem`
  could extract the signing key. We block `/proc` reads through OpenCode tools
  but cannot prevent out-of-tier access.
- **Operator is the trust anchor**: If you sign a bad PRD, the system lets it
  through. Signing prevents AI forgery, not operator mistakes.
- **Single-operator**: The signing key is a shared secret. Team use would need
  per-operator keys and a key management system.

## Documentation

- [COMPLETE-CODEBASE.md](./COMPLETE-CODEBASE.md) — full system map, timeline, routing
- [SYSTEM-OVERVIEW.md](./SYSTEM-OVERVIEW.md) — architecture doc
- [THREAT-MODEL.md](./plugins/sisyphus-gates/THREAT-MODEL.md) — attack surface analysis
- [oh-my-openagent.json](./oh-my-openagent.json) — agent + category routing
- [opencode.json](./opencode.json) — entry-point config

## Verify

```bash
npm test                      # 446 unit tests
npm run self-test             # 22 end-to-end scenarios
npm run test:all              # unit + self-test combined
bash scripts/pre-push.sh      # full pre-push suite
```

## Status

- 446/446 unit tests + 22/22 self-test scenarios passing
- `oh-my-openagent` pinned to `4.18.2`; `sisyphus-gates` is a local plugin (`v0.2.0+CLI+protocol`)
- CI runs on Node 22; last updated 2026-06-30
