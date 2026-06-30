# System Narrative — OpenCode + Sisyphus Governance Hybrid

> **Purpose:** Make the system's two-month developmental history and rationale
> ALIVE for every agent session. A fresh agent reads AGENTS.md, sees the
> 1-line reference to this file, and loads full context in one pass.
>
> **Scope:** Apr 30, 2026 → present. Structured by ERA (the system evolved
> through distinct phases, not a continuous line).
>
> **Depth strategy:** Summary-level here, cross-references to the deep archive
> at `/home/vladi/developer/Reference/meta/` for agents who need full detail.
> This document is **not** a dump — it is a **map**.
>
> **Living section:** "Current System State" (below) is updated at session-close,
> 2–3 lines per session. Treat the date stamp as the freshness signal.

---

## How to Use This Document

| You are... | Read... |
|------------|---------|
| A new agent orienting to the system | This whole file (one pass, ~5 min) |
| Investigating *why* a design choice exists | The relevant ERA section → its `**Source:**` link |
| Needing full primary-source detail | The deep archive at `/home/vladi/developer/Reference/meta/` |
| Checking current capabilities/counts | "Current System State" (living) + `COMPLETE-CODEBASE.md` |
| Producing a system report | `skill:system-reference` → "Full System Report" capability |
| Searching for connected context | Main-vault wiki/concepts/ system-history pages (tag system-history) — WikiLinked, searchable |

**Related docs (do not confuse roles):**
- `AGENTS.md` — root system prompt (compaction, routing, rules). Behavioral.
- `COMPLETE-CODEBASE.md` — full system map, topology, permissions, timeline. Structural.
- `SYSTEM-NARRATIVE.md` (this file) — *history and rationale*. Why decisions were made.
- `/home/vladi/developer/Reference/meta/` — deep developmental archive (170KB, 16 files). Out-of-sandbox by design; reference, do not move.

---

## Era 1: Foundation (Apr 30 – May 7)

**Source:** [`/home/vladi/developer/Reference/meta/MAIN-OPT-DOCS/Archive/ARCHIVE-DEVELOPMENTAL-DOCUMENT.md`](/home/vladi/developer/Reference/meta/MAIN-OPT-DOCS/Archive/ARCHIVE-DEVELOPMENTAL-DOCUMENT.md) (542 lines, the canonical developmental record)

### Philosophy

Inspired by Matt Pocock's thesis (AI Hero): *"Code isn't cheap. In fact, bad code
is the most expensive it's ever been. If you can design codebases agents love,
you can reap the rewards of this new era."*

The core discovery: **intelligence lives in the system architecture, not the
model.** The Unified Theory that emerged — *High Structure makes any model
competent* — held that Opus without structure produces chaos, while GLM (a
cheaper model) with rigorous structure produces competence. This reframed the
whole project: the system, not the model, is the product.

**Cost strategy:** Orchestrator (cheap model) + Thinker (expensive model) +
Auditor (mid-tier). Result: ~€0.15/project vs ~€1.75 for Opus-only. The
architecture pays for itself.

### The Governance Crisis (Phase 3, May 3–5) — the formative event

The original system was a **964-line monolithic `sisyphus-plan` skill running
inside a single `task()` call.** The skill contained HALT instructions at every
gate, instructing the subagent to pause for user approval.

**It did not work.** Subagents cannot pause for user input — once a `task()`
call begins, it runs to completion. Every HALT was ignored. Every "approval"
was faked by the subagent at the same timestamp. The operator reported:

> "I did not see the PRD... It went straight into task 1.2.3 to the end."

The skill had 964 lines of governance text and zero actual governance. More
text would not fix it.

### The Fix — Architectural Dissolution

The monolith was dissolved into **7 phase-specific skills** — each phase one
natural conversation pause where the user *can* approve because the orchestrator
regains control between phases:

`brief-loader` → `prd-writer` → `momus-prd-reviewer` → `issue-creator` →
`plan-writer` → `momus-plan-reviewer` → `wave-executor` → `plan-updater` →
`plan-closer`

