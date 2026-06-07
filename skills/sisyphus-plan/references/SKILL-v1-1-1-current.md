---
name: sisyphus-plan
description: "Create and manage .sisyphus plans for strategic initiatives. Use when: (1) starting a new project, (2) planning a major feature, (3) structuring complex multi-step work, (4) stress-testing a plan before committing. Triggers: create plan, plan this, start initiative, new plan, grill me, stress-test this plan."
compatibility: opencode
triggers:
  - "planning brief"
  - "user request"
  - "approved PRD"
mode: human-in-loop
inputs:
  - "planning brief"
  - "user request"
  - "approved PRD"
outputs:
  - "PRD"
  - "beads issues"
  - "execution plan"
produces_artifacts:
  - ".sisyphus/prds/*.md"
  - ".sisyphus/plans/*.md"
requires_artifacts:
  - "planning brief (for Workflow 1b)"
gates:
  - "user approval for PRD"
  - "approved PRD for Workflow 1c"
metadata:
  version: 1.1.1
  category: planning
---

# Sisyphus Plan Management

## Overview

.You create and manage `.sisyphus` plans for strategic initiatives in Main-vault. Plans provide structure for multi-step work, track decisions and evidence, and integrate with beads for task tracking.

## Model Behavior Note

This skill is optimized for **Claude-family models** (Claude Opus, Kimi K2.5, GLM 5) which excel at mechanics-driven prompts — detailed checklists, templates, and step-by-step procedures.

**For GPT-family models** (GPT-5.4, Opus-4.6 when using GPT path):

- Follow the **principles**, not just the templates
- Key principles: (1) Small interface, large hidden implementation for each module, (2) Decision Log with rejected alternatives, (3) Validated project_root before writing boulder.json
- GPT models may skip explicit table formatting — enforce it by stating "responsibility descriptions alone do not satisfy this requirement"
- If project_root is uncertain, ask user instead of deriving from current directory

## Core Workflows

### Workflow 0: Stress-Test Before Plan Creation

**Trigger:** "grill me", "stress-test this plan", "help me think this through before planning", "I have an idea but it's fuzzy"

**When to use:**

- User explicitly asks to be grilled or stress-tested
- OR the request is too underspecified to fill the plan template directly
- Skip if the request is already concrete enough for Workflow 1

**Rules:**

1. Ask one question at a time
2. For each question, provide your recommended answer
3. If the answer can be determined from the codebase, existing plans, or notepads, inspect those first instead of asking
4. Stop once you can fill Context, Work Objectives, Verification, and the first execution wave

**Preflight Checklist (MUST complete before asking first question):**

- [ ] Check `.sisyphus/prds/` for existing PRDs related to this request
- [ ] Check `.sisyphus/plans/` for active or recent plans on this topic
- [ ] Check `.sisyphus/notepads/` for prior decisions, problems, or learnings
- [ ] Check beads issues for in-progress or related work
- [ ] If any exist: read them, summarize relevance in brief, and ask user "I found prior work on this — use it, overwrite, or branch?"
- [ ] If none exist: proceed with grill-me questions

**Output:**

- A short planning brief with:
  - Original request
  - Current state
  - Key decisions
  - Proposed deliverables
  - Verification criteria
  - Open assumptions / risks
- Then ask: "Ready for me to create the .sisyphus plan from this?"

---

### Workflow 1b: Write PRD (Product Requirements Document)

**Trigger:** "write PRD", "create destination document", "product requirements", "user stories", after Workflow 0 completes

**Gate:** Workflow 1b ONLY runs from an approved planning brief (Workflow 0 output). If no brief exists, run Workflow 0 first.

**When to use:**

- After grill-me session reaches shared understanding
- User explicitly asks for PRD
- Before breaking work into executable tasks
- Skip if the request is trivial (single file change, typo fix)

**Input:**

- Planning brief from Workflow 0 (required)
- Optional: existing PRD template preference

**Steps:** 0. **Reference check (required before drafting)**

