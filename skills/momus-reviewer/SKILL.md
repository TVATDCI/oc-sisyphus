---
name: momus-reviewer
description: "Ruthless deep review of PRDs and execution plans to find blockers before they become expensive mistakes. (1) Use at Checkpoint 1 (PRD complete) before execution starts. (2) Use at Checkpoint 3 (pre-Slice-2) to audit foundation before building on it. (3) Use when user asks for deep review or 'find blockers' on a plan. Triggers: 'momus review', 'deep review', 'find blockers', 'ruthless review', 'momus check', 'review the PRD', 'audit the plan', 'check for contradictions', 'gate review', 'pre-slice audit'. Checks 6 categories: logical contradictions, scope creep, missing verification, dependency gaps, integration risks, resource risks. Not for: mechanical format checks (use vault-lint or auditor), plan structure validation (use reference-checker), or security/code review (use security-auditor)."
compatibility: opencode
triggers:
  - "momus review"
  - "deep review"
  - "find blockers"
  - "ruthless review"
  - "momus check"
mode: automatic
inputs:
  - "PRD file path (.sisyphus/prds/*.md) — required for Checkpoint 1"
  - "Plan file path (.sisyphus/plans/*.md) — optional"
  - "Evidence file path (.sisyphus/evidence/*.md) — optional, for Checkpoint 3 foundation audit"
  - "boulder.json — optional, for project context"
outputs:
  - "Review report with blocker list and fix suggestions"
  - "Gate decision: PASS / WARNING / FAIL"
produces_artifacts:
  - ".sisyphus/notepads/{plan-name}/momus-review-{timestamp}.md"
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

# Momus Reviewer

A skill for ruthless, deep review of planning artifacts. Momus finds what others miss — logical contradictions, hidden scope creep, untestable acceptance criteria, and architectural blockers before they become expensive mistakes.

## Identity & Scope

**Purpose:** Ruthless deep review of PRDs and execution plans to find blockers before execution.
**Triggers:** "momus review", "deep review", "find blockers", "ruthless review", "momus check"
**Not For:**
- Mechanical structural checks (use vault-lint or auditor — they do template validation)
- Plan format validation (use reference-checker)
- Pre-implementation work (this is a review skill, not a planning skill)

**Entry Criteria:**
- [ ] PRD file exists at given path (required)
- [ ] PRD is frozen (user has stopped editing)
- [ ] No prior review with same findings exists in `.sisyphus/notepads/`

**Produces:**
- Review report at `.sisyphus/notepads/{plan-name}/momus-review-{timestamp}.md`
- Structured gate decision (PASS / WARNING / FAIL) with blockers array
- Top 3 risks + fix recommendations

**Next if Approved:**
- PASS → orchestrator proceeds to execution
- WARNING → orchestrator proceeds with caution, fix before Slice 2
- FAIL → STOP, fix blockers, re-invoke review

**Gate Contract:**
- FAIL decision blocks execution until fixed
- WARNING decision requires acknowledgment
- PASS decision allows execution to proceed

**Skill Usage:**
This skill is loaded via `load_skills` into category-routed tasks:
```typescript
task(
  category="deep",            // or "ultrabrain" for maximum reasoning
  load_skills=["momus-reviewer"],
  prompt="Review PRD at .sisyphus/prds/{name}-prd.md. Find blockers."
)
```

**Category routing:** The framework automatically selects an appropriate reasoning model. Do not micromanage subagent model selection.

## Hard Constraints (NEVER/MUST)

- **No invented blockers** — if no blockers in a category, explicitly state "None found in [category]". Do not invent blockers to seem thorough.
- **Blocker format mandatory** — every blocker MUST cite exact quote and location, not vague claims
- **Honesty over completeness** — if uncertain, mark severity lower or note "Limited depth review — may have missed subtle blockers"
- **All 6 categories must be checked** — do not skip categories even if no obvious blockers
- **Boundary: review only** — do NOT execute code, modify implementation files, create PRDs, create beads issues, conduct open-ended research
- **Boundary: no self-approval** — gate decision is OUTPUT, not self-executing
- **Follow checklists mechanically** — do not skip sections of the review categories
- **Apply principle-driven analysis** — find subtle conflicts, question unstated assumptions, reason through edge cases

