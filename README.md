# Sisyphus — a production-grade AI agent platform with governance baked in

> 47 skills that can clone a website, write a PRD, build a full-stack app,
> ship a fragment shader, generate a PPTX, or run a security audit — paired
> with a cryptographic governance layer that makes the agent trustworthy
> enough to actually deploy.

## Table of contents

- [The 30-second version](#the-30-second-version)
- [What can it actually do?](#what-can-it-actually-do)
- [What makes it safe?](#what-makes-it-safe)
- [Who is this for?](#who-is-this-for)
- [Quick start](#quick-start)
- [How does it work? (deep dive)](#how-does-it-work-deep-dive)
- [Signing verdicts (operator guide)](#signing-verdicts-operator-guide)
- [Repository layout](#repository-layout)
- [Key concepts](#key-concepts)
- [Security design](#security-design)
- [Known limitations](#known-limitations)
- [How does this differ from typical agent safety patterns?](#how-does-this-differ-from-typical-agent-safety-patterns)
- [Documentation](#documentation)
- [Verify](#verify)
- [Status](#status)

---

## The 30-second version

Most AI coding agent configs are one of two things:

- **Powerful but unsafe** — the agent can read, write, and execute anything;
  you trust it not to destroy your work. Eventually it does.
- **Safe but crippled** — the agent asks for confirmation on every action;
  you end up doing the work yourself.

Sisyphus is a third option: **an agent that retains its full power, but
cannot self-approve destructive work or advance past review phases without
your cryptographic signature.** You get the productivity; the agent can't
cause damage.

Built on [OpenCode](https://github.com/sst/opencode) (the agent runtime),
Sisyphus sits between the agent and every tool call:

```
agent: bash("rm -rf node_modules/ && git push --force")
  ↓
sisyphus-gates plugin: ⛔ blocked — catastrophic denylist + not in approved phase
  ↓
you: unaffected. The agent tries a safer path or asks for direction.
```

```
agent: "PRD review phase complete, advancing to plan-writing."
  ↓
sisyphus-gates plugin: ⛔ blocked — no signed verdict in ~/.sisyphus/notepads/
  ↓
you (in your terminal): node cli.js sign-verdict prd my-prd-001 PASS
  ↓
agent: advances. Cannot forge this on its own — the HMAC key is outside its reach.
```

## What can it actually do?

A non-exhaustive list of what the 47 skills produce. None of these are demos —
each is a working `SKILL.md` with evals.

**Build end-to-end artifacts:**

- **Clone a website** — `website-analyzer` reverse-engineers a site into a
  21-section DESIGN.md + structured content inventory + tech detections, then
  planning + execution skills reproduce it
- **Run a full software project** — `discovery-orchestrator` → `prd-writer` →
  `plan-writer` → `wave-executor` → `regression-gate` → `plan-closer` walks
  a project from idea to shipped through 9 HMAC-gated phases
- **Build full-stack apps** — `fullstack-dev` designs services, auth flows
  (JWT/session/OAuth), real-time layers (SSE/WebSocket); `frontend-ui-ux`
  ships UI/UX work without design mocks
- **Write shaders** — `shader-dev` produces compile-checked WebGL2 fragment
  shaders via a fixed harness
- **Generate presentations** — `document-builder` emits PPTX via PptxGenJS

**Review and audit existing work:**

- **Security audit** — `security-auditor` scans 6 vulnerability categories
  (secrets, injection, XSS, auth/CSRF, dependencies, path traversal) with
  PASS/WARN/FAIL verdicts
- **Code review** — `code-review` produces structured reviews covering
  correctness, security, performance, maintainability
- **UI/UX audit** — `ui-auditor` validates CSS architecture, accessibility,
  performance budget, theme system against DESIGN.md specs
- **PRD / plan review** — `momus-prd-reviewer` and `momus-plan-reviewer`
  ruthlessly audit planning docs for contradictions, scope creep, missing
  verification before a human signs off

**Research and learn:**

- **Gather context** — `athena-research`, `toolkit-research` (web/docs/GitHub),
  `toolkit-lsp` (LSP-powered code analysis)
- **Multi-session curricula** — `teach` builds Markdown learning workspaces
  anchored to a mission, with lessons, glossary, and learning records

**Plan and orchestrate:**

- **Discovery** — `discovery-orchestrator` turns vague requests into planning
  briefs via Socratic Q&A
- **Issue creation** — `issue-creator` breaks PRDs into vertical-slice issues
- **Plan writing** — `plan-writer` produces structured execution plans
- **Wave execution** — `wave-executor` runs slices in waves with evidence
  logging, goal-backward verification, QA handoffs

## What makes it safe?

Three properties, enforced cryptographically:

1. **The agent cannot self-approve.** Advancing the workflow requires an HMAC
   signature from a key at `~/.local/share/sisyphus-gate-key` — produced by
   you in your terminal, not through the agent's tool API. The agent cannot
   read this file, cannot read `/proc` to extract the key from memory, and
   cannot read the plugin source to study the algorithm.
2. **The agent cannot tamper with the rules.** State files, plugin source,
   the workflow definition, `/proc`, and the signing key itself are all in
   trust-root paths that no tool, no agent, no phase can override.
3. **The system fails closed.** Missing state, unknown gates, broken config,
   or a missing signing key → block everything except reads. The safe
   default is "no."

## Who is this for?

- **Operators deploying AI agents for real work** — fork this, adapt the
  workflow + agents + skill routing to your stack, get a working governance
  layer for free. The plugin is local; pin it to whatever OpenCode runtime
  you're running.
- **AI safety / governance researchers** — the
  [THREAT-MODEL.md](./plugins/sisyphus-gates/THREAT-MODEL.md) documents the
  attack surface; the plugin's 10-layer decision stack is a reference
  implementation of fail-closed agent gating with HMAC-signed verdicts.
- **Builders wanting a starting skill library** — 47 skills spanning planning,
  review, execution, research, development, system operations. Each is a
  readable `SKILL.md` you can fork, study, or rewrite.

## Quick start

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
npm test              # 648 unit tests across 25 files (~5s)
npm run self-test     # 22 end-to-end scenarios (~50ms)
npm run test:all      # unit + self-test combined
```

## How does it work? (deep dive)

Five layers work together.

### 1. Governance Plugin (`sisyphus-gates`)

A Node.js plugin that sits between OpenCode and every tool call the AI tries.
It inspects each action, blocks the dangerous ones, and enforces a phased
workflow. 19 source modules, 648 unit tests across 25 test files, 22
end-to-end scenarios.

**Decision stack** (checked in order, first match wins):

| Layer                     | What it checks                                                                                                                                                                                        | Example                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 0 — Trust-root paths      | No tool may write/read state.json, workflow.yaml, verdict files, /proc, or plugin source                                                                                                              | AI tries to write state.json → blocked                                                                        |
| 1 — Catastrophic denylist | Hardened: `rm -rf /`, `dd`, `mkfs` + wrapper-recursion (`env rm`), structural (`{rm,ls}`), newline injection, env-prefix smuggling (`LD_PRELOAD`), PATH-qualified (`/bin/rm`) — blocked in all phases | AI tries `env rm -rf /` → blocked                                                                             |
| 2 — Sudo                  | Never allowed, any phase                                                                                                                                                                              | `sudo apt update` → blocked                                                                                   |
| 3 — Safe read-only tools  | `read`, `grep`, `glob`, `websearch` — always allowed                                                                                                                                                  | `read file.js` → allowed                                                                                      |
| 3.5 — MCP classification  | External MCP tools classified as read/write/unknown; unknown denied by default                                                                                                                        | `myfiles_unknown_tool` → blocked                                                                              |
| 3.7 — Sandbox allowlist   | If cwd resolves into a `sandbox_paths` prefix AND command matches `sandbox_allowed_commands` → allowed with audit (Layers 0–3.5 still apply)                                                          | `npm install` in `/tmp/` → allowed                                                                            |
| 4 — Safe bash allowlist   | `ls`, `cat`, `git status`, `git log` — allowed even when fail-closed                                                                                                                                  | `ls -la` → allowed                                                                                            |
| 4.5 — Compound allow      | Read-only compounds (`git status && git log`, `ls \| head`) — every segment independently safe-readonly + non-destructive + charset-clean                                                             | `git status && git log` → allowed                                                                             |
| 5 — Fail-closed           | If state missing, gates unknown, or config unavailable → block everything except reads                                                                                                                | No state.json → blocked                                                                                       |
| 6 — Phase-specific        | During review phases: write/edit/git commit blocked. During execution: destructive commands blocked (stricter policy)                                                                                 | PRD review phase + `git commit` → blocked                                                                     |
| 6.5 — Session-close gate  | `git push` / `bd dolt push` blocked when `session_close.status === "open"` (protocol started but not completed). Operator-side state field; prose claims of "closed" are non-authoritative            | Agent claims "session closed" + `git push` without running `cli.js protocol complete session-close` → blocked |

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
cannot read this file, cannot read `/proc` to extract the key from memory,
and cannot read the plugin source to study the algorithm.

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

**Session-close protocol (anti-drift):** `git push` and `bd dolt push` are
blocked when `session_close.status === "open"`. The state field is the source
of truth — prose claims of "closed" are non-authoritative.

```bash
cd ~/.config/opencode/plugins/sisyphus-gates
node cli.js protocol start session-close                    # marks protocol active; gate will block push
node cli.js protocol complete session-close                 # marks all 4 layers done; gate allows push
node cli.js protocol override session-close --reason "..."  # operator bypass for legit cases
```

### 4. Skills (47 Instruction Modules)

`SKILL.md` files that teach the AI specific tasks — reusable instruction
manuals triggered by domain match:

- **Planning**: `discovery-orchestrator`, `prd-writer`, `plan-writer`, `issue-creator`
- **Review**: `momus-prd-reviewer`, `momus-plan-reviewer`, `code-review`, `security-auditor`, `ui-auditor`
- **Execution**: `wave-executor`, `tdd-executor`, `build-resolver`, `regression-gate`
- **Research**: `athena-research`, `teach`, `toolkit-lsp`, `toolkit-research`, `website-analyzer`
- **Development**: `fullstack-dev`, `frontend-ui-ux`, `skill-creator`, `agent-development`, `shader-dev`, `document-builder`
- **System**: `session-close`, `shell-safety`, `system-reference`, `opencode-expert`, `vault-ops`

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
etc.) using a 3-tier fallback strategy: subscription primary → lite subscription
→ pre-pay-as-you-go. Edit `~/.omo/omo.jsonc` (`[opencode]` section) to wire your own
provider/model combinations.

## Signing verdicts (operator guide)

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

## Repository layout

```
~/.config/opencode/
├── opencode.json              # Entry-point config (plugin, MCP, permissions)
├── AGENTS.md                  # Root system prompt (compaction, routing, rules)
├── COMPLETE-CODEBASE.md       # Full system map (architecture, timeline, routing)
├── SYSTEM-NARRATIVE.md        # Era-structured developmental history + rationale
├── plugins/sisyphus-gates/    # Governance plugin
│   ├── src/                   # 19 source modules
│   ├── cli.js                 # Operator-only signing CLI (sign-verdict, approve, protocol)
│   ├── test/                  # 25 test files (648 tests) + 22 self-test scenarios
│   └── THREAT-MODEL.md        # Attack surface analysis
├── skills/                    # 47 skill packs
├── rules/                     # Language + concern rules
├── scripts/                   # Git hooks, drift checks, validators, MCP wrapper
├── agents/                    # Subagent definitions with permissions
├── prompts/                   # External agent prompts (file:// archive for prompt_append)
└── .github/workflows/ci.yml   # CI: test + nightly canary
```

Operator state lives outside the repo at `~/.sisyphus/` (gitignored):
`state.json`, `workflow.yaml`, `notepads/` (signed verdicts), `evidence/`,
`plans/`, `hotcache.md`.

## Key concepts

| Term              | Meaning                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Fail-closed**   | If anything is uncertain (missing state, unknown gates, invalid config), block all actions by default. The safe default is "no."         |
| **Phase gate**    | A checkpoint the AI cannot pass on its own. PRD and plan review phases block writes and commits until a human signs a verdict.           |
| **HMAC verdict**  | A cryptographic signature proving a human approved advancing a phase. The AI cannot forge it; produced by `cli.js`.                      |
| **Trust-root**    | The canonical state location (`~/.sisyphus/`) and protected paths the AI is never allowed to edit — enforced unconditionally by Layer 0. |
| **Skill pack**    | A `SKILL.md` file that teaches the AI one specific task.                                                                                 |
| **Agent routing** | OpenCode dispatches work to 18 agents or 9 categories, each with its own model and permissions.                                          |
| **Wave**          | A unit of execution within the Execution phase — one or more slices shipped together with evidence logging.                              |
| **Slice**         | A vertical-slice issue (from issue-creator) that wave-executor picks up and ships through goal-backward verification.                    |

## Security design

**The AI cannot self-approve.** Gate decisions require HMAC signatures from a
key the AI cannot read. The signing CLI runs in the operator's terminal, not
through OpenCode's tool API.

**The AI cannot tamper with governance.** State files, workflow config, verdict
files, plugin source, and `/proc` are all protected by trust-root paths that no
tool, no agent, no phase, and no approval can override.

**The system is fail-closed by design.** Missing state, unknown gates, invalid
config, or a missing signing key → block everything except read-only tools.

**Everything is tested adversarially.** 648 unit tests include attack
simulations: chaining bypass (`ls && rm -rf /`), command substitution
(`echo $(rm -rf /)`), shell wrappers (`bash -c`, `eval`, `npx`), MCP bypass,
subagent escape, trust-root path traversal, forged verdicts, and session-close
gate regression (subprocess-based CLI dispatch verification).

See [THREAT-MODEL.md](./plugins/sisyphus-gates/THREAT-MODEL.md) for the full
attack surface analysis.

## Known limitations

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
- **Out-of-tier terminal access**: A sufficiently-determined agent could
  exfiltrate via side channels (DNS, network) that bypass the tool pipeline.
  Mitigation is environment-level, not plugin-level.

## How does this differ from typical agent safety patterns?

Most agent safety approaches fall into one of three buckets. Sisyphus is a
fourth.

| Pattern                                               | What it does                                                                                           | What it doesn't do                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Confirm-each-action** (common in coding assistants) | Prompts the operator before every tool call                                                            | Doesn't scale — operator either rubber-stamps or does the work themselves                                       |
| **Process sandbox** (container/namespace isolation)   | Limits blast radius at the OS level                                                                    | Doesn't prevent the agent from doing approved-but-wrong things inside the sandbox; doesn't gate workflow phases |
| **Tool allowlist / RBAC**                             | Restricts which tools exist                                                                            | Doesn't enforce sequencing or review gates; agent can still self-approve within its allowed set                 |
| **Sisyphus (this repo)**                              | Cryptographic phase gates + fail-closed defaults + trust-root path protection + workflow state machine | Requires OpenCode as the agent runtime; not a standalone sandbox                                                |
| **Confirm-each-action** (common in coding assistants) | Prompts the operator before every tool call                                                            | Doesn't scale — operator either rubber-stamps or does the work themselves                                       |
| **Process sandbox** (container/namespace isolation)   | Limits blast radius at the OS level                                                                    | Doesn't prevent the agent from doing approved-but-wrong things inside the sandbox; doesn't gate workflow phases |
| **Tool allowlist / RBAC**                             | Restricts which tools exist                                                                            | Doesn't enforce sequencing or review gates; agent can still self-approve within its allowed set                 |
| **Sisyphus (this repo)**                              | Cryptographic phase gates + fail-closed defaults + trust-root path protection + workflow state machine | Requires OpenCode as the agent runtime; not a standalone sandbox                                                |

The distinctive property: **the agent cannot advance the workflow without
operator signature, even if every individual action is otherwise allowed.**
That's the gap most patterns leave open.

## Documentation

- [COMPLETE-CODEBASE.md](./COMPLETE-CODEBASE.md) — full system map, timeline, routing
- [SYSTEM-NARRATIVE.md](./SYSTEM-NARRATIVE.md) — era-structured developmental history + design rationale
- [THREAT-MODEL.md](./plugins/sisyphus-gates/THREAT-MODEL.md) — attack surface analysis
- `~/.omo/omo.jsonc` — agent + category routing (4.19.4+ unified config, `[opencode]` section)
- [opencode.json](./opencode.json) — entry-point config
- Per-skill `SKILL.md` files in `skills/*/` — read any of them for a concrete example of the skill format

## Verify

```bash
npm test                      # 648 unit tests
npm run self-test             # 22 end-to-end scenarios
npm run test:all              # unit + self-test combined
bash scripts/pre-push.sh      # full pre-push suite
```

## Status

- **648/648 unit tests + 22/22 self-test scenarios passing**
- `oh-my-openagent` pinned to `4.19.4`
- `sisyphus-gates` local plugin — current: `v0.4.1` (Layer 3.7 sandbox allowlist
  Jun 27; Layer 6.5 session-close gate Jun 30; Layer 1 catastrophic-defense
  hardening Jul 23; Layer 4.5 compound-allow Jul 23; Finding A bd subcommand
  reclassification Jul 25; Finding B quote-aware metachar + T4/T5 trust-root
  boundary Jul 25; brain-hxm P0 destructive-set extension Jul 27)
- CI runs on Node 22
- Active maintenance — see [commit history](./commits/main)

## License

[MIT](./LICENSE) — Copyright (c) 2026 TVATDCI and contributors.