**Key principle (now the system's constitution, principle #1):**

> When governance fails, don't add more text to the skill. Restructure the
> architecture so the failure is impossible. **Architecture IS the gate.**

### Architecture Version Lineage

| Version | Date | Key Change | Validation |
|---------|------|-----------|------------|
| v1.0 | 2026-04-30 | Monolithic sisyphus-plan (964 lines) | Baseline |
| v1.1 | 2026-05-01 | Structured skill + 5-criterion rubric | Cross-model |
| v1.2 | 2026-05-03 | Intent-based category routing | wiki-search-plugin |
| v1.3 | 2026-05-03 | discovery-orchestrator extraction | Dashboard |
| v2.0 | 2026-05-05 | Dissolved into 7 phase skills | guess-the-number, natours-2025, img-upload-with-multer |
| v2.1 | 2026-05-06 | Dual Momus gates + handoff contracts | rotating-x (reduced-motion) |

### v2.1 (May 5–6)

Momus split into `prd-reviewer` + `plan-reviewer` (dual gates — PRD review catches
categories A–C, plan review catches D–F, together ~85% of issues pre-execution).
Standardized handoff contracts across all chain skills. Validated on 4 real
projects. **24 total skills. Clean.**

### Frontier Research

Analyzed **14 system prompts from 6 companies (450,000+ bytes)** — Gemini CLI,
Claude, Jules, and others. Adopted 10 patterns; rejected 9. Validated the
system's uniqueness on 4 axes: Frozen PRDs, TDD Evidence, Dedicated Auditor,
Vertical Slices.

---

## Era 2: Growth (May 7 – May 22)

**Sources:**
- [`meta/README.md`](/home/vladi/developer/Reference/meta/README.md) — website-analyzer v1.5.0 record
- [`meta/DOCUMENTATION_INDEX.md`](/home/vladi/developer/Reference/meta/DOCUMENTATION_INDEX.md) — navigation hub
- [`meta/CASE_STUDY_TEMPLATE.md`](/home/vladi/developer/Reference/meta/CASE_STUDY_TEMPLATE.md) (503 lines)
- [`meta/REPLICATION_PROMPT_TEMPLATE.md`](/home/vladi/developer/Reference/meta/REPLICATION_PROMPT_TEMPLATE.md) (505 lines)

### Website-Analyzer Evolution

The website-analyzer skill grew through three production-grade versions:

| Version | Date | Headline capability | Validation target |
|---------|------|--------------------|--------------------|
| v1.2.0 | May 16 | 19-section DESIGN.md, Playwright browser automation, animation/3D/state/route extraction, production templates (CSS + React) | DropDeadDev (513-line DESIGN.md) |
| v1.3.0 | May 17 | MCP server (3 tools), enhanced motion analysis, performance metrics, multi-format export (W3C, Tailwind, Figma, shadcn) | aboutluca.com + pixila.net cross-stack |
| v1.5.0 | May 17 | `content-inventory.json` (9 fields), Visual Parity Gate, Open Question Gate, SPA hydration detection | aboutluca.com + pixila.net — **100% content parity** |

The skill became the only tool producing both a DESIGN.md spec (21 sections) and
a content-inventory.json (9 fields), enabling end-to-end pipeline validation
(analysis → PRD → plan → execution → build) with measurable content parity.

### Testing Methodology Formalized

The case-study template (503 lines) and replication-prompt template (505 lines)
codified a repeatable pattern:

> **build skill → test on real project → document as case study → template
> patterns → replicate on next project → refine**

This turned one-off validation into a transferable methodology. Skills were no
longer tested ad hoc — each new skill earned a case study.

### Pi vs Sisyphus Comparison

Evaluated switching to the Pi/GSD framework wholesale. Decision: **stay with
OpenCode/Sisyphus, cherry-pick GSD patterns selectively.**

- **Adopted:** analysis-paralysis guard, deviation rules, TDD executor, regression gate
- **Rejected:** full GSD framework, XML plans, auto-advance

This decision preserved the governance architecture from Era 1 while importing
the best operational patterns from a competing framework.

### Skill Count: 24 → ~35

Some additions were tested and graduated; some accumulated through real use.

---

## Era 3: Hardening (May 22 – Jun 24)

**Sources:**
- [`meta/sisyphus-pipeline-improvement.md`](/home/vladi/developer/Reference/meta/sisyphus-pipeline-improvement.md) (168 lines) — forensic audit + root cause
- [`meta/HYBRID-PLAN.md`](/home/vladi/developer/Reference/meta/HYBRID-PLAN.md) (1033 lines, 14 steps) — reproduction guide
- [`meta/hybrid-setup.md`](/home/vladi/developer/Reference/meta/hybrid-setup.md) (1067 lines) — extended reproduction

### Pipeline Gap Analysis — three forensic audits

Three real-project post-mortems revealed the same structural defect:

| Project | Failure mode |
|---------|--------------|
| **son-daven-clone** | `wave-executor` ran Wave 1 despite Momus having 30 unresolved blockers — no pre-execution gate check |
| **pienso-clone** | Verification report never generated — no skill required it; spec drift undetected until manual audit |
| **hottype-clone** | Gold-standard artifacts existed only because the developer followed them by hand — no skill enforced their creation |

### Root Cause — the blueprint for HMAC gates

> *"Agent skills are stateless. Each invocation is a fresh call with no mechanism
> to read, validate, or update pipeline state."*

Everything was advisory. A skill could *say* "check the gate" but had no
enforcement mechanism. This finding became the blueprint for the cryptographic
gate system that followed: gates had to live **outside** the agent, in a plugin
the agent could not forge.

### Reproduction Guide Created

`HYBRID-PLAN.md` (1033 lines, 14 steps) documents how to rebuild the entire
system from scratch on a new laptop. Step 5 alone — the `sisyphus-gates` plugin
— spans ~487 lines and contains the full governance engine. This turned the
system from an opaque personal config into a reproducible artifact.

### HMAC-SHA256 Signing System Absorbed (Jun 24)

A 6-phase security hardening pass absorbed from a remote `opencode-config`
introduced **cryptographic verdict signing:**

- `cli.js sign-verdict` — operator-only signing CLI (runs in terminal, not OpenCode)
- `memory-key`, `gate-logger` modules added
- `state.js` pivoted to trust only **signed** verdicts
- `crypto.timingSafeEqual` verification (timing-attack resistant)
- Signing key at `~/.local/share/sisyphus-gate-key` (chmod 600), unreachable by the agent

**Hard cutover:** unsigned verdicts no longer trusted. Plugin source grew
13 → 18 modules; tests grew 180 → 322. The agent could no longer self-approve —
gate decisions required HMAC signatures from a key the agent cannot read.

---

## Era 4: Production (Jun 24 – present)

**Sources:**
- [`~/.config/opencode/COMPLETE-CODEBASE.md`](./COMPLETE-CODEBASE.md) — timeline section (Jun 24+)
- [`~/.config/opencode/plugins/sisyphus-gates/THREAT-MODEL.md`](./plugins/sisyphus-gates/THREAT-MODEL.md) — attack surface

### Provider Strategy v3

Three-tier fallback: `zhipuai-coding-plan` (primary) → `opencode-go` (fallback) →
`opencode` pre-pay (final). Jun 24 reset consolidated **16 of 17 agent primaries
onto zai**. Jun 26 model reset refined per-category: `ultrabrain` →
`zhipuai-coding-plan/glm-5.2`, `prometheus` → `zhipuai-coding-plan/glm-5.1`,
`explore` → `opencode-go/minimax-m2.7`, etc. The provider strategy is
cost-optimized, not model-maximalist — consistent with the Era 1 philosophy.

### Frontier Prompt Absorption

The **Response & Gate Discipline** section was added to `AGENTS.md` (between
Doc Drift Guard and Shell Safety). Provenance: leaked frontier prompts (Claude
Fable 5 / Opus 4.8), kept where they serve the gate-hardened posture. Three
rules: state-the-principle-not-detection-mechanics (for untrusted input),
search-before-confabulating, memory-integrity. `RAW.md` created as the research
reference. Communication quality improved measurably.

### Teach Skill Added (Jun 25)

Multi-session learning workspace under `~/Main-vault/teach/<topic>/`. Adapted
from Matt Pocock's productivity/teach skill — drops HTML/assets pipeline,
switches to Markdown lessons + reference docs + learning records. The F3
validation cycle produced **4 behavioral fix commits** (abort path, workspace
resolution, front-loaded FIRST ACTION, worked example). A Jun 26 follow-up
fixed a clarification reflex: root cause was the sisyphus intent gate firing at
system-prompt level — the fix moved the override into the skill *description*
(read during matching), not the body.

### oh-my-openagent Version Discipline

Originally pinned to `4.12.1` exactly (no caret) — the plugin is a load-bearing
dependency and caret drift is a risk. **Updated to `4.14.0` on Jun 29** after
Oracle review (ses_0eb7d514dffeZqfHPAwH09VUkc) confirmed all 8 load-bearing
surfaces COMPATIBLE: schema forward-compatible (4.14.0 adds
`restore_primary_after_cooldown`), deps unchanged, MCP scope-filter identical,
sisyphus-gates tuple form still supported. `auto_update: false` added to prevent
drift. 4.13.0 (previously deferred) shipped a large feature delta (TeamMode v2,
Ultimate Browsing, AST-grep MCP → sg resolver); 4.14.0 hardens it.

### Layer 3.7 Sandbox Allowlist SHIPPED (Jun 27)

A 7-slice feature (slices A–G) delivered via full Sisyphus ceremony. Adds
**path-scoped command relaxation for `/tmp/` directories** — the agent can run
otherwise-restricted commands when scoped to a temp directory. New module:
`src/sandbox-policy.js`. Modified: `gates.js` (Layer 3.7 insertion),
`command-policy.js` (hasShellMetachar extraction + `_internal` export),
`plugin.js` (sandbox-allow audit), `state.js` (`sandboxConfig` field),
`trust-root-paths.js` (opencode.json protect + `READ_EXCEPTION_PATTERNS`),
`metrics.js` (event_subtype override). **Tests: 328 → 431 unit (+103),
20 → 22 e2e (+2).** Config enabled in `opencode.json`.

### READ_EXCEPTION_PATTERNS Gap Fixed (Jun 28)

A known low-severity gap from the Layer 3.7 ship: read tools were not routing
through `matchTrustRootRead`. A 3-line fix in `gates.js` closed it. Acceptance
criterion AC-3.17 now passes at runtime — the trust-root read protection that
previously worked only on paper now works in the live tool path.

---

## Architecture Principles — the system's constitution

These five principles emerged from Phase 3 (the Governance Crisis) and govern
every decision since. When in doubt, return to these.

1. **Architecture IS the gate.** When governance fails, restructure the
   architecture so the failure is impossible. Do not add more text to the skill.
   *(Origin: the 964-line monolith that faked every approval.)*

2. **Skills are the product, not model selection.** The system's value is in
   its workflow structure, not which LLM runs it. A cheaper model with rigorous
   structure beats an expensive model without it.

3. **Cheap models for mechanical work, expensive models for judgment.** The
   orchestrator (cheap) delegates to a thinker (expensive) only at specific
   gates where judgment is required. This is why the system costs €0.15/project,
   not €1.75.

4. **Frozen PRDs prevent dock rot.** The destination document (PRD) is immutable
   after approval; only the execution plan updates. Scope changes go into the
   plan/issues, never back into the PRD. This makes drift detectable.

5. **TDD evidence makes quality verifiable.** Test logs (Red → Green → Refactor)
   are mandatory artifacts, making TDD claims checkable rather than asserted.

---

## Current System State *(LIVING — update at session-close)*

> Update this block at `skill:session-close`. **HARD CAP: ≤3 lines per session in the Session log below.**
> Anything longer does NOT go here — route it to `~/Main-vault/log.md` (Layer 2 of the 4-layer log architecture; see `skill:session-close`).
> If a counter changes materially, also update `COMPLETE-CODEBASE.md`.

- **Skills:** 50+ user-installed + 15 oh-my-openagent built-in + 12 shared
- **Agents:** 18 named agents, 9 task categories
- **Gate plugin:** `sisyphus-gates` v0.2.0+, **19 src modules, 431 unit + 22 e2e tests**
- **oh-my-openagent:** 4.14.0 (exact pin, no caret, auto_update: false)
- **Workflow:** 9-phase HMAC-signed state machine
- **Sandbox:** Layer 3.7 active for `/tmp/` (opt-in via `opencode.json`)
- **Signing:** HMAC-SHA256 via `cli.js sign-verdict`; key at `~/.local/share/sisyphus-gate-key`
- **Provider:** `zhipuai-coding-plan` primary (17/18 agents); `opencode-go` → `opencode` fallback
- **Last reviewed:** 2026-06-30

### Session log *(append, newest last)*

- **2026-06-28** — SYSTEM-NARRATIVE.md created (3-layer documentation bridge). READ_EXCEPTION_PATTERNS gap closed (3-line gates.js fix, AC-3.17 runtime pass).
- **2026-06-29** — Main-vault system-history timeline shipped (8 pages). 4-layer log architecture refactored. MCP filesystem scoping documented (design property). oh-my-openagent 4.12.1→4.14.0 (Oracle-reviewed). **Root cause of ALL subagent fallback: provider name mismatch `zai` vs canonical `zhipuai-coding-plan`** — delegate-task resolver does exact string match; 35 occurrences fixed; concurrency settings were also silently broken by same mismatch. 18th agent (fullstack-dev-tester) added; athena.md + explorer.md schema migrated.
- **2026-06-30** — Closed remaining agent-config gaps from `.omo/drafts/agents-gaps-followup.md`: explore/explorer tier distinction documented via YAML comment in `agents/explorer.md` only — initial JSON `_comment` attempt was schema-rejected (agent entries are `additionalProperties:false`; Oracle-confirmed ses_0e6772a69ffeaH1cWEfBkx5FWg); §Subagent Permissions rewritten with 18-agent = 8 user-defined + 10 plugin-bundled split; fullstack-dev-tester broad-edit rationale + auditor `temp: 0.0` deliberate exception documented; residual `zai` tokens cleaned from README L108 + COMPLETE-CODEBASE §Agent Routing prose L196 (Jun 29 global rename had missed these 5 spots). Operator integrity audit caught a false "session fully closed" claim from a prior instance — full 4-layer close executed here.

---

## How to Go Deeper

| You want... | Read this |
|-------------|-----------|
| Full developmental journey (Era 1, primary) | `meta/MAIN-OPT-DOCS/Archive/ARCHIVE-DEVELOPMENTAL-DOCUMENT.md` |
| Website-analyzer case studies | `meta/README.md`, `meta/CASE_STUDY_TEMPLATE.md`, `meta/REPLICATION_PROMPT_TEMPLATE.md` |
| Why HMAC gates exist (root cause) | `meta/sisyphus-pipeline-improvement.md` |
| Rebuild the whole system from scratch | `meta/HYBRID-PLAN.md` (1033 lines, 14 steps) |
| Current topology, routing, permissions | `./COMPLETE-CODEBASE.md` |
| Attack surface & threat model | `./plugins/sisyphus-gates/THREAT-MODEL.md` |
| Live timeline (newest events) | `./COMPLETE-CODEBASE.md` timeline section |
| Detailed session history (per-session) | `~/Main-vault/log.md` (entries tagged `session`) |
| Architecture/workflow/skill directory | `skill:system-reference` |
| Frontier-prompt absorption research | `./RAW.md` |

**Deep archive location:** `/home/vladi/developer/Reference/meta/`
(~170KB across 16 files). Outside the opencode sandbox by design — the archive
is reference material, not agent-editable state. Do not move it; reference it.

**Implemented 2026-06-29:** the deep archive is now linked from Main-vault via the system-history timeline layer (era-1-foundation, era-2-growth, era-3-hardening, era-4-production + event pages: governance-crisis, architecture-principles, momus-split-decision, layer-3-7-sandbox-allowlist). The archive itself stays at its path; the vault pages are the searchable entry layer.

---

*This document is the bridge between the meticulous developmental archive
(which agents cannot see) and the live system (which agents use every session).
Keep it concise enough to read in one pass. Keep the cross-references accurate.*