- Check `.sisyphus/prds/`, `.sisyphus/plans/`, `.sisyphus/notepads/` for existing work on this topic
- If found: summarize relevance in PRD, ask user "reuse, overwrite, or branch?"
- If none: proceed

1. **Summarize the design concept** from the planning brief
   - Problem statement: what pain point or opportunity does this address?
   - Solution overview: what does the end state look like?
   - Out-of-scope items: definition of done requires knowing what is NOT included

2. **Draft user stories**
   - Format: "As a [role], I want [feature], so that [benefit]"
   - Or cucumber-style: "Given [context], When [action], Then [outcome]"
   - Each story must be testable (auditor can verify acceptance criteria)
   - Group stories by vertical slice, not by system layer

3. **Record implementation decisions**
   - Deep module boundaries: for each module, define small interface + large hidden implementation
   - Decision Log: for each major choice, document at least one rejected alternative and why it was rejected
   - Technology choices with rationale
   - Integration points with existing systems

4. **Record testing decisions**
   - Feedback loops: what tests, types, linting will validate this?
   - TDD approach: red → green → refactor for each module
   - Manual QA checkpoints: explicit human-in-the-loop verification steps (e.g., "User verifies dashboard renders correctly")

5. **Write PRD to `.sisyphus/prds/`**

   ```bash
   PRD_NAME="{slug}"
   PRD_FILE=".sisyphus/prds/${PRD_NAME}-prd.md"
   mkdir -p ~/Main-vault/.sisyphus/prds
   ```

   - Use PRD template from `.sisyphus/templates/prd-template.md` if exists
   - Otherwise create with required sections (see PRD Structure below)

6. **Freeze PRD after user approval**
   - PRD is FROZEN during execution — do not edit after approval
   - Changes go into plan/issues, not the PRD
   - Archive via vault-ops when work completes

**PRD Structure (Required Sections):**

- Problem Statement
- Solution Overview
- User Stories (testable, grouped by vertical slice)
- Implementation Decisions (module boundaries, deep module design)
  - Module Boundaries (REQUIRED FORMAT — responsibility descriptions alone do not satisfy this requirement):
    Use a table with columns: Module | Interface (small) | Hides (large)
    Example:
    | Module | Interface (small) | Hides (large) |
    |--------|-------------------|---------------|
    | AuthService | login(user, pw) → token, logout() | password hashing, JWT lifecycle, refresh rotation, session storage |
    Interface = public API / data contract. Hides = internal state, I/O, lifecycle, helpers.
  - Technology choices with rationale (at least 2 alternatives considered and rejected)
  - Integration points with existing systems
- Decision Log: each major choice with at least one rejected alternative and why it was rejected
- Testing Decisions (feedback loops, TDD strategy, manual QA checkpoints)
  - Feedback loops: what tests, types, linting will validate this?
  - TDD approach: red → green → refactor for each module
  - Manual QA checkpoints: human-in-the-loop verification steps
- Out of Scope (definition of done)
- Open Questions / Risks

**Output:** Report PRD file path, user story count, vertical slice count

**Gate to next workflow:** User must explicitly approve PRD with "approved", "looks good", "create issues", or similar.

---

### Workflow 1c: PRD-to-Issues (Vertical Slice Breakdown)

**Trigger:** "break into issues", "create kanban", "slice this", "vertical slices", after PRD approved

**Gate:** Workflow 1c ONLY runs from an approved PRD (Workflow 1b output). If no approved PRD exists, run Workflow 1b first.

**When to use:**

- PRD is approved and ready for execution
- Before creating execution plan
- Skip if work fits in a single TODO item

**Rules (CRITICAL):**

1. **Vertical slices only** — each issue cuts through ALL system layers (schema → API → frontend → tests)
2. **NEVER horizontal layers** — do NOT create "all schema changes", then "all API", then "all UI"
3. **Tracer bullet rule** — first slice must be end-to-end and testable
4. **Exceptions** (rare, must be documented):
   - **Enabling slices**: foundational infrastructure that unlocks other work
   - **Legacy characterization**: understanding existing system before modifying

