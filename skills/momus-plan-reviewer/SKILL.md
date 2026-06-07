---
name: momus-plan-reviewer
description: "Ruthless deep review of execution plans. Use when: (1) plan is complete and needs gate review before execution begins, (2) finding dependency gaps or integration risks in slices, (3) pre-slice architecture audit. Triggers: review plan, momus plan review, audit plan, validate plan structure, check slices."
compatibility: opencode
triggers:
  - "review plan"
  - "momus plan review"
  - "audit plan"
  - "validate plan structure"
  - "check slices"
  - "plan review"
mode: automatic
inputs:
  - "Plan file path (.sisyphus/plans/*.md) — required"
  - "PRD file path (.sisyphus/prds/*.md) — optional, for requirements context"
  - "Evidence file path (.sisyphus/evidence/*.md) — optional, for foundation audit"
  - "boulder.json — optional"
outputs:
  - "Plan review report with blocker list"
  - "Gate decision: PASS / WARNING / FAIL"
produces_artifacts:
  - ".sisyphus/notepads/{plan-name}/momus-plan-review-{timestamp}.md"
requires_artifacts:
  - "Plan file (required)"
  - "PRD file (recommended for context)"
gates:
  - "Gate decision: FAIL blocks execution until fixed"
  - "Gate decision: WARNING requires acknowledgment"
  - "Gate decision: PASS allows execution to proceed"
metadata:
  version: 1.0.0
  category: review
  complexity: advanced
---

# Momus Plan Reviewer

A skill for ruthless, deep review of execution plans. Momus finds what others miss in plans — dependency gaps, integration risks, and resource assumptions before they become expensive mistakes during execution.

## Entry Criteria

- [ ] Plan file exists at specified path
- [ ] PRD has passed `momus-prd-reviewer` gate (recommended)
- [ ] Checkpoint: After plan-writer completes, before wave-executor begins

## Produces

- Plan review report at `.sisyphus/notepads/{plan-name}/momus-plan-review-{YYYY-MM-DD}.md`
- Machine-readable gate decision (JSON)

## Next if Approved

- **PASS**: Delegate to `wave-executor` to begin execution
- **WARNING**: Delegate to `wave-executor` with caution notes

## Next if Rejected

- **FAIL**: Return to `plan-writer` for fixes, then re-invoke `momus-plan-reviewer`

## Skill Usage

```typescript
task(
  category="deep",
  load_skills=["momus-plan-reviewer"],
  prompt="Review plan at .sisyphus/plans/{name}.md"
)
```

**For all models executing this skill:**
- Follow the **checklists** mechanically — do not skip sections
- Apply **principle-driven analysis** — find hidden dependencies, question assumptions
- If you find no blockers in a category, explicitly state "No blockers found in [category]"
- Do not invent blockers where none exist — report honestly

## Core Workflow: Plan Review

**Trigger:** "review plan", "momus plan review", "audit plan", "validate plan structure", "check slices", "plan review"

**Input Requirements:**
- Plan file path (required) — `.sisyphus/plans/{name}.md`
- PRD file path (optional) — for requirements context
- boulder.json (optional) — for project context

### Step 0: Load Artifacts

1. Read plan file at given path
2. Read PRD if provided (for requirements context)
3. Check `.sisyphus/notepads/` for prior reviews
4. If prior review exists: read it, note what was previously found and fixed

### Step 1: Analyze for Blockers

