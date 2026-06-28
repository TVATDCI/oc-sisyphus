---
name: system-reference
description: "System architecture, workflow sequence, skill/agent directory, glossary, anti-patterns, and hardening changes. Use when: (1) 'how does the architecture work', (2) 'what's the phase sequence', (3) 'which skill handles X', (4) 'what are the gates', (5) 'what's new in vX', (6) 'system history', 'why was X decided', 'system report'. Triggers: architecture question, workflow question, skill routing, system overview, version changes, system history, design rationale, full system report. Loads SYSTEM-NARRATIVE.md for full system history and rationale (Apr 30–present, structured by era)."
compatibility: opencode
---

# System Reference v2.1.3

**Core principle**: Monolithic orchestrators fail at governance. Phase-specific skills succeed.

## Architecture v2.1.1

```
                      USER REQUEST
                           │
                           ▼
             ┌─────── Sisyphus (Orchestrator) ──────┐
             │         Owns all approval gates       │
             │         Presents artifacts            │
             │         Waits for explicit approval    │
             │                                       │
              │  Phase-Specific Skills (Sequential):  │
              │  ┌─────────────────────────────────┐  │
              │  │ brief-loader    → Validate brief  │  │
              │  │ prd-writer      → Write PRD      │  │
              │  │ momus-prd-reviewer→ PRD review   │  │
              │  │ issue-creator   → Vertical slices│  │
              │  │ plan-writer     → Execution plan │  │
              │  │ momus-plan-reviewer→ Plan review │  │
              │  │ wave-executor   → One wave only  │  │
              │  │ plan-updater    → Progress log   │  │
              │  │ plan-closer     → Archive       │  │
              │  └─────────────────────────────────┘  │
              │                                       │
               │  Supporting Skills:                    │
               │  ┌─────────────────────────────────┐  │
               │  │ reference-checker→ Conflicts   │  │
               │  │ security-auditor → Pre-deploy   │  │
               │  │ tdd-executor     → TDD cycles    │  │
               │  │ regression-gate  → Cross-wave   │  │
               │  │ workflow-guard   → Edit tracking│  │
               │  │ athena-research  → Exploration   │  │
               │  │ vault-ops        → Wiki publish  │  │
               │  │ vault-lint       → Validation    │  │
               │  │ skill-creator    → Authoring     │  │
               │  └─────────────────────────────────┘  │
               │                                       │
               │  Rules System (auto-loaded):         │
               │  ┌─────────────────────────────────┐  │
               │  │ languages/       → ts, py, sh   │  │
               │  │ concerns/        → testing, git │  │
               │  └─────────────────────────────────┘  │
               │                                       │
               │  Validation Pipeline:                  │
               │  ┌─────────────────────────────────┐  │
               │  │ validate-skills.sh → Pre-deploy │  │
               │  │ skill-creator    → Auto-check   │  │
               │  └─────────────────────────────────┘  │
             │                                       │
             └───────────────────────────────────────┘
                           │
                           ▼
               .sisyphus/evidence/ (logged)
               beads issue closed
               wiki updated (vault-ops)
               index updated (vault-lint)
```

**Why v2.1?** v1.x used a 964-line monolithic `sisyphus-plan` skill inside one `task()` call. HALT instructions were ignored because subagents cannot pause for user input. v2.0 split work into separate `task()` calls per phase. v2.1 adds dual Momus governance gates (PRD review + Plan review), standardized handoff contracts across all chain skills, and real-world validation on the rotating-x project.

---

## Phase Sequence (v2.1.1)

Each phase is a **separate `task()` call**. The main Sisyphus agent presents output and waits for your approval before triggering the next phase.

```
User: "Plan this project"
    ↓
[Phase 1] brief-loader → "Brief validated"
    ↓ (pause — you approve)
User: "approved"
    ↓
[Phase 2] prd-writer → "PRD written"
    ↓ (mandatory gate)
[Gate 1] momus-prd-reviewer → "PRD review PASS"
    ↓ (pause — you approve)
User: "approved"
    ↓
[Phase 3] issue-creator → "Issues created"
    ↓ (pause — you approve)
User: "approved"
    ↓
[Phase 4] plan-writer → "Plan ready"
    ↓ (mandatory gate)
[Gate 2] momus-plan-reviewer → "Plan review PASS"
    ↓ (pause — you approve)
User: "start execution"
    ↓
[Phase 5] wave-executor → "Wave 1 complete"
    ↓ (pause — you approve)
User: "continue"
    ↓
[Phase 5] wave-executor → "Wave 2 complete"
    ↓ (repeat until done)
    ↓
[Phase 6] plan-updater → "Progress logged"
    ↓
[Phase 7] plan-closer → "Plan archived"
```

**No HALT text needed.** The architecture IS the gate.

---

## The 3-Artifact Chain

