---
name: plan-writer
description: "Create structured execution plan from approved PRD and issues. Use when: (1) user says 'create plan' or 'plan this', (2) PRD and issues are approved, (3) after issue-creator presents approved issues. Triggers: 'create plan', 'plan this', 'start initiative', 'approved issues'."
compatibility: opencode
---

# Plan Writer

Creates a structured execution plan from approved PRD and validated issue breakdown. Includes mandatory integration verification task and mandatory plan review gate.

## Entry Criteria

- [ ] PRD approved and passed `momus-prd-reviewer` gate
- [ ] Issues created by `issue-creator` and approved by user
- [ ] Reference check passed at issue creation

## Produces

- Plan file at `.sisyphus/plans/{name}.md`
- Notepad directory with {decisions,problems,learnings}.md
- State file at `.sisyphus/state/{slug}.json`
- Beads tracking issue

## Next if Approved

- **Plan complete**: Delegate to `momus-plan-reviewer` for deep review (mandatory gate before execution)

## Next if Rejected

- **PRD missing**: STOP. Run `prd-writer` first
- **Issues missing**: STOP. Run `issue-creator` first
- **Plan review FAIL**: Return to plan-writer for fixes, retry review (max 3)

## Model Selection

**Category:** `unspecified-high`

Runtime model and fallbacks are resolved from `oh-my-openagent.json` by category. Do not hardcode model identifiers here — they drift on every model refresh.

**Rationale:** Plan creation is mechanical — read PRD, organize slices, structure waves. Architectural reasoning is already done.

**Model Transparency:**
When delegating to subagents, always report: `Executing with [model] via [category]` (e.g., "Executing with glm-5.2 via unspecified-high").

## Input

- Approved PRD path
- Issue IDs (from issue-creator output)
- Plan name (slug format: project-name-v2)
- Brief description

## Steps

1. **Reference check (lightweight)**
   - Confirm `.sisyphus/prds/{name}-prd.md` exists
   - Check `.sisyphus/plans/` and `.sisyphus/notepads/` for prior work
   - **Read project defaults from AGENTS.md** (Oracle finding: .sisyphus re-derived tech stack instead of inheriting)
     - If `{project_root}/AGENTS.md` exists: read Stack Rules, Team Conventions, Vault-Grounded conventions
     - If `{project_root}/.sisyphus/context/{project}-defaults.md` exists: read Stack Defaults, Scale Rules, Non-Negotiables
     - **Do NOT re-derive:** React version, Tailwind version, App Router vs Pages, TypeScript yes/no — these are pre-decided
     - **Do derive:** Project-specific unknowns not covered by defaults
   - If prior plan exists: summarize, ask user "carry over or start fresh?"

2. **Generate plan filename**
   ```bash
   PLAN_NAME="{slug}"
   PLAN_FILE=".sisyphus/plans/${PLAN_NAME}.md"
   ```

3. **Copy from template**
   ```bash
   cp {project_root}/.sisyphus/templates/plan-template.md {project_root}/$PLAN_FILE
   ```
   If template missing, create minimal structure inline.

4. **Fill in TL;DR section**
   - Replace `[Plan Name]` with actual name
   - One-sentence summary
   - 3-5 concrete deliverables
   - Effort estimate (Short/Medium/Large)

5. **Add Integration + Final Verification task (REQUIRED)**
   Add as final task, blocked by all prior tasks:
   ```markdown
   ### Integration + Final Verification (blocked by all above)
   - [ ] **Task N.1: Integration + Final Verification**
     - What: Wire up all modules, run full test suite
     - Output: All tests passing, PRD acceptance criteria checked off
     - Verify:
       - [ ] All PRD acceptance criteria met
       - [ ] Tests passing (attach logs)
       - [ ] No debug code or TODO markers left
       - [ ] Build/lint/type-check commands pass
   ```