Review the plan across these categories. For each, identify specific blockers with evidence.

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
- Location: [PRD or plan section]
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
- Location: [PRD or plan section]
- Evidence: "[exact quote]"
- Assumption: [what's unstated]
- Fix: [explicit configuration or fallback]
```

### Step 2: Synthesize Findings

1. **Count blockers by severity:**
   - CRITICAL: Will cause project failure if not fixed. Blocks execution.
   - MAJOR: Will cause significant rework or user-facing bugs. Strongly recommend fix.
   - MINOR: Polish issue, documentation gap, or non-blocking improvement.

2. **Apply Risk Tiers to flagged components:**
   | Tier | Drift Likelihood | What to Check |
   |------|-----------------|---------------|
   | **High** | Very likely | Full component contract exists. Stop-and-verify planned after implementation. |
   | **Medium (flagged)** | Likely | Contract exists. Preflight check before starting. |
   | **Low / unflagged Medium** | Unlikely | No contract needed. Build from plan description directly. |
   
   **Flag criteria for Medium components:**
   - Touches motion (animations, transitions, scroll behavior)
   - Touches tokens (colors, gradients, shadows, theming)
   - Touches responsive (breakpoint-dependent layout, mobile-specific behavior)
   - Touches API boundaries (data fetching, store coupling, prop drilling risk)
   - Has >3 distinct states (not counting simple boolean toggles)
   
   If a slice contains a flagged component without a contract → **MAJOR blocker**.

3. **Check for known agent reliability patterns:**
   - "Files exist" ≠ "Feature works" — does verification require manual testing, not just file presence?
   - Security gaps: Are auth checks, route protection, and data ownership explicitly in the plan?
   - Are shared packages/types created in early milestones (not deferred)?
   - Is there a mid-build architecture checkpoint after ~30% of milestones?

4. **Identify top 3 risks**

5. **Estimate fix effort** — trivial (< 1h), small (1-4h), medium (half day), large (full day+)

### Step 3: Write Review Report

Create report at `.sisyphus/notepads/{plan-name}/momus-plan-review-{YYYY-MM-DD}.md`

```markdown
# Momus Plan Review: {plan-name}
**Date:** {YYYY-MM-DD}
**Artifacts reviewed:**
- Plan: {path}
- PRD: {path or "not reviewed"}

## Summary
**Gate Decision:** {PASS / WARNING / FAIL}
**Blocker count:** {n} total ({critical} critical, {major} major, {minor} minor)

### Top 3 Risks
1. [Title] — [one-line explanation]
2. ...

## Detailed Findings
### D. Dependency Gaps
{blockers or "None found"}

### E. Integration Risks
{blockers or "None found"}

### F. Resource & Assumption Risks
{blockers or "None found"}

## Fix Recommendations (Priority Order)
1. **[Severity]** [Title] — [specific fix] — Effort: [size]
```

### Step 4: Return Gate Decision

```json
{
  "decision": "PASS" | "WARNING" | "FAIL",
  "artifact_path": "{path_to_plan}",
  "summary": "{one-line summary}",
  "blockers": [
    {
      "id": "D-1",
      "severity": "CRITICAL" | "MAJOR" | "MINOR",
      "category": "Dependency Gap" | "Integration Risk" | "Resource Risk",
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
| PASS | Delegate to `wave-executor` |
| WARNING | Delegate to `wave-executor` with caution notes |
| FAIL | Return to `plan-writer` for fixes |

## Tool Usage

- **Read tools**: Read plan, PRD, boulder.json, prior reviews
- **Write tools**: Create review report
- **Task tool**: NEVER delegate — this skill IS the reviewer

## Boundaries

- **Do NOT execute code or modify implementation files** — review only
- **Do NOT create or modify plans** — report findings, let orchestrator fix
- **Do NOT create beads issues**
- **Do NOT conduct open-ended research**

## Integration with Other Skills

- **plan-writer**: Produces execution plan that this skill reviews
- **wave-executor**: Next skill if review passes
- **momus-prd-reviewer**: Sister skill that reviews PRDs (not plans)
- **reference-checker**: Mechanical verification of artifacts

## Examples

### Example: Plan Review — PASS
```
User: "Review plan .sisyphus/plans/dashboard-enhancement.md"
Agent: 1. Reads plan
      2. Checks categories D, E, F
      3. Finds: 0 critical, 0 major, 1 minor
      4. Writes report
      5. Returns: PASS
```

### Example: Plan Review — FAIL
```
D-1: CRITICAL — Slice 3 depends on Slice 1's API, but Slice 1 doesn't expose that endpoint
E-1: MAJOR — New auth module uses JWT but existing system uses session cookies
Returns: FAIL — "1 critical, 1 major blocker. Execution BLOCKED."
```