**Steps:** 0. **Reference check (required)**

- Confirm approved PRD exists at `.sisyphus/prds/{name}-prd.md`
- Check `.sisyphus/plans/` and `.sisyphus/notepads/` for prior work on this topic
- If prior plans found: summarize what succeeded/failed, ask user "carry over or start fresh?"

1. **Read approved PRD** (frozen document)
2. **Draft vertical slices** from user stories
   - Each slice = complete feature, end-to-end
   - Each slice produces something visible/testable
   - Slice size: should fit in smart zone (avoid dumb zone)

3. **Map dependencies (blocking relationships)**
   - Enabling slices may block feature slices
   - Feature slices should be independent where possible
   - Check for dependency cycles — these are FAIL
   - Document blocker rationale in issue description

4. **Create beads issues** (one per slice)

   ```bash
   bd create --title "Slice: {brief description}" \
             --body "PRD: .sisyphus/prds/{name}-prd.md

   Acceptance Criteria:
   - [ ] {criterion 1}
   - [ ] {criterion 2}

   Blockers: {issue IDs or none}
   Type: {AFK | human-review}
   PRD Reference: .sisyphus/prds/{name}-prd.md"
   ```

5. **Mark AFK vs human-review**
   - AFK: implementation can run without human present (clear acceptance criteria, bounded scope)
   - human-review: requires human taste check, UI review, or architectural decision

6. **Verify dependency graph**
   - No cycles (auditor validates)
   - Ready queue is clear (no unclaimed blockers for first slice)

**Output:** Report issue IDs, slice count, dependency graph summary, ready queue

**Gate to next workflow:** Issues created and dependency graph validated.

---

### Workflow 1: Create Execution Plan

**Trigger:** "create plan", "plan this", "start initiative"

**Gate:** Workflow 1 requires BOTH approved PRD (Workflow 1b) AND validated issue breakdown (Workflow 1c).

- If no PRD exists: run Workflow 0 → 1b first
- If PRD exists but no issues: run Workflow 1c first

**Input Requirements:**

- Approved PRD from `.sisyphus/prds/{name}-prd.md`
- Issue IDs from Workflow 1c
- Plan name (slug format: `project-name-v2`, `auto-feed-enhancement`)
- Brief description of what the initiative does
- Optional: related beads issue ID

**Steps:** 0. **Reference check (required)**

- Confirm `.sisyphus/prds/{name}-prd.md` exists (fail if missing)
- Check `.sisyphus/plans/` and `.sisyphus/notepads/` for prior work on this topic
- If prior plan exists: summarize what succeeded/failed, ask user "carry over or start fresh?"

1. **Generate plan filename**

   ```bash
   PLAN_NAME="{slug}"
   PLAN_FILE=".sisyphus/plans/${PLAN_NAME}.md"
   ```

2. **Copy from template**

   ```bash
   cp ~/Main-vault/.sisyphus/templates/plan-template.md ~/Main-vault/$PLAN_FILE
   ```

3. **Fill in TL;DR section**
   - Replace `[Plan Name]` with actual name
   - Write one-sentence summary
   - List 3-5 concrete deliverables
   - Set effort estimate (Short/Medium/Large)

4. **Add Integration + Final Verification task (REQUIRED — every plan must have this)**
   Add a dedicated final task, separately numbered, blocked by all prior implementation tasks:

   ```
   ### Integration + Final Verification (blocked by all above)
   - [ ] **Task N.1: Integration + Final Verification**
     - What: Wire up all modules, run full test suite (unit + integration + E2E), verify PRD compliance
     - Output: All tests passing, PRD acceptance criteria checked off
     - Verify:
       - [ ] {copy each PRD acceptance criterion here as a checkbox}
       - [ ] All tests passing (attach test logs)
       - [ ] No debug code or TODO markers left
       - [ ] Build/lint/type-check commands pass
   ```

   This task is NOT optional. Responsibility descriptions alone do not satisfy this requirement.

