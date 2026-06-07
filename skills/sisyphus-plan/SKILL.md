---
name: sisyphus-plan
description: "Execution orchestration framework for .sisyphus planning. This is the COORDINATION skill, not the EXECUTION skill. Use when: (1) user wants to start a planning workflow, (2) understanding how the 7 phase-specific skills fit together, (3) understanding the 3-artifact chain. Triggers: 'plan this', 'start initiative', 'how does planning work'. NOT for: executing phases directly (use prd-writer, issue-creator, plan-writer, wave-executor, plan-updater, plan-closer)."
compatibility: opencode
---

# Sisyphus Plan Orchestration Framework v2.1

**This skill is a COORDINATION GUIDE, not a monolithic executor.**

It describes how 7 phase-specific skills work together to produce plans and execute them. Each phase runs in its own `task()` call with natural conversation pauses between them for user approval.

## The 3-Artifact Chain

Every initiative produces exactly 3 artifacts:

1. **Planning Brief** (discovery-orchestrator output)
   - `.sisyphus/notepads/{name}/discovery-{date}.md`
   - Ephemeral alignment document

2. **Approved PRD** (prd-writer output)
   - `.sisyphus/prds/{name}-prd.md`
   - Frozen after approval. Changes go into plan/issues.

3. **Execution Plan** (plan-writer output)
   - `.sisyphus/plans/{name}.md`
   - References PRD. Updated during execution.

## Phase Sequence

```
User: "Plan this project"
    ↓
[Phase 1] brief-loader → "Brief validated"
    ↓ (pause for user)
User: "approved"
    ↓
[Phase 2] prd-writer → "PRD written"
    ↓ (mandatory gate)
[Gate 1] momus-prd-reviewer → "PRD review PASS"
    ↓ (pause for user)
User: "approved"
    ↓
[Phase 3] issue-creator → "Issues created"
    ↓ (pause for user)
User: "approved"
    ↓
[Phase 4] plan-writer → "Plan created"
    ↓ (mandatory gate)
[Gate 2] momus-plan-reviewer → "Plan review PASS"
    ↓ (pause for user)
User: "start execution"
    ↓
[Phase 5] wave-executor → "Wave 1 complete"
    ↓ (pause for user)
User: "continue"
    ↓
[Phase 5] wave-executor → "Wave 2 complete"
    ↓ (repeat until done)
    ↓
[Phase 6] plan-updater → "Final progress logged"
    ↓
[Phase 7] plan-closer → "Plan closed"
```

**Each arrow is a separate `task()` call.** The main Sisyphus agent (running in the user conversation thread) owns the flow and presents artifacts for approval between phases.

## Phase-Specific Skills

| Phase | Skill | Input | Output | Gate | Mandatory |
|-------|-------|-------|--------|------|-----------|
| 1 | `brief-loader` | discovery brief | validated brief | brief complete | ✅ |
| 2 | `prd-writer` | validated brief | PRD file | reference-check | ✅ |
| 2a | `momus-prd-reviewer` | PRD file | review report + gate decision | PASS/WARNING/FAIL | ✅ |
| 3 | `issue-creator` | approved PRD | beads issues | reference-check | ✅ |
| 4 | `plan-writer` | approved issues | execution plan | — | ✅ |
| 4a | `momus-plan-reviewer` | plan file | review report + gate decision | PASS/WARNING/FAIL | ✅ |
| 5 | `wave-executor` | approved plan + wave # | wave completion | user approval | ✅ |
| 5a | `momus-plan-reviewer` | plan + evidence | checkpoint 3 audit | PASS/WARNING/FAIL | ✅ (between waves) |
| 6 | `plan-updater` | task status + evidence | updated plan | — | — |
| 7 | `plan-closer` | completed plan | archived state | user confirmation | ✅ |

## Why This Architecture Works

**Old (v1.x):** Single 964-line skill with "HALT" text inside `task()` call → model ignores HALT, runs to completion.