| # | Artifact | Status | Lives In | Purpose |
|---|---|---|---|---|
| 1 | Planning Brief | Ephemeral | `.sisyphus/notepads/{name}/discovery-*.md` | Conversational alignment |
| 2 | Approved PRD | **FROZEN** | `.sisyphus/prds/{name}-prd.md` | Destination document (what we're building) |
| 3 | Execution Plan | Derived, updated | `.sisyphus/plans/{name}.md` | Journey document (how we build it) |

**Key rule**: PRD is frozen after approval. Changes go into plan/issues, NOT back into PRD.

### PRD Anti-Drift Rule

| Change Type | Action |
|-------------|--------|
| **Minor wording** | No replan needed. Update plan notes. |
| **Material scope/slice change** | Regenerate issues, reconcile dependencies. PRD stays frozen. |
| **New feature not in PRD** | Out of scope. Create new brief → new PRD. |

---

## Skill Directory

### Phase-Specific Skills (v2.1)
| Skill | Triggers |
|-------|----------|
| `brief-loader` | "approved brief" |
| `prd-writer` | "write PRD", "approved brief" |
| `issue-creator` | "break into issues", "vertical slices" |
| `plan-writer` | "create plan", "start initiative" |
| `wave-executor` | "start execution", "continue" |
| `plan-updater` | "update plan", "mark done" |
| `plan-closer` | "close plan", "finish initiative" |

### Supporting Skills
| Skill | Purpose |
|-------|---------|
| `momus-prd-reviewer` | Deep PRD review |
| `momus-plan-reviewer` | Deep plan review |
| `reference-checker` | Mechanical conflict scan |
| `security-auditor` | Pre-deploy security scan |
| `tdd-executor` | RED-GREEN-REFACTOR cycles |
| `regression-gate` | Cross-wave testing |
| `workflow-guard` | Untracked edit tracking |
| `discovery-orchestrator` | Social discovery |
| `athena-research` | Codebase research |
| `vault-ops` | Wiki publishing/archival |
| `vault-lint` | Structure validation |
| `git-commit-message` | Commit message drafting |
| `agent-development` | Agent/skill configuration |
| `skill-creator` | Create/improve skills |
| `build-resolver` | Build error diagnosis |

### Agents
| Agent | Purpose |
|-------|---------|
| `oracle` | High-IQ reasoning for architecture/debugging |
| `athena` | Research specialist |
| `auditor` | Read-only vault validation |
| `archivist` | Wiki publishing |
| `post-reviewer` | Post-change code review |

---

## Skill Collaboration Matrix

| Task | Use This Skill | Category | Do NOT Use |
|------|---------------|----------|------------|
| Validate brief | `brief-loader` | orchestration | — |
| Write PRD | `prd-writer` | deep | vault-ops |
| Review PRD | `momus-prd-reviewer` | deep | sisyphus-plan |
| Create issues | `issue-creator` | orchestration | vault-ops |
| Create plan | `plan-writer` | orchestration | vault-ops |
| Review plan | `momus-plan-reviewer` | deep | sisyphus-plan |
| Execute wave | `wave-executor` | orchestration | sisyphus-plan |
| TDD within wave | `tdd-executor` | orchestration | wave-executor |
| Regression between waves | `regression-gate` | unspecified-low | wave-executor |
| Track edits | `workflow-guard` | unspecified-low | — |
| Update progress | `plan-updater` | orchestration | sisyphus-plan |
| Close plan | `plan-closer` | orchestration | sisyphus-plan |
| Research | `athena-research` | deep | vault-ops |
| Wiki updates | `vault-ops` | unspecified-low | sisyphus-plan |
| Validate structure | `vault-lint` | unspecified-low | vault-ops |

---

## Upstream OpenCode Routing

Our custom system (oh-my-openagent + 44 real skills + 1 _shared reference) coexists with upstream OpenCode's built-in features. Some have overlapping capabilities. When both exist, the decision is:

| Capability | Use Our Custom | Use Upstream Built-in |
|---|---|---|
| **Browser automation** | `website-analyzer` — full DESIGN.md generation, multi-pass extraction, strategy recommendation | `/playwright` — simple browser commands, screenshots, quick tests |
| **Codebase research** | `explore`/`athena-research` — thorough contextual grep across our custom skills and agents | `explore` subagent (Tab or `/agent explore`) — general codebase exploration |
| **Multi-step research** | `oracle`/`librarian` agents — high-IQ reasoning, remote docs, GitHub examples | `general` subagent (use `@general`) — complex searches |
| **Background tasks** | `background_task` in oh-my-openagent.json — configured, production-tested | Experimental background subagents — not yet stable; avoid until confirmed |
| **Config editing** | `agent-development` — custom agents, skills, permissions | `customize-opencode` — safe native OpenCode config edits |
| **Code review** | `code-review` skill — structured review (correctness, security, performance, maintainability, testing). For subagent reviews use `reviewer.md` (combined oracle+auditor+post-reviewer) or `post-reviewer.md` (post-change only); both read-only with granular bash. For 5-agent parallel use `/review-work`. | `plan` agent (Tab to switch) — quick read-only analysis |
| **Planning/design** | `discovery-orchestrator` → `prd-writer` → `issue-creator` → `plan-writer` (full Sisyphus workflow) | `plan` agent — quick one-shot analysis without custom workflow |

**Rule of thumb:** If the task fits our custom workflow (discovery → PRD → issues → plan → waves), use our skills. If it's a one-off or quick task that OpenCode handles natively, use the built-in.

---

## System History & Full System Report

### System History

This skill is the entry point for questions about *why* the system is the way it
is. For full developmental history and design rationale (the Governance Crisis,
the monolith dissolution, HMAC signing adoption, etc.), **load
`SYSTEM-NARRATIVE.md`** in the repo root — it covers Apr 30–present structured
by ERA (Foundation → Growth → Hardening → Production), with cross-references to
the deep archive at `/home/vladi/developer/Reference/meta/` for primary-source
detail.

Read `SYSTEM-NARRATIVE.md` whenever the question is historical or rationale-based
rather than structural. Read `COMPLETE-CODEBASE.md` for current topology/routing.

### Full System Report Capability

When the user asks for a **system report** (e.g., "give me a system report",
"what's the current state of the system", "system status"), produce a
comprehensive status report by synthesizing these sources:

| Source | What it provides |
|--------|-----------------|
| `SYSTEM-NARRATIVE.md` | History, eras, architecture principles, design rationale |
| `COMPLETE-CODEBASE.md` | Current topology, routing, permissions, live timeline |
| `opencode.json` | Entry-point config (plugin, MCP, permissions) |
| `oh-my-openagent.json` | Agents, categories, model routing, provider fallback |

**Report structure:**
1. **Current state** — skill/agent/test counts, plugin version, provider strategy (from COMPLETE-CODEBASE.md "Current System State" + system narrative living section)
2. **Architecture** — 9-phase workflow, gate layers, HMAC signing (from system-reference + COMPLETE-CODEBASE.md)
3. **Recent changes** — last ~5 timeline entries from COMPLETE-CODEBASE.md
4. **Architecture principles** — the 5 constitutional principles (from SYSTEM-NARRATIVE.md)
5. **Known limitations / gaps** — from THREAT-MODEL.md and any open items in the timeline

Keep the report scannable: lead with current state, then depth on demand. Do not
dump full file contents — synthesize and point to sources for detail.

---

## Anti-Patterns

- ❌ Using `sisyphus-plan` v1.x (964-line monolith)
- ❌ Single `task()` call for multiple phases
- ❌ vault-ops creating plans or validating structure
- ❌ athena-research modifying files or executing commands
- ❌ Horizontal layers (all schema, then all API, then all UI)
- ❌ PRD edited after approval (frozen means frozen)
- ❌ Closing beads issue before evidence is logged

---

## v2.1.2 Hardening Changes

### Hard Gates (Wave cannot complete if missing)

| Gate | What It Checks |
|------|---------------|
| Evidence validator | Evidence files exist in `.sisyphus/evidence/` |
| Goal-backward check | Verification tables present for each slice |
| Model transparency | "Executing with [model] via [category]" in output |
| DESIGN.md check | DESIGN.md exists when UI work detected |
| Build evidence | Build output attached to evidence |

### Enforcement

- `wave-validator.sh` — Called before wave summary presentation
- `track-execution.sh` — Records model/category for each delegation

### What's New in v2.1.2
1. Mechanical validation — wave-validator.sh enforces all hard gates
2. Execution tracking — track-execution.sh records model/category usage
3. DESIGN.md mandatory for UI work
4. Evidence as blocking requirement
5. Model transparency enforcement
6. Post-reviewer agent
7. build-resolver skill
8. efficiency.md rules

---

## Glossary

| Term | Meaning |
|------|---------|
| **Brief** | Conversational planning output. Ephemeral. |
| **PRD** | Product Requirements Document. Frozen after approval. |
| **Plan** | Derived execution document. Updated as work progresses. |
| **Vertical Slice** | End-to-end implementation touching all necessary layers. |
| **AFK** | "Away From Keyboard" — tasks runnable without human present. |
| **Human-in-the-Loop** | Tasks requiring human review (UI, architecture, taste). |
| **beads** | Issue tracker (`bd`). Operational memory. |
| **Skill** | Reusable capability. 15+ skills in the system. |
| **Phase** | One step in the planning/execution workflow. |
| **Gate** | Approval boundary between phases. |

---

*System version: 2.1.3*
*Agents: 5 | Phase Skills: 7 | Supporting Skills: 15 | Wiki pages: 189*
