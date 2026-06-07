---
name: momus-prd-reviewer
description: "Ruthless deep review of Product Requirements Documents (PRDs). Use when: (1) PRD is complete and needs gate review before execution, (2) finding logical contradictions or scope creep in requirements, (3) validating that acceptance criteria are objectively verifiable. Triggers: review PRD, momus PRD review, audit PRD, validate requirements."
compatibility: opencode
triggers:
  - "review PRD"
  - "momus PRD review"
  - "audit PRD"
  - "validate requirements"
  - "PRD review"
mode: automatic
inputs:
  - "PRD file path (.sisyphus/prds/*.md) — required"
  - "boulder.json — optional, for project context"
outputs:
  - "PRD review report with blocker list"
  - "Gate decision: PASS / WARNING / FAIL"
produces_artifacts:
  - ".sisyphus/notepads/{plan-name}/momus-prd-review-{timestamp}.md"
requires_artifacts:
  - "PRD file (required)"
gates:
  - "Gate decision: FAIL blocks execution until fixed"
  - "Gate decision: WARNING requires acknowledgment"
  - "Gate decision: PASS allows execution to proceed"
metadata:
  version: 1.0.0
  category: review
  complexity: advanced
---

# Momus PRD Reviewer

A skill for ruthless, deep review of Product Requirements Documents. Momus finds what others miss in requirements — logical contradictions, hidden scope creep, and untestable acceptance criteria before they become expensive mistakes.

## Entry Criteria

- [ ] PRD file exists at specified path
- [ ] PRD is frozen (not actively being edited)
- [ ] Checkpoint: After prd-writer completes, before issue-creator begins

## Produces

- PRD review report at `.sisyphus/notepads/{plan-name}/momus-prd-review-{YYYY-MM-DD}.md`
- Machine-readable gate decision (JSON)

## Next if Approved

- **PASS**: Delegate to `issue-creator` to break PRD into vertical slices
- **WARNING**: Delegate to `issue-creator` with caution notes

## Next if Rejected

- **FAIL**: Return to `prd-writer` for fixes, then re-invoke `momus-prd-reviewer`

## Skill Usage

```typescript
task(
  category="deep",
  load_skills=["momus-prd-reviewer"],
  prompt="Review PRD at .sisyphus/prds/{name}-prd.md"
)
```

**For all models executing this skill:**
- Follow the **checklists** mechanically — do not skip sections
- Apply **principle-driven analysis** — find subtle conflicts, question unstated assumptions
- If you find no blockers in a category, explicitly state "No blockers found in [category]"
- Do not invent blockers where none exist — report honestly

## Core Workflow: PRD Review

**Trigger:** "review PRD", "momus PRD review", "audit PRD", "validate requirements", "PRD review"

**Input Requirements:**
- PRD file path (required) — `.sisyphus/prds/{name}-prd.md`
- boulder.json (optional) — for project context

### Step 0: Load PRD

1. Read PRD file at given path
2. Check `.sisyphus/notepads/` for prior reviews
3. If prior review exists: read it, note what was previously found and fixed

### Step 1: Analyze for Blockers

Review the PRD across these categories. For each, identify specific blockers with evidence.

#### Category A: Logical Contradictions
**Question:** Do any decisions, requirements, or constraints conflict with each other?

Check for:
- [ ] Technology choices that contradict each other
- [ ] User stories that describe mutually exclusive behaviors
- [ ] Constraints that violate stated objectives
- [ ] Out-of-scope items that are actually required for in-scope items to work
- [ ] Architecture decisions that conflict with existing system patterns

**Blocker format:**
```
A-{n}: [Severity] [Title]
- Location: [PRD section or line reference]
- Evidence: "[exact quote]"
- Conflict: [what it contradicts]
- Fix: [specific suggestion]
```

#### Category B: Scope Creep
**Question:** Are items outside the stated scope secretly required for success?

Check for:
- [ ] User stories that depend on unstated infrastructure
- [ ] "Out of Scope" items that are actually prerequisites for "In Scope" items
- [ ] Implicit assumptions about available data, APIs, or permissions
- [ ] Features mentioned in user stories but not in Solution Overview
- [ ] Integration points with systems not mentioned in dependencies