5. **Create notepad directory** (conditional)
   - Only if plan has >3 tasks OR spans multiple waves
   - Skip for trivial plans (single file change, typo fix)

   ```bash
   mkdir -p ~/Main-vault/.sisyphus/notepads/${PLAN_NAME}
   touch ~/Main-vault/.sisyphus/notepads/${PLAN_NAME}/{decisions,problems,learnings}.md
   ```

6. **Update boulder.json**
   - Resolve `project_root` in this priority order:
     1. User-specified root (if explicitly provided in request)
     2. `~/Main-vault` (if directory exists — canonical default)
     3. Ask user: "What is the project root for this plan?"
   - NEVER derive from current directory, git repo, or plan file location
   - NEVER invent a path
   - **Consistency rule:** `project_root` MUST match where `.sisyphus/prds/`, `.sisyphus/plans/`, and `boulder.json` are written. Refuse mixed-root output (e.g., PRD in Main-vault but plan in a different directory).
   - **start-work compatibility:** If this plan will be executed via `/start-work`, boulder.json is read by the hook to resume session continuity. An incorrect `project_root` will cause `/start-work` to fail or resume the wrong plan. When uncertain, leave `project_root` unresolved and ask user rather than guessing.
   - Write:

   ```json
   {
     "active_plan": ".sisyphus/plans/{slug}.md",
     "started_at": "{ISO 8601 timestamp}",
     "plan_name": "{slug}",
     "project_root": "{resolved_root}"
   }
   ```

7. **Create tracking beads issue** (if not already exists)
   ```bash
   bd create --title "Plan: {name}" --body "Strategic initiative tracked at .sisyphus/plans/${PLAN_NAME}.md"
   ```

**Output:** Report plan file path, notepad directory created, beads issue ID

---

### Workflow 1d: Execution Lifecycle (Research → Strategy → Execution)

**Trigger:** "start execution", "implement slice", "begin work", after plan creation

**Gate:** Workflow 1d requires an active plan with approved PRD and validated issue breakdown.

**Execution Lifecycle:**

**Wave Guidance:** Plans should typically have 2-4 waves (not a hard rule). A good default is:

- Wave 1: Foundation (schema, core service, basic UI)
- Wave 2: Features (user-facing functionality, integrations)
- Wave 3: Polish (QA, edge cases, performance, documentation)
- Adjust based on complexity. Trivial plans may have 1 wave; complex plans may have more.

For each vertical slice (beads issue):

1. **Research Phase** (understand before building)
   - Read the beads issue and referenced PRD section
   - Read existing code that the slice will touch
   - Identify the minimal change needed to satisfy acceptance criteria
   - If PRD is ambiguous: use tools to disambiguate (read code, grep patterns), do NOT ask user unless tools cannot resolve

2. **Strategy Phase** (plan the implementation)
   - Identify test approach: what failing test proves the missing feature?
   - Identify deep module boundaries: what module needs changing?
   - Estimate if slice fits in smart zone (~100K tokens context budget)
   - If too large: split into smaller sub-slice, update issue

3. **Execution Phase** (Plan → Act → Validate cycle)
   - **Plan**: Write failing test (Red)
   - **Act**: Implement minimal code to pass test (Green)
   - **Validate**: Run tests, verify PRD compliance, log evidence
   - **Refactor**: Improve code with tests passing (if needed)
   - **Verify**: Mandatory verification checklist:
     1. All tests passing (attach test logs)
     2. No debug code or TODO markers left
     3. Evidence logged to `.sisyphus/evidence/<issue-id>-tdd-log.md`
     4. Build/lint/type-check commands pass
     5. PRD compliance verified (no scope creep)
   - Validation failure = slice NOT complete. Return to Plan phase.

**Context Efficiency Rules:**