## Core Workflow (Summary)

The 5-step deep review pipeline — see `## Detailed Steps` below for per-step procedures.
1. **Step 0: Load Artifacts** — Read PRD, plan (optional), boulder.json (optional), check for prior reviews
2. **Step 1: Analyze for Blockers** — Review 6 categories (A: Logical Contradictions, B: Scope Creep, C: Missing Verification, D: Dependency Gaps, E: Integration Risks, F: Resource & Assumption Risks)
3. **Step 2: Synthesize Findings** — Count blockers by severity (CRITICAL/MAJOR/MINOR), identify top 3 risks, estimate fix effort
4. **Step 3: Write Review Report** — Create `.sisyphus/notepads/{plan-name}/momus-review-{YYYY-MM-DD}.md` with the full schema
5. **Step 4: Return Gate Decision** — Machine-readable JSON with decision + blockers + next_action

**When to use:** Checkpoint 1 (PRD complete), Checkpoint 3 (Pre-Slice-2), user asks for deep review, orchestrator auto-invokes at gates.
**When to skip:** Mechanical checks (use vault-lint/auditor), plan format validation (use reference-checker).

## Tool Usage

- **Read tools**: Read PRD, plan, boulder.json, prior reviews
- **Write tools**: Create review report in notepads directory
- **Bash tools**: Use `grep`, `wc`, `ls` for quick checks on referenced files
- **Task tool**: NEVER delegate — this skill IS the reviewer; deep analysis happens in this context

## Boundaries

- **Do NOT execute code or modify implementation files** — this is review only
- **Do NOT create or modify PRDs** — report findings, let orchestrator fix
- **Do NOT create beads issues** — blockers stay in review report unless orchestrator decides to create issues
- **Do NOT conduct open-ended research** — review only the provided artifacts
- **Do NOT approve your own review** — gate decision is output, not self-executing

## Related Skills