6. **Create notepad directory** (if plan has >3 tasks or spans multiple waves)
   ```bash
   mkdir -p {project_root}/.sisyphus/notepads/${PLAN_NAME}
   touch {project_root}/.sisyphus/notepads/${PLAN_NAME}/{decisions,problems,learnings}.md
   ```

   **Decision Log Format (adopted from antigravity evidence — Oracle: more actionable than Context/Rationale/Consequences):**
   Populate `{project_root}/.sisyphus/notepads/${PLAN_NAME}/decisions.md` with template:
   ```markdown
   # Decisions Log

   ## {date}: {title}

   - **Decision:** {what was chosen}
   - **Reason:** {why this over the alternative — specific to this project's context}
   - **Alternative considered:** {what else was evaluated}
   - **Why alternative was rejected:** {specific reason}
   - **Our team should know:** {specific gotcha or nuance — what would change this decision?}
   - **Made by:** {agent / team / specific person}
   - **Date:** {YYYY-MM-DD}
   ```

   **This format replaces the old Context/Decision/Rationale/Consequences format.**
   "Alternative" captures rejected paths (critical when hitting walls). "Our team should know" is immediate and practical.

7. **Create file-based living state (STATE.md + CONTEXT.md)**
   ```bash
   mkdir -p {project_root}/.sisyphus/state

   # STATE.md — living project memory (survives sessions, human-readable)
   cat > {project_root}/STATE.md << 'EOF'
   # Project State: {PLAN_NAME}

   ## Current Position
   - **Active Plan:** .sisyphus/plans/{PLAN_NAME}.md
   - **Started:** {TIMESTAMP}
   - **Current Wave:** 0 / {total_waves}
   - **Slices Completed:** 0 / {total_slices}
   - **Last Updated:** {TIMESTAMP}

   ## Blockers
   - [ ] None yet

   ## Metrics
   - **Build Status:** Not started
   - **Test Status:** Not started
   - **Lint/Type Status:** Not started

   ## Quick Links
   - Plan: .sisyphus/plans/{PLAN_NAME}.md
   - Decisions: .sisyphus/notepads/{PLAN_NAME}/decisions.md
   - Problems: .sisyphus/notepads/{PLAN_NAME}/problems.md
   - Learnings: .sisyphus/notepads/{PLAN_NAME}/learnings.md
   EOF

   # CONTEXT.md — per-phase decisions and context (reset each phase)
   cat > {project_root}/CONTEXT.md << 'EOF'
   # Context: {PLAN_NAME}

   ## Phase: Planning
   - **Date:** {TIMESTAMP}
   - **Decisions made:** See .sisyphus/notepads/{PLAN_NAME}/decisions.md
   - **Open questions:**
     - [ ] User approval of plan
   - **Next action:** Await user "start execution"
   EOF
   ```

   **Purpose:** STATE.md and CONTEXT.md serve as human-readable, session-surviving memory.
   - **STATE.md**: Persistent project status (updated by plan-updater after each wave)
   - **CONTEXT.md**: Current phase context (updated at each phase transition)
   - These complement (not replace) the JSON state file and AGENTS.md

8. **Write per-project state file**
   ```bash
   TIMESTAMP=$(date -Iseconds)
   cat > ~/.sisyphus/state.json << EOF
   {
     "active_plan": ".sisyphus/plans/{slug}.md",
     "started_at": "${TIMESTAMP}",
     "plan_name": "{slug}",
     "project_root": "{resolved}",
     "state_version": "2.0.0",
     "workflow_stage": "plan_created",
     "pending_gate": "execution_approval",
     "approval_status": "waiting",
     "gate_history": [
       {"gate": "checkpoint_1", "status": "approved", "timestamp": "${TIMESTAMP}"},
       {"gate": "checkpoint_2", "status": "approved", "timestamp": "${TIMESTAMP}"},
       {"gate": "plan_approval", "status": "waiting", "timestamp": "${TIMESTAMP}"}
     ],
     "retry_counts": {},
     "current_wave": 0,
     "completed_slices": []
   }
   EOF
   ```
   If prior state exists, merge (preserve started_at and gate_history from original).