- First slice establishes minimal viable context — don't over-read
- Reuse established context in subsequent slices — don't re-read files already understood
- Use `session_search` instead of re-reading files when possible
- Archive completed slice evidence to free context
- Prefer targeted reads over directory listings
- The larger context is early in the session, the more expensive each subsequent turn is

**YOLO Mode During Execution:**

- **ACT immediately** (no user question) when:
  - Scenario covered by approved PRD with clear path
  - Only one reasonable implementation exists
  - TDD safety net will catch errors
  - Can empirically reproduce failure state
- **ASK user** when:
  - PRD doesn't cover this scenario
  - Multiple valid approaches with different tradeoffs
  - Wrong decision would cause significant rework
  - User hint suggests course correction needed
- **Default bias**: ACT. Only ask when cost of being wrong exceeds cost of waiting.

**Output:** Evidence file path, test results, completion status

---

### Workflow 2: Update Active Plan Progress

**Trigger:** "update plan", "log progress", "mark task complete"

**Input Requirements:**

- Task number or description
- Status (completed / in_progress / blocked)
- Optional: evidence file path

**Steps:**

1. **Read boulder.json to find active plan**

   ```bash
   ACTIVE_PLAN=$(python3 -c "import json; print(json.load(open('~/Main-vault/.sisyphus/boulder.json'))['active_plan'])")
   ```

2. **Edit plan file**
   - Find the TODO item by number or description
   - Update checkbox: `- [ ]` → `- [x]` for completed
   - Add evidence reference if provided

3. **Log to notepad**
   If marking complete:

   ```markdown
   ## {Date} - Task {N} Complete

   - What: {task description}
   - Evidence: {file path if applicable}
   - Next: {what comes next}
   ```

4. **Update beads issue** (if linked)
   Add comment with progress update

**Output:** Report task marked complete, evidence saved, beads updated

---

### Workflow 3: Close Plan

**Trigger:** "close plan", "finish initiative", "complete plan"

**Input Requirements:**

- Confirmation all TODOs completed or explicitly deferred
- Summary of what was achieved

**Steps:**

1. **Verify all TODOs checked or explicitly marked as deferred**

   ```bash
   grep -c "^\- \[ \]" ~/Main-vault/{plan_file}
   ```

   If count > 0: Report incomplete tasks, ask for confirmation

2. **Add completion summary to plan**
   Append to end of plan file:

   ```markdown
   ---

   ## Completion Summary

   **Completed:** {date}
   **Outcome:** {what was achieved}
   **Deferred:** {any incomplete tasks and why}
   ```

3. **Archive boulder.json**

   ```bash
   mv ~/Main-vault/.sisyphus/boulder.json ~/Main-vault/.sisyphus/evidence/boulder-{plan_name}-{date}.json
   ```

4. **Close beads issue**
   ```bash
   bd close {issue_id} --resolution completed --message "Plan completed. See .sisyphus/plans/{name}.md for details."
   ```

**Output:** Report plan closed, boulder archived, beads issue closed

---

### Workflow 4: Review Plan Structure

**Trigger:** "review plan", "check plan", "validate plan structure"

**Input Requirements:**

- Plan file path

**Steps:**

1. **Check required sections present**
   - [ ] TL;DR with deliverables
   - [ ] Context section
   - [ ] Work Objectives
   - [ ] Verification section
   - [ ] Execution with waves

2. **Check TODOs have acceptance criteria**
   Each TODO should have:
   - Clear **What** (action to take)
   - Clear **Output** (artifact created)
   - Clear **Verify** (how to check success)

3. **Delegate to auditor agent**
   Use auditor agent to validate plan against template structure

**Output:** Validation report (PASS/WARNING/FAIL) with specific issues

---

## The 3-Artifact Chain

Every initiative produces exactly three artifacts in sequence:

1. **Planning Brief** (Workflow 0 output)
   - Ephemeral, conversational alignment document
   - Captures shared design concept
   - Feeds into PRD, then discarded