**Blocker format:**
```
B-{n}: [Severity] [Title]
- Location: [PRD section]
- Evidence: "[exact quote]"
- Hidden dependency: [what's actually needed]
- Fix: [scope adjustment or explicit addition]
```

#### Category C: Missing Verification
**Question:** Can every deliverable be objectively verified as complete?

Check for:
- [ ] User stories without acceptance criteria
- [ ] Acceptance criteria that are subjective ("should feel fast", "should look good")
- [ ] Manual QA checkpoints without specific steps or expected outcomes
- [ ] Integration tasks without specific verification commands
- [ ] "Verify" steps that cannot be executed by the auditor agent

**Blocker format:**
```
C-{n}: [Severity] [Title]
- Location: [PRD section]
- Evidence: "[exact quote]"
- Problem: [why it's not verifiable]
- Fix: [specific acceptance criteria or test command]
```

### Step 2: Synthesize Findings

1. **Count blockers by severity:**
   - CRITICAL: Will cause project failure if not fixed. Blocks execution.
   - MAJOR: Will cause significant rework or user-facing bugs. Strongly recommend fix.
   - MINOR: Polish issue, documentation gap, or non-blocking improvement.

2. **Identify top 3 risks**

3. **Estimate fix effort** — trivial (< 1h), small (1-4h), medium (half day), large (full day+)

### Step 3: Write Review Report

Create report at `.sisyphus/notepads/{plan-name}/momus-prd-review-{YYYY-MM-DD}.md`

```markdown
# Momus PRD Review: {plan-name}
**Date:** {YYYY-MM-DD}
**Artifacts reviewed:** PRD: {path}

## Summary
**Gate Decision:** {PASS / WARNING / FAIL}
**Blocker count:** {n} total ({critical} critical, {major} major, {minor} minor)

### Top 3 Risks
1. [Title] — [one-line explanation]
2. ...

## Detailed Findings
### A. Logical Contradictions
{blockers or "None found"}

### B. Scope Creep
{blockers or "None found"}

### C. Missing Verification
{blockers or "None found"}

## Fix Recommendations (Priority Order)
1. **[Severity]** [Title] — [specific fix] — Effort: [size]
```

### Step 4: Return Gate Decision

```json
{
  "decision": "PASS" | "WARNING" | "FAIL",
  "artifact_path": "{path_to_prd}",
  "summary": "{one-line summary}",
  "blockers": [
    {
      "id": "A-1",
      "severity": "CRITICAL" | "MAJOR" | "MINOR",
      "category": "Logical Contradiction" | "Scope Creep" | "Missing Verification",
      "title": "{title}",
      "fix": "{fix suggestion}"
    }
  ],
  "next_action": "proceed" | "fix_then_recheck" | "user_decision"
}
```

## Gate Behavior

| Gate Decision | Next Action |
|--------------|-------------|
| PASS | Delegate to `issue-creator` |
| WARNING | Delegate to `issue-creator` with caution notes |
| FAIL | Return to `prd-writer` for fixes |

## Tool Usage

- **Read tools**: Read PRD, boulder.json, prior reviews
- **Write tools**: Create review report
- **Task tool**: NEVER delegate — this skill IS the reviewer

## Boundaries

- **Do NOT execute code or modify implementation files** — review only
- **Do NOT create or modify PRDs** — report findings, let orchestrator fix
- **Do NOT create beads issues**
- **Do NOT conduct open-ended research**

## Integration with Other Skills

- **prd-writer**: Produces PRD that this skill reviews
- **issue-creator**: Next skill if review passes
- **momus-plan-reviewer**: Sister skill that reviews execution plans (not PRDs)
- **reference-checker**: Mechanical verification of artifacts (complements deep analysis)

## Examples

### Example: PRD Review — PASS
```
User: "Review PRD .sisyphus/prds/dark-mode-toggle-prd.md"
Agent: 1. Reads PRD
      2. Checks categories A, B, C
      3. Finds: 0 critical, 0 major, 2 minor
      4. Writes report
      5. Returns: PASS
```

### Example: PRD Review — FAIL
```
A-1: CRITICAL — "system must work offline" + "all data synced to server in real-time"
C-1: MAJOR — "App should feel fast" is subjective acceptance criteria
Returns: FAIL — "1 critical, 1 major blocker. Execution BLOCKED."
```