9. **Create tracking beads issue**
   ```bash
   bd create --title "Plan: {name}" --body "Strategic initiative tracked at .sisyphus/plans/${PLAN_NAME}.md"
   ```

10. **Present plan to user**
   Report:
   - Plan file path
   - Notepad directory created
   - Waves and slices summary
   - Beads issue ID
   - Ask: "Plan ready. Say 'start execution' to begin Wave 1."

## Output

- Plan file path
- Notepad directory path
- State file path
- Beads issue ID

## Known Pitfalls / Preflight Section (REQUIRED — Oracle finding: scattered across waves in sisy-dev)

If the plan uses Technology X, and `.sisyphus/pitfalls/{tech}.md` exists, include a consolidated preflight section at plan start:

```markdown
## Preflight: Known Pitfalls

| Technology | Pitfall | Prevention | Checked In |
|---|---|---|---|
| Next.js + Client Libs | SSR crash on `window` access | Dynamic import inside `useEffect` | Wave 5.1 (Lenis) |
| TailwindCSS v4 | Token drift (hardcoded hex) | PR review + red-flag checks | Every wave |
| MongoDB + Serverless | Connection pool exhaustion | Cache in `global.mongoose` | Milestone 1 |
| GSAP + Next.js | ScrollTrigger SSR crash | Dynamic `require()` inside `useEffect` | Wave 5.2 |

**Rule:** If a technology in this plan has a known pitfall, it MUST appear in this table with a specific prevention pattern and a specific checkpoint in the plan where it's verified.
```

**If `.sisyphus/pitfalls/` directory missing:** Create it and seed with common pitfalls from project history.

## Component Contracts (for flagged components)

If a slice involves a flagged component (motion, tokens, responsive, API boundaries, or >3 states), include a component contract in the plan:

```markdown
### Contract: <ComponentName>

**Invariants:**
- [ ] Props: list all key props with types
- [ ] No direct store coupling — receives data via props only
- [ ] Responsive: describe breakpoint behavior

**Verification:**
- [ ] Test: describe one interaction test
- [ ] Test: describe one responsive test
- [ ] Test: describe one state transition test

**Forbidden:**
- Do NOT import store directly
- Do NOT hardcode breakpoints — use designated system
- Do NOT use inline styles for colors
```

## Graph Shape (REQUIRED per slice)

Declare the delegation shape per slice (vocabulary: AGENTS.md § Graph Shapes). Every slice states one of:

- **`chain`** — serial `task()`; next node waits for prior.
- **`diamond`** — parallel fan-out, merge as results arrive.
- **`barrier`** — parallel fan-out, **merge blocked until ALL N nodes terminate** (the fan-out gate).

For `diamond`/`barrier` slices, the plan must state a **node count N** and the **fan-out receipt requirement**: one `execution-receipt` per node filed to `$HOME/.sisyphus/evidence/execution-receipts.jsonl` **before** results merge. No receipt → merge does not run.

Per-slice template entry:
```markdown
### Slice {N}: {name}
- **Graph shape:** chain | diamond | barrier
- **Nodes:** {N}              # diamond/barrier only
- **Receipts filed:** {N} × execution-receipt @ ~/.sisyphus/evidence/execution-receipts.jsonl before merge
```

## Gate to Next Phase

User explicitly approves plan ("start execution", "begin work") → hand off to `wave-executor`

## Error Handling

| Scenario | Action |
|----------|--------|
| PRD missing | STOP. "No approved PRD. Run prd-writer first." |
| Issues missing | STOP. "No issues created. Run issue-creator first." |
| Template not found | Create minimal plan inline |
| State file exists | Merge, don't overwrite |

## Integration

- **Previous**: `issue-creator` (provides approved issues)
- **Next**: `wave-executor` (after user approves plan)
- **Gates**: None (reference-checker already passed at issue creation)