2. **Approved PRD** (Workflow 1b output)
   - Durable, frozen destination document
   - Lives in `.sisyphus/prds/{name}-prd.md`
   - User must approve before execution
   - Archive via vault-ops on completion

3. **Execution Plan** (Workflow 1 output)
   - Derived from PRD + issue breakdown
   - Lives in `.sisyphus/plans/{name}.md`
   - References PRD, doesn't duplicate it
   - Contains TODOs with evidence paths

**Artifact Rules:**

- Brief → PRD: brief is consumed, not retained
- PRD → Plan: PRD is referenced, not duplicated
- PRD is FROZEN after approval: changes go into plan/issues
- Only execution plan is updated during work (progress, evidence, completion)

## Integration with Other Components

### With Beads

- Each plan can link to a beads issue for operational tracking
- Beads issue comments log milestones
- Plan closure triggers beads issue closure

### With Evidence

- Save all verification artifacts to `.sisyphus/evidence/`
- Name format: `{plan-name}-task-{N}-{slug}.{ext}`
- Reference evidence paths in plan TODOs

### With Notepads

- **decisions.md**: Log key architectural choices
- **problems.md**: Document blockers and how they were resolved
- **learnings.md**: Capture what worked / didn't for future reference

## Examples

### Example 0: Stress-Test Before Planning (Grill Mode)

```
User: "I want to add a new agent for code review but I'm not sure about the scope"

Agent executes Workflow 0:
1. Ask: "What specific code review tasks should this agent handle?"
   - User: "Security vulnerability detection and style consistency"
2. Ask: "Should it read-only or also suggest fixes?"
   - User: "Read-only for now, suggest fixes later"
3. Ask: "Which repositories should it cover?"
   - User: "Just the Main-vault wiki agents"
4. Inspect existing agents: ls ~/.config/opencode/agents/
5. Brief: Original request: code review agent. Current state: 2 agents exist.
   Key decisions: read-only, security+style scope, Main-vault only.
   Deliverables: agent definition + validation checklist.
   Verification: run validate-agent.sh, test on sample file.
   Risks: overlap with auditor agent's validation role.

Agent: "Ready to create the PRD from this?"
User: "Yes"
→ Proceed to Workflow 1b
```

### Example 0b: Write PRD After Grill-Me

```
User: "Create the PRD"

Agent executes Workflow 1b (gate: brief exists from Workflow 0):
1. Read planning brief from session context
2. Draft PRD sections:
   - Problem: Students sign up for courses but drop off after a few lessons
   - Solution: Add gamification (points, streaks, levels) to course platform
   - User Stories (grouped by vertical slice):
     - Slice 1 (Schema + Service + Dashboard): As a student, I earn points for completing lessons, so I stay motivated
     - Slice 2 (Streaks + UI): As a student, I see my daily streak, so I return daily
     - Slice 3 (Retroactive backfill): As an admin, I see historical points, so analytics are accurate
   - Implementation Decisions: GamificationService as deep module; points stored in events table; small interface (awardPoints), large implementation
   - Testing Decisions: TDD for GamificationService; integration tests for lesson → points flow; manual QA for dashboard UI
   - Out of Scope: Leaderboards, badges, social features
   - Risks: Retroactive backfill may be slow on large datasets

3. Write to .sisyphus/prds/course-gamification-prd.md
4. Present to user: "PRD ready. 3 vertical slices, 8 user stories. Approve to create issues?"

User: "Approved"
→ Proceed to Workflow 1c
```

### Example 0c: PRD-to-Issues (Vertical Slices)