- **sisyphus-plan**: Creates PRDs and plans that this skill reviews
- **vault-lint**: Validates plan structure (mechanical check)
- **auditor**: Validates plan against template (structural check)
- **reference-checker**: Mechanical verification of `.sisyphus/` artifacts (complements Momus's deep analysis)

## Integration with sisyphus-plan

This skill is designed to be **auto-invoked by sisyphus-plan at checkpoints**:

**Checkpoint 1 (PRD Complete):**
```
sisyphus-plan Workflow 1b completes PRD
  → Gate: [[DELEGATE: momus-reviewer]]
  → Input: PRD path
  → Output: Gate decision
  → If FAIL: return to Workflow 1b for fixes
  → If PASS/WARNING: proceed to Workflow 1c
```

**Checkpoint 3 (Pre-Slice-2):**
```
sisyphus-plan Workflow 1d completes Slice 1
  → Gate: [[DELEGATE: momus-reviewer]]
  → Input: PRD + updated plan + evidence
  → Output: Architecture audit report
  → If FAIL: fix foundation before building Slice 2
  → If PASS: proceed to Slice 2
```

## Edge Cases

| Error | Action |
|-------|--------|
| PRD file not found | FAIL — report missing artifact, cannot review |
| PRD file exists but empty | FAIL — report empty artifact, cannot review |
| Plan file referenced but not found | Review PRD only, note in report |
| All categories find no blockers | Report PASS with explicit "None found" in each category |
| Prior review exists | Read it, compare findings, note regressions or fixes |
| PRD is not frozen (user still editing) | Warn: "PRD should be frozen before review. Blockers may change." |
| boulder.json missing | Review without project context, note limitation |

## Scoring Reference

For skill validation, a good Momus review scores high on:
- **Coverage**: All 6 categories checked (not skipped)
- **Specificity**: Blockers cite exact quotes and locations
- **Actionability**: Every blocker has a specific fix suggestion
- **Honesty**: Reports "None found" when appropriate (no invented blockers)
- **Severity accuracy**: Critical blockers actually would cause failure

---

## Detailed Steps

### Step 0: Load Artifacts

1. Read PRD file at given path
2. If plan path provided, read plan file
3. If boulder.json provided, read for project context
4. Check `.sisyphus/notepads/` for prior reviews on this initiative
   - If prior review exists: read it, note what was previously found and fixed

### Step 1: Analyze for Blockers

Review the PRD (and plan if available) across these categories. For each category, identify specific blockers with evidence (quote from PRD/plan) and severity.

#### Category A: Logical Contradictions
**Question:** Do any decisions, requirements, or constraints conflict with each other?

Check for:
- [ ] Technology choices that contradict each other (e.g., "use SQLite" + "needs high concurrency")
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

#### Category D: Dependency Gaps
**Question:** Are all blocking relationships identified and resolvable?

Check for:
- [ ] Slices that claim to be independent but share state/files
- [ ] Enabling slices that don't actually unblock their dependents
- [ ] Circular dependencies (Slice A blocks B, B blocks C, C blocks A)
- [ ] Missing blockers for human-review items (UI, taste, architecture)
- [ ] External dependencies (APIs, services, packages) not listed

**Blocker format:**
```
D-{n}: [Severity] [Title]
- Location: [plan section]
- Evidence: "[exact quote]"
- Gap: [what's missing]
- Fix: [specific dependency to add or restructure]
```

#### Category E: Integration Risks
**Question:** Will the new modules actually integrate with existing systems?

Check for:
- [ ] Module interfaces that don't match existing API patterns
- [ ] Data formats that differ from current conventions
- [ ] Authentication/authorization gaps
- [ ] State management conflicts (global vs local, sync vs async)
- [ ] Performance assumptions that violate current baselines

**Blocker format:**
```
E-{n}: [Severity] [Title]
- Location: [PRD section]
- Evidence: "[exact quote]"
- Risk: [what will break on integration]
- Fix: [specific interface adjustment or compatibility layer]
```

#### Category F: Resource & Assumption Risks
**Question:** What unstated assumptions could cause failure?

Check for:
- [ ] Assumptions about file system paths, environment variables, or configs
- [ ] Assumptions about user behavior ("users will always...")
- [ ] Assumptions about data volume or performance
- [ ] Missing error handling for edge cases
- [ ] Hard-coded values that should be configurable

**Blocker format:**
```
F-{n}: [Severity] [Title]
- Location: [PRD section]
- Evidence: "[exact quote]"
- Assumption: [what's unstated]
- Fix: [explicit configuration or fallback]
```

### Step 2: Synthesize Findings

1. **Count blockers by severity:**
   - CRITICAL: Will cause project failure if not fixed. Blocks execution.
   - MAJOR: Will cause significant rework or user-facing bugs. Strongly recommend fix.
   - MINOR: Polish issue, documentation gap, or non-blocking improvement.

2. **Identify top 3 risks** — the blockers most likely to cause problems if ignored

3. **Estimate fix effort** — rough classification: trivial (< 1h), small (1-4h), medium (half day), large (full day+)

### Step 3: Write Review Report

Create review report at `.sisyphus/notepads/{plan-name}/momus-review-{YYYY-MM-DD}.md`

**Report structure:**
```markdown
# Momus Review: {plan-name}
**Date:** {YYYY-MM-DD}
**Reviewer:** Momus (deep analysis)
**Artifacts reviewed:**
- PRD: {path}
- Plan: {path or "not reviewed"}

## Summary

**Gate Decision:** {PASS / WARNING / FAIL}
**Blocker count:** {n} total ({critical} critical, {major} major, {minor} minor)

### Top 3 Risks
1. [Title] — [one-line explanation]
2. [Title] — [one-line explanation]
3. [Title] — [one-line explanation]

## Detailed Findings

### A. Logical Contradictions
{blockers or "None found"}

### B. Scope Creep
{blockers or "None found"}

### C. Missing Verification
{blockers or "None found"}

### D. Dependency Gaps
{blockers or "None found"}

### E. Integration Risks
{blockers or "None found"}

### F. Resource & Assumption Risks
{blockers or "None found"}

## Fix Recommendations (Priority Order)

1. **[Severity]** [Title] — [specific fix] — Effort: [size]
2. ...

## Questions for User

{If any blockers require user decision, list as questions}
```

### Step 4: Return Gate Decision

Return a **machine-readable gate decision** that the orchestrator can consume automatically.

**Required output format (strict):**
```json
{
  "decision": "PASS" | "WARNING" | "FAIL",
  "artifact_path": "{path_to_reviewed_artifact}",
  "summary": "{one-line human-readable summary}",
  "blockers": [
    {
      "id": "A-1",
      "severity": "CRITICAL" | "MAJOR" | "MINOR",
      "category": "Logical Contradiction" | "Scope Creep" | "Missing Verification" | "Dependency Gap" | "Integration Risk" | "Resource Risk",
      "title": "{blocker title}",
      "fix": "{specific fix suggestion}"
    }
  ],
  "next_action": "proceed" | "fix_then_recheck" | "user_decision"
}
```

**Blockers array rules:**
- PASS: empty array `[]`
- WARNING: may include major/minor blockers with caution notes
- FAIL: must include all critical + major blockers preventing proceed

**If FAIL:**
- Do NOT proceed to execution
- Return the structured decision above
- Wait for orchestrator to fix and re-invoke review

## Examples

### Example 1: PRD Review — PASS
```
User: "Momus review .sisyphus/prds/dark-mode-toggle-prd.md"

Agent loads momus-reviewer skill:
1. Reads PRD
2. Checks all 6 categories
3. Finds: 0 critical, 0 major, 2 minor (missing specific hex values for dark theme, test command for API endpoint not provided)
4. Writes review report to .sisyphus/notepads/dark-mode-toggle/momus-review-2026-05-03.md
5. Returns: PASS — "2 minor polish items. Execution may proceed."
```

### Example 2: PRD Review — FAIL
```
User: "Momus review .sisyphus/prds/auto-feed-v3-prd.md"

Agent loads momus-reviewer skill:
1. Reads PRD
2. Category A (Logical Contradictions):
   A-1: CRITICAL — PRD states "system must work offline" and "all data synced to server in real-time"
   - Evidence: "Users can use the app without internet connection" + "All changes are immediately synced to the server"
   - Conflict: Real-time sync requires internet. Offline mode + real-time sync are mutually exclusive without queuing logic (not mentioned).
   - Fix: Define sync strategy: queue changes locally, sync on reconnect. Add offline queue module.
3. Category C (Missing Verification):
   C-1: MAJOR — "App should feel fast" is acceptance criteria
   - Problem: Subjective, not verifiable
   - Fix: Specify metric: "Page load < 200ms, API response < 100ms"
4. Returns: FAIL — "1 critical, 1 major blocker. Execution BLOCKED. See notepad for fix suggestions."
```

### Example 3: Checkpoint Gate — Auto-invoked
```
Orchestrator completes PRD, reaches Checkpoint 1:
- Delegates to momus-reviewer (category="deep"): "Review .sisyphus/prds/dashboard-enhancement-prd.md"
- Framework routes to reasoning model, loads skill, performs deep review
- Returns: WARNING — "1 major: Settings API assumes atomic writes but PRD doesn't specify temp-file pattern. Recommend adding."
- Orchestrator adds temp-file pattern to PRD, re-invokes review
- Returns: PASS
- Orchestrator proceeds to execution
```