**New (v2.1):** 7 focused skills, each <300 lines, each called separately → model completes ONE phase, returns control to main thread, user approves, next phase begins. Two mandatory Momus gates (PRD review + Plan review) before execution.

**The pause is natural, not forced.** No "HARD STOP" text needed. The architecture IS the gate.

## Gate Contract

- `brief-loader` → returns brief or "incomplete"
- `prd-writer` → returns PRD path or "reference-check FAIL"
- `momus-prd-reviewer` → returns PASS/WARNING/FAIL (blocks issue creation if FAIL)
- `issue-creator` → returns issue IDs or "conflicts found"
- `plan-writer` → returns plan path or "PRD missing"
- `momus-plan-reviewer` → returns PASS/WARNING/FAIL (blocks execution if FAIL)
- `wave-executor` → returns wave summary or "validation failed"
- `plan-updater` → returns updated plan
- `plan-closer` → returns closure confirmation

## When to Use This Skill vs Phase Skills

**Use THIS skill when:**
- User asks "how does planning work?"
- Understanding the overall framework
- Coordinating multiple phases

**Use phase skills DIRECTLY when:**
- User says "write PRD" → `prd-writer`
- User says "break into issues" → `issue-creator`
- User says "create plan" → `plan-writer`
- User says "start execution" → `wave-executor`
- User says "mark task done" → `plan-updater`
- User says "close plan" → `plan-closer`

## State File Contract v2.0.0

State tracks phase transitions:

```json
{
  "active_plan": ".sisyphus/plans/{slug}.md",
  "started_at": "$(date -Iseconds)",
  "plan_name": "{slug}",
  "project_root": "{resolved}",
  "state_version": "2.0.0",
  "workflow_stage": "plan_created|wave_N_completed|execution_complete",
  "pending_gate": "execution_approval|wave_N+1_approval",
  "approval_status": "waiting|approved",
  "gate_history": [...],
  "retry_counts": {},
  "current_wave": 0,
  "completed_slices": []
}
```

**v2.0.0 changes:**
- Removed "HALT instruction" reliance
- Added `phase_skills` tracking
- State now reflects actual external gates (user approvals in main thread)

## Integration with Other Skills

- `discovery-orchestrator` → produces brief → feeds `brief-loader`
- `momus-prd-reviewer` → PRD review gate (Checkpoint 1, mandatory before issues)
- `momus-plan-reviewer` → Plan review gate (before execution) + Checkpoint 3 (between waves)
- `reference-checker` → conflict verification inside `prd-writer` and `issue-creator`
- `vault-ops` → archival triggered by `plan-closer`
- `vault-lint` → validates plan structure

## Migration from v1.x

**Before:** `task(category="orchestration", load_skills=["sisyphus-plan"], prompt="Plan this")`

**After:** Sequential `task()` calls, one per phase:
```typescript
// Phase 1
await task(category="orchestration", load_skills=["brief-loader"], prompt="Validate brief: ...")
// User approves
// Phase 2
await task(category="deep", load_skills=["prd-writer"], prompt="Write PRD from brief: ...")
// Mandatory Gate 1
await task(category="deep", load_skills=["momus-prd-reviewer"], prompt="Review PRD at ...")
// User approves
// Phase 3
await task(category="orchestration", load_skills=["issue-creator"], prompt="Create issues from PRD: ...")
// User approves
// Phase 4
await task(category="orchestration", load_skills=["plan-writer"], prompt="Create plan from issues: ...")
// Mandatory Gate 2
await task(category="deep", load_skills=["momus-plan-reviewer"], prompt="Review plan at ...")
// User approves
// Phase 5
await task(category="orchestration", load_skills=["wave-executor"], prompt="Execute wave 1: ...")
// ...and so on
```

## Boundaries

- **Do NOT execute phases directly** — delegate to phase-specific skills
- **Do NOT add HALT text** — the architecture provides natural pauses
- **Do NOT monolith** — each phase is a separate skill, separate call
- **Do NOT skip user approval** — main thread presents artifacts, waits for explicit approval