```
User: "Break this into issues"

Agent executes Workflow 1c (gate: PRD approved):
1. Read PRD: .sisyphus/prds/course-gamification-prd.md
2. Draft vertical slices:
   - Slice 1: Points schema + GamificationService + dashboard widget (end-to-end)
   - Slice 2: Streak tracking + UI component (end-to-end)
   - Slice 3: Retroactive backfill (enabling slice, blocks Slice 4 analytics)
   - Slice 4: Admin analytics dashboard (depends on Slice 1 + 3)
3. Check: Slice 1 is end-to-end? YES (schema → service → UI). Slice 2 is end-to-end? YES. Slice 3 is horizontal? NO — it's an enabling slice, documented exception.
4. Create beads issues:
   - brain-101: "Slice 1: Award points for lesson completion" (AFK, no blockers)
   - brain-102: "Slice 2: Streak tracking and display" (AFK, no blockers)
   - brain-103: "Slice 3: Retroactive points backfill" (AFK, blocks brain-104)
   - brain-104: "Slice 4: Admin analytics dashboard" (human-review, blocked by brain-101, brain-103)
5. Verify: No dependency cycles. Ready queue: brain-101, brain-102.

Output: 4 issues created. Ready queue: brain-101, brain-102. Blocked: brain-103 (will unblock brain-104)
→ Proceed to Workflow 1
```

### Example 1: Create New Plan

```
User: "Create a plan for auto-feed-v3 enhancement"

Agent loads sisyphus-plan skill, executes Workflow 1:
1. Generate filename: PLAN_NAME="auto-feed-v3"
2. Copy template: cp ~/Main-vault/.sisyphus/templates/plan-template.md
3. Fill TL;DR: "Enhance auto-feed with anomaly detection and multi-model validation"
4. Create notepads: mkdir -p .sisyphus/notepads/auto-feed-v3/
5. Update boulder.json with active_plan
6. Create beads issue: bd create --title "Plan: auto-feed-v3"

Output: Plan created at .sisyphus/plans/auto-feed-v3.md
```

### Example 2: Update Plan Progress

```
User: "Mark task 3 complete for auto-feed-v3, evidence at .sisyphus/evidence/auto-feed-v3-anomaly-detector.json"

Agent executes Workflow 2:
1. Read boulder.json → active_plan = .sisyphus/plans/auto-feed-v3.md
2. Edit plan: "- [ ] 3. Add anomaly detector" → "- [x] 3. Add anomaly detector"
3. Log to notepad: ## 2026-04-29 - Task 3 Complete
4. Update beads issue with progress comment

Output: Task 3 marked complete, evidence saved
```

### Example 3: Close Plan

```
User: "Close the auto-feed-v3 plan, all tasks done"

Agent executes Workflow 3:
1. Verify all TODOs checked (grep -c "^\- \[ \]")
2. Append completion summary to plan
3. Archive boulder.json to .sisyphus/evidence/boulder-auto-feed-v3-2026-04-29.json
4. Close beads issue: bd close brain-xxx --resolution completed

Output: Plan closed, boulder archived, beads issue closed
```

## Edge Cases

| Error                                          | Action                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Template not found                             | Check `.sisyphus/templates/plan-template.md` exists, create if missing |
| PRD template not found                         | Create minimal PRD with required sections inline                       |
| boulder.json invalid JSON                      | Restore from `.sisyphus/evidence/` backup                              |
| Notepad directory already exists               | Safe to ignore, or ask if user wants to overwrite                      |
| Beads command fails                            | Check `BEADS_DB` environment variable, verify `.beads/` permissions    |
| Plan file has unchecked TODOs                  | Report incomplete tasks, ask for confirmation before closing           |
| Permission denied on mkdir/cp                  | Verify agent has write access to .sisyphus/ and projects/              |
| beads issue already closed                     | Skip creation, use existing issue ID for tracking                      |
| PRD not approved but user says "create issues" | Stop: PRD must be explicitly approved before Workflow 1c               |
| No vertical slices possible                    | Exception: create enabling slice, document rationale                   |
| Dependency cycle detected                      | FAIL: report cycle, require user to break it before proceeding         |
| User wants to edit approved PRD                | Redirect: changes go into plan/issues, PRD stays frozen                |
| Brief too vague for PRD                        | Extend Workflow 0: ask more questions until concrete                   |

3. Fill TL;DR: "Enhance auto-feed with anomaly detection and multi-model validation"
4. Create notepads: mkdir -p .sisyphus/notepads/auto-feed-v3/
5. Update boulder.json with active_plan
6. Create beads issue: bd create --title "Plan: auto-feed-v3"

Output: Plan created at .sisyphus/plans/auto-feed-v3.md

```

### Example 2: Update Plan Progress

```

User: "Mark task 3 complete for auto-feed-v3, evidence at .sisyphus/evidence/auto-feed-v3-anomaly-detector.json"

Agent executes Workflow 2:

1. Read boulder.json → active_plan = .sisyphus/plans/auto-feed-v3.md
2. Edit plan: "- [ ] 3. Add anomaly detector" → "- [x] 3. Add anomaly detector"
3. Log to notepad: ## 2026-04-29 - Task 3 Complete
4. Update beads issue with progress comment

Output: Task 3 marked complete, evidence saved

```

### Example 3: Close Plan

```

User: "Close the auto-feed-v3 plan, all tasks done"

Agent executes Workflow 3:

1. Verify all TODOs checked (grep -c "^\- \[ \]")
2. Append completion summary to plan
3. Archive boulder.json to .sisyphus/evidence/boulder-auto-feed-v3-2026-04-29.json
4. Close beads issue: bd close brain-xxx --resolution completed

Output: Plan closed, boulder archived, beads issue closed

```

## Edge Cases

| Error | Action |
|-------|--------|
| Template not found | Check `.sisyphus/templates/plan-template.md` exists, create if missing |
| PRD template not found | Create minimal PRD with required sections inline |
| boulder.json invalid JSON | Restore from `.sisyphus/evidence/` backup |
| Notepad directory already exists | Safe to ignore, or ask if user wants to overwrite |
| Beads command fails | Check `BEADS_DB` environment variable, verify `.beads/` permissions |
| Plan file has unchecked TODOs | Report incomplete tasks, ask for confirmation before closing |
| Permission denied on mkdir/cp | Verify agent has write access to .sisyphus/ and projects/ |
| beads issue already closed | Skip creation, use existing issue ID for tracking |
| PRD not approved but user says "create issues" | Stop: PRD must be explicitly approved before Workflow 1c |
| No vertical slices possible | Exception: create enabling slice, document rationale |
| Dependency cycle detected | FAIL: report cycle, require user to break it before proceeding |
| User wants to edit approved PRD | Redirect: changes go into plan/issues, PRD stays frozen |
| Brief too vague for PRD | Extend Workflow 0: ask more questions until concrete |

## Tool Usage

- **Read tools**: Use to inspect existing plans, PRDs, codebase context, and notepads
- **Write tools**: Use ONLY to create `.sisyphus/plans/`, `.sisyphus/prds/`, `.sisyphus/notepads/` — never for implementation code
- **Bash tools**: Use for `mkdir`, `cp` (templates), `git status`, `grep` — NOT for running builds or tests
- **Question tool**: REQUIRED when request is ambiguous or lacks approved PRD
- **Task tool**: NEVER delegate to other agents — this skill IS the planning orchestrator; use `task` only to invoke `archivist` or `auditor` for execution/validation

## Boundaries

- **Do NOT execute code or modify implementation files** — delegate execution to `archivist` agent
- **Do NOT handle git operations** — use `git-commit-message` skill for commits, archivist for pushes
- **Do NOT validate vault structure** — use `vault-lint` skill or `auditor` agent for validation
- **Do NOT conduct open-ended research** — use `athena-research` skill for codebase exploration
- **Do NOT write long-form prose content** — use `vault-ops` skill for wiki publishing
- **Do NOT create beads issues directly from user requests** — only create issues as part of Workflow 1c (PRD-to-Issues) from an approved PRD

## Related Skills

- **vault-ops**: Execute workflows defined in plans
- **vault-lint**: Validate plan structure
- **athena-research**: Research patterns for planning complex initiatives
```
