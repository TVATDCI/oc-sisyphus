---
name: wave-executor
description: "Executes one wave of an approved Sisyphus plan: research, strategy, implementation, and validation for each slice. (1) Use after plan-writer presents an approved plan and momus-plan-reviewer gate passes. (2) Use when user says 'start execution' or asks for the next wave. (3) Use to continue an in-progress plan with slices waiting. Triggers: 'start execution', 'implement slice', 'begin work', 'next wave', 'continue execution', 'run wave 2', 'execute the plan', 'pick up where we left off', 'approved plan ready'. Not for: creating plans (use plan-writer), reviewing plans (use momus-plan-reviewer), updating progress (use plan-updater), closing plans (use plan-closer)."
compatibility: opencode
---

# Wave Executor

Executes one wave of an approved plan. Performs research, strategy, execution, and validation for each slice in the wave. Halts after wave completion for user approval before next wave.

## Identity & Scope

**Purpose:** Execute one wave of an approved Sisyphus plan — research, strategy, execution, and validation for each slice.

**Triggers:**
- User says "start execution" or "implement slice"
- Plan is approved and needs execution
- After plan-writer presents approved plan
- "begin work", "next wave", "continue"

**Not For:**
- Creating plans (use plan-writer)
- Reviewing plans (use momus-plan-reviewer)
- Updating progress (use plan-updater)
- Closing plans (use plan-closer)

**Entry Criteria:**
- [ ] Plan approved by user and passed `momus-plan-reviewer` gate
- [ ] State file exists with `approval_status: "approved"`
- [ ] Current wave number identified (default: 1)

**Produces:**
- Wave completion summary
- Evidence file paths (TDD logs)
- Updated state file
- Next wave preview

**Input:**
- Active plan path (from plan-writer output or state file)
- Current wave number (default: 1 for first call)
- State file path

**Next if Approved:**
- **Wave complete, more waves**: Delegate to `wave-executor` for next wave
- **Wave complete, final wave**: Delegate to `plan-updater` for final progress tracking

**Next if Rejected:**
- **Plan not approved**: STOP. Run `plan-writer` and `momus-plan-reviewer` first
- **State shows "waiting"**: STOP. Awaiting user approval
- **Slice validation fails**: Return to Plan phase. Do not mark complete
- **Checkpoint 3 FAIL (3x)**: Escalate to user for manual review

## Hard Constraints (NEVER/MUST)

> These rules are invariant across all invocations. They are extracted from the full skill content and placed here for KV-cache stability. See the volatile tail for the full procedural context behind each rule.

1. **Evidence is a blocking requirement.** If you cannot produce evidence for a verification item, the slice is incomplete. Do not mark complete and do not commit. [See Step 3c verification checklist]

2. **Atomic commits are mandatory.** A slice is NOT complete until committed. Git history is the universal record — it outlives `.sisyphus/` and is readable by all developers and agents. [See Step 3f]

3. **Validation failure = slice NOT complete.** Return to Plan phase. Do not mark complete. [See Step 3c]

4. **Do NOT skip wave completion validation (Step 7).** Do NOT present a summary for a wave that hasn't passed validation. This is a hard gate. [See Step 7]

5. **No user permission needed for Rules 1-3** (auto-fix bugs, auto-add missing critical functionality, auto-fix blocking issues). Rule 4 (architectural changes) requires user decision. [See Deviation Rules]

6. **Fix attempt limit: After 3 auto-fix attempts on a single task**, STOP fixing — document remaining issues in wave summary under "Deferred Issues". Do NOT restart builds hoping issues resolve themselves. [See Deviation Rules]

7. **Model Transparency (MANDATORY):** When delegating to subagents, you MUST report: `Executing with [model] via [category]` (e.g., "Executing with glm-5.2 via unspecified-high"). [See Model Selection]

8. **Without an eval, you are just changing words in a paragraph and hoping that it sticks.** Eval-first discipline (§6 of AGENTS.md) applies to all skill creation and modification. [Cross-skill constraint from [[9-step-harness]]]

9. **Analysis Paralysis Guard:** If you make 5+ consecutive Read/Grep/Glob calls without any Edit/Write/Bash action, STOP. State in one sentence why you haven't written anything yet. Then either write code or report "blocked". [See Analysis Paralysis Guard section]

10. **Auto-Mode Behavior:** When user invokes with `--auto` or `workflow.auto_advance` is true: `human-verify` checkpoints → auto-approve with log; `decision` checkpoints → auto-select first option; `human-action` checkpoints → always STOP (auth gates cannot be automated). [See Checkpoint Protocol]

11. **"Files exist" ≠ "Feature works" ≠ "Security implemented".** Always verify manually. [See Step 3c security verification]

12. **Do NOT retry the same command hoping it works.** Use build-resolver to identify root cause first. [See Step 3c]

13. **If commit fails (merge conflict, hook rejection, etc.):** STOP. Do not mark slice complete. Fix the blocker, retry commit. Do NOT skip. [See Step 3f]

## Core Workflow

High-level flow (stable across all invocations):

1. **Read state file** — Verify approval status and current wave
2. **Read plan and current wave's slices** — Identify slices and check blockers
3. **For each slice in wave:**
   - a. **Research Phase** — Read PRD, existing code, identify minimal change
   - b. **Strategy Phase** — Identify test approach, module boundaries, estimate scope
   - c. **Execution Phase** — Plan → Act → Validate (TDD cycle)
   - d. **Goal-Backward Verification** — Verify outcomes, not just tasks
   - e. **Post-Change Review** — Invoke post-reviewer for safety net
   - f. **Atomic Commit** — Hard gate: slice not complete until committed
4. **Checkpoint 3: Pre-Slice Architecture Audit** — Before Slice 2+, verify foundation
5. **Regression Gate** — Before marking wave complete, run prior wave tests
6. **Write QA Handoff Artifact** — Mandatory scope artifact for downstream skills
7. **Update state file** — Record wave completion
8. **Wave Completion Validation** — Hard gate: run mechanical validator
9. **Present wave summary to user** — With model transparency line

## Domain Knowledge

### Model Selection

**Category:** `unspecified-high`

Runtime model and fallbacks are resolved from `~/.omo/omo.jsonc` (`[opencode]` section) by category. Do not hardcode model identifiers here — they drift on every model refresh.

**Rationale:** Wave execution is mechanical work — read PRD, follow specs, implement, test. The hard architectural reasoning is already done (in PRD approved by Momus). Using cheaper model reduces cost per wave by ~10x.

**Escalation rule:** If tests fail after 2 attempts, retry with `category="deep"` for complex debugging.

**Model Transparency (MANDATORY):**
When delegating to subagents, you MUST report: `Executing with [model] via [category]` (e.g., "Executing with glm-5.2 via unspecified-high").

**Also record execution metadata:**
```bash
bash ~/.config/opencode/scripts/track-execution.sh {plan_name} {wave_number} {slice_name} {model} {category}
```

This creates a machine-readable log at `~/.sisyphus/metadata/{plan}-execution.log` that the validator can check.

Why: Enables cost verification, model debugging, confirms cheap models are used for mechanical work, and provides mechanical evidence for the validator.

### Wave Guidance

Typical wave structure:
- Wave 1: Foundation (schema, core service, basic UI)
- Wave 2: Features (user-facing functionality, integrations)
- Wave 3: Polish (QA, edge cases, performance, docs)

### Context Efficiency Rules

- First slice establishes minimal viable context — don't over-read
- Reuse established context in subsequent slices
- Use `session_search` instead of re-reading files
- Archive completed slice evidence to free context
- Prefer targeted reads over directory listings

### Analysis Paralysis Guard

**During execution, if you make 5+ consecutive Read/Grep/Glob calls without any Edit/Write/Bash action:**

STOP. State in one sentence why you haven't written anything yet. Then either:
1. **Write code** — you have enough context, proceed to Edit/Write
2. **Report "blocked"** — specific missing information preventing action

**Do NOT continue reading.** Analysis without action is a stuck signal.

### Deviation Rules

**While executing, you WILL discover work not in the plan.** Apply these rules automatically. Track all deviations for the wave summary.

**Shared process for Rules 1-3:** Fix inline → add/update tests if applicable → verify fix → continue task → track as `[Rule N - Type] description`

No user permission needed for Rules 1-3.

**RULE 1: Auto-fix bugs**
- **Trigger:** Code doesn't work as intended (broken behavior, errors, incorrect output)
- **Examples:** Wrong queries, logic errors, type errors, null pointer exceptions, broken validation
- **Action:** Fix immediately, verify with tests

**RULE 2: Auto-add missing critical functionality**
- **Trigger:** Code missing essential features for correctness, security, or basic operation
- **Examples:** Missing error handling, no input validation, no auth on protected routes, missing null checks
- **Action:** Add the missing functionality, verify it works

**RULE 3: Auto-fix blocking issues**
- **Trigger:** Something prevents completing current task
- **Examples:** Missing dependency, wrong types, broken imports, missing env var, build config error
- **Action:** Fix the blocker, continue execution

**RULE 4: Ask about architectural changes**
- **Trigger:** Fix requires significant structural modification
- **Examples:** New DB table, major schema changes, new service layer, switching libraries, changing auth approach
- **Action:** STOP → report: what found, proposed change, why needed, impact, alternatives
- **User decision required**

**RULE PRIORITY:**
1. Rule 4 applies → STOP (architectural decision)
2. Rules 1-3 apply → Fix automatically
3. Genuinely unsure → Rule 4 (ask)

**FIX ATTEMPT LIMIT:** After 3 auto-fix attempts on a single task:
- STOP fixing — document remaining issues in wave summary under "Deferred Issues"
- Continue to next task (or escalate if blocked)
- Do NOT restart builds hoping issues resolve themselves

### YOLO Mode During Execution

**ACT immediately** when:
- Scenario covered by approved PRD with clear path
- Only one reasonable implementation exists
- TDD safety net will catch errors
- Can empirically reproduce failure state

**ASK user** when:
- PRD doesn't cover this scenario
- Multiple valid approaches with different tradeoffs
- Wrong decision would cause significant rework

**Default bias**: ACT. Only ask when cost of being wrong exceeds cost of waiting.

## Error Handling

| Scenario | Action |
|----------|--------|
| Plan not approved | STOP. "Plan not approved. Run plan-writer first." |
| State shows "waiting" | STOP. "Awaiting user approval. Cannot proceed." |
| Slice validation fails | Return to Plan phase. Do not mark complete |
| Checkpoint 3 FAIL (3x) | Escalate: "Foundation has persistent issues. Manual review required." |
| Context budget exceeded | Split slice, update issue |

## Integration with Other Skills

This skill is the core execution engine in the planning workflow:

```
plan-writer (creates approved plan)
  ↓
momus-plan-reviewer (mandatory gate before execution)
  ↓
wave-executor Wave 1 (execute slices)
  ↓
momus-plan-reviewer Checkpoint 3 (audit foundation between waves)
  ↓
[User approves] → wave-executor Wave 2
  ↓
plan-updater (mark tasks complete during execution)
  ↓
plan-closer (final closure)
```

**Input from:**
- `plan-writer`: Approved plan file path
- `momus-plan-reviewer`: Gate decision PASS (mandatory before execution)
- User: "start execution", "implement slice", "next wave"

**Output to:**
- `plan-updater`: Completed slices ready for progress tracking
- `momus-plan-reviewer`: Checkpoint 3 trigger between waves
- `plan-closer`: Final wave completion

**Gates integrated:**
- **Checkpoint 3**: `momus-plan-reviewer` validates foundation before building Slice 2+

**When to use vs other skills:**
- Use **wave-executor** for actual implementation work
- Use **plan-writer** before execution (creates the plan)
- Use **momus-plan-reviewer** before first wave and between waves
- Use **plan-updater** for incremental progress tracking
- Use **sisyphus-plan** for the full workflow unspecified-high

---

## Steps

### Step 0: Load Project Rules

Before executing, discover project context and load relevant coding rules:

**Detect project type:**
```bash
# Check for project files to determine language/framework
[ -f package.json ] && PROJECT_TYPE="node"
[ -f requirements.txt ] || [ -f pyproject.toml ] && PROJECT_TYPE="python"
[ -f go.mod ] && PROJECT_TYPE="go"
[ -f Cargo.toml ] && PROJECT_TYPE="rust"
[ -f flake.nix ] && PROJECT_TYPE="nix"
```

**Load relevant rules from `~/.config/opencode/rules/`:**

| Detected | Rule File | Applies To |
|----------|-----------|------------|
| `package.json` | `rules/languages/typescript.md` | TypeScript/JavaScript projects |
| `requirements.txt` / `pyproject.toml` | `rules/languages/python.md` | Python projects |
| `*.sh` files / `#!/bin/bash` | `rules/languages/shell.md` | Shell scripts |
| `flake.nix` | `rules/languages/nix.md` | Nix projects |
| `jest.config.*` / `vitest.config.*` | `rules/concerns/testing.md` | Any project with tests |
| Task marked `tdd: true` | `rules/concerns/tdd.md` | TDD-specified tasks |
| `.git` directory | `rules/concerns/git-workflow.md` | All projects |
| `README.md` with doc sections | `rules/concerns/documentation.md` | Projects with documentation |
| Complex directory structure (>10 dirs) | `rules/concerns/project-structure.md` | Large projects |
| Any project (always) | `rules/concerns/efficiency.md` | All projects |

**Load rules into working context (AUTOMATED):**

Run the rule loader script to detect project type and inject matching rules:
```bash
# Load all detected rule files into context
bash ~/.config/opencode/scripts/load-rules.sh
```
The `load-rules.sh` script auto-detects project files and loads matching language rules (`languages/`), concern rules (`concerns/`), and efficiency rules (always loaded).
- Follow loaded rules as **hard constraints** during implementation
- If a code change would violate a loaded rule, apply the rule and document as deviation

**Rule precedence (highest to lowest):**
1. Project-specific files (`CLAUDE.md`, `AGENTS.md`, project README)
2. Loaded language rules (`rules/languages/*.md`)
3. Loaded concern rules (`rules/concerns/*.md`)
4. Skill defaults (this SKILL.md)

**Document rule-driven adjustments:**
If a loaded rule causes a deviation from the plan (e.g., naming convention requires different variable names than planned), log it as:
```
[Rule: naming.md] Adjusted variable naming to follow TypeScript camelCase convention
```

---

1. **Read state file**
   ```bash
   STATE=$(cat ~/.sisyphus/state.json)
   ```
   Verify:
   - `approval_status` is "approved"
   - `workflow_stage` matches current execution phase

2. **Read plan and current wave's slices**
   - Identify slices for this wave
   - Check blockers (are dependencies complete?)

3. **For each slice in wave:**

   a. **Research Phase**
      - Read beads issue and referenced PRD section
      - Read existing code the slice will touch
      - Identify minimal change needed
      - If PRD ambiguous: use tools to disambiguate, don't ask user unless tools fail

   b. **Strategy Phase**
      - Identify test approach: what failing test proves missing feature?
      - Identify deep module boundaries
      - Estimate if slice fits in smart zone (~100K tokens)
      - If too large: split into sub-slice, update issue

    c. **Execution Phase** (Plan → Act → Validate)

       **If slice is marked `tdd: true`:**
       ```
       Delegate to tdd-executor:
         Input: slice specification, PRD section, current codebase
         Purpose: Execute RED-GREEN-REFACTOR cycle for this slice
       ```
       **tdd-executor handles:**
       - RED: Write failing test
       - GREEN: Implement to pass
       - REFACTOR: Clean up (if needed)
       - Returns: Test evidence log, 1-2 commits

       **If slice is NOT marked `tdd: true`:**
       - **Plan**: Write failing test (Red)
       - **Act**: Implement minimal code to pass test (Green)
       - **Validate**: Run tests, verify PRD compliance, log evidence
       - **Refactor**: Improve code with tests passing (if needed)

       **After any Edit/Write during execution (workflow-guard check):**
       - Was this edit part of the current slice plan?
         - YES → Mark as completed in slice checklist
         - NO → Log as deviation (Rule 1-3 auto-fixes are OK)
       - Did the edit create a new file not in the plan?
         - YES → Log as "additional artifact" in evidence
       - Did the edit modify files outside `src/` scope?
         - YES → Note: "Config change detected — update plan notes"

       **Verify checklist — ALL items mandatory. Slice is NOT complete until evidence exists.**

       > ⚠️ **Evidence is a blocking requirement.** If you cannot produce evidence for an item, the slice is incomplete. Do not mark complete and do not commit.

         1. **Tests passing** — Attach test output showing PASS. "Tests passing" without logs is not evidence.
         2. **No debug code** — Grep for `console.log`, `debugger`, `TODO markers`. Attach grep results.
         3. **Evidence file MUST exist** — Write `.sisyphus/evidence/<issue-id>-tdd-log.md` with:
            - Test results (commands + output)
            - Build/lint output
            - Wiring check results (grep for imports/usage)
            - PRD compliance checklist
            - **After writing: verify file exists with `ls -la .sisyphus/evidence/<issue-id>-tdd-log.md`**
            - If file does not exist: STOP. Evidence is missing. Do not proceed.
         4. **Build/lint/type-check** — Attach command output. "Build passes" without output is not evidence.
         5. **PRD compliance** — List PRD requirements checked and status (✓ / ✗). No scope creep.
         6. **Wiring check** — For each new file: grep for imports and usage. Attach results showing file is actually wired, not orphaned.
          7. **Graph-node traceability (parallel fan-out receipt gate):** This item applies **only** when the slice ran a **fan-out** — a parallel graph of `task(...)` calls whose results must be merged before the slice is complete. For each parallel `task()` node, append an entry to the canonical per-node receipt log at `$HOME/.sisyphus/evidence/execution-receipts.jsonl` (defined by `skills/execution-receipt/SKILL.md` — NOT a project-relative `.sisyphus/evidence/` path), **before** any of those results are read or merged. This is the graph-engineering fix for the "one error cascades, untraceable" flaw. Attach the receipt log path plus the per-node task numbers (from `$HOME/.sisyphus/evidence/execution-receipt-counter`). If the slice did **not** fan out — single serial `task()` chains or no delegation — this gate item is N/A; serial delegation is still governed by the general execution-receipt protocol in `skills/execution-receipt/SKILL.md` (one receipt per `task()` call), just not by this gate.

       **If build/lint/type-check fails:**
       ```
       Delegate to build-resolver:
         Input: failing command, error output, project root
         Purpose: Structured diagnosis instead of guessing
       ```
       Do NOT retry the same command hoping it works. Use build-resolver to identify root cause first.

       - **Security verification** (MUST for auth/data slices):
        1. Route protection: Do protected routes redirect when no session?
        2. API middleware: Do endpoints verify session and filter by user?
        3. Data ownership: Do models have ownership fields referencing users?
        4. Manual test: Try accessing protected routes without auth — should redirect or 403
        5. Manual test: Create resource as User A — should not appear in User B's view
        > Rule: **"Files exist" ≠ "Feature works" ≠ "Security implemented"**. Always verify manually.
       - **Component verification** (for frontend/styled components):
        1. No raw hex/rgb/hsl in JSX or CSS if token system exists
        2. Responsive behavior uses designated system (Tailwind variants, etc.)
        3. No direct store coupling in presentational components
        4. Motion (if any) uses designated animation system
        5. Component under line limit (recommend 300 lines max)
       - **Preflight check** (before starting flagged components — motion, tokens, responsive, API boundaries, >3 states):
         - [ ] Read component contract in PRD/plan
         - [ ] **Read `DESIGN.md` from project root** (design contract for colors, typography, spacing)
           - If it exists: follow it as hard constraint
           - If it does NOT exist and UI is in scope: **CREATE it** from existing tokens (tailwind.config.js, CSS variables, or infer from existing components). DESIGN.md is mandatory for UI work.
         - [ ] Read framework-reference for stack-specific rules
         - [ ] Verify all required tokens exist
         - [ ] Check forbidden patterns list
       - **Postflight check** (after implementing flagged component):
         - [ ] Verify no raw color literals in JSX/CSS
         - [ ] Verify responsive behavior uses designated system
         - [ ] Verify no direct store coupling in presentational component
         - [ ] Verify motion uses designated animation system
         - [ ] Run red-flag checklist if one exists in project
       - **Deviation escalation:**
         - **STOP and ask human:** Component behavior differs from plan; token needed doesn't exist; API boundary requires coupling not described in plan
         - **LOG and proceed:** Minor visual detail differs but matches token system; implementation detail not constrained by plan; refactoring needed to keep component under line limit
       - Validation failure = slice NOT complete. Return to Plan phase.

       **d. Goal-Backward Verification (GSD-inspired)**

       > **Task completion ≠ Goal achievement.** A task "create chat component" can be marked complete when the component is a placeholder. The task was done — but the goal "working chat interface" was not achieved.

       After all automated checks pass, perform goal-backward analysis:

       1. **State the slice goal** from the PRD/plan (the outcome, not the task)
       2. **Derive must-haves**:
          - **Truths**: 3-7 observable behaviors, each testable (e.g., "User can see existing messages")
          - **Artifacts**: Concrete file paths required for each truth
          - **Key links**: Critical wiring where stubs hide (Component→API, API→Database, Form→Handler, State→Render)
       3. **Verify each truth**:
          - For each truth: identify supporting artifacts → check artifact exists → check artifact is substantive (not stub/placeholder) → check wiring → determine truth status
          - Status: ✓ VERIFIED | ✗ FAILED | ? UNCERTAIN (needs human)
       4. **Check for anti-patterns** in files modified this slice:
          - TODO/FIXME/XXX/HACK markers → ⚠️ Warning
          - Placeholder content ("coming soon", "will be here", "TODO implement") → 🛑 Blocker
          - Empty returns (`return null`, `return {}`, `return []`) → ⚠️ Warning
          - Log-only functions (only `console.log` in body) → ⚠️ Warning
          - Exported-but-unused symbols (dead stores) → ⚠️ Warning
        5. **Determine slice status**:
           - **passed**: All truths VERIFIED, no blocker anti-patterns
           - **gaps_found**: Any truth FAILED or artifact MISSING/STUB/ORPHANED
           - **human_needed**: All automated checks pass but visual/UX/behavioral items need human verification

        **OUTPUT REQUIREMENT — Before marking slice complete, you MUST produce:**

        ```markdown
        ### Goal-Backward Verification: {slice-name}

        **Slice Goal:** {outcome from PRD/plan}

        | # | Truth (Observable Behavior) | Artifacts | Wiring | Status |
        |---|----------------------------|-----------|--------|--------|
        | 1 | {truth} | {files} | {checked} | ✓ VERIFIED |
        | 2 | {truth} | {files} | {checked} | ✓ VERIFIED |

        **Anti-patterns:** {none / list warnings and blockers}

        **Overall Status:** {passed / gaps_found / human_needed}
        ```

        Do NOT skip this output. If you cannot fill this table, you have not done goal-backward verification.

         If `gaps_found`: Generate fix plan, execute, re-verify. Do NOT mark slice complete.
         If `human_needed`: Log human verification items, proceed to commit, note in evidence.

        **e. Post-Change Review (before commit)**

        After goal-backward verification passes, invoke post-reviewer for safety net:
        ```
        Delegate to post-reviewer:
          Input: changed files, PRD requirements, slice goal
          Purpose: Catch mistakes before they compound
        ```

        If post-reviewer finds blockers: fix them, re-verify, re-invoke reviewer.
        If post-reviewer finds warnings: log them, proceed if not blocking.

        **f. Atomic Commit (per verified slice — HARD GATE)**

        > ⚠️ **Atomic commits are mandatory.** A slice is NOT complete until committed. Git history is the universal record — it outlives `.sisyphus/` and is readable by all developers and agents.

        After post-reviewer passes:

        1. **Stage slice files only:**
           ```bash
           git add -p  # interactive staging, or git add <specific files>
           ```

        2. **Generate commit message using git-commit-message skill:**
           ```
           Delegate to git-commit-message:
             Input: git diff --cached (staged changes), slice goal, verification evidence
             Purpose: Generate conventional commit message with what, why, verification
           ```

        3. **Commit with evidence:**
           ```bash
           git commit -m "feat({slice-name}): {brief description}

           - What: {what was implemented}
           - Why: {why it achieves the stated goal}
           - Verification: {test result summary}
           - Plan: {plan_name}, Wave: {wave_number}"
           ```

        4. **Verify commit exists:**
           ```bash
           git log -1 --oneline
           # Must show the commit you just made
           ```

        **Commit message MUST include:**
        - Conventional commit type: `feat(...)`, `fix(...)`, `refactor(...)`, `test(...)`
        - What was implemented (terse, present tense)
        - Why it achieves the stated goal (not just "done")
        - Verification evidence (tests passing, truths verified)
        - Plan and wave reference (for traceability)

        **This enables:**
        - `git bisect` to identify exactly which slice broke the build
        - `git log --grep="plan-name"` to see all commits for a feature
        - Other developers/agents to understand implementation from git history alone

        **If commit fails (merge conflict, hook rejection, etc.):**
        - STOP. Do not mark slice complete.
        - Fix the blocker (resolve conflict, fix hook issues).
        - Retry commit. Do NOT skip.

        **After all slices in wave are committed:**
        ```bash
        bash ~/.config/opencode/scripts/verify-git-commits.sh {project_root} {plan_name} {wave_number}
        ```
        If verification FAILS: Fix commit issues before presenting wave summary.

 4. **Checkpoint 3: Pre-Slice Architecture Audit (before Slice 2+)**
     Before building any slice that depends on a prior slice:
     ```
     Delegate to momus-plan-reviewer:
       Input: PRD path, Plan path, Evidence path (slice-1 tdd-log)
       Purpose: Verify foundation is solid before building on it
     ```

     | Decision | Action |
     |----------|--------|
     | PASS | Foundation solid. Proceed to next slice |
     | WARNING | Foundation has risks. Proceed with extra verification |
     | FAIL | Foundation broken. STOP. Fix prior slice first. Retry (max 3) |

## Checkpoint Protocol

Checkpoints formalize human-in-the-loop points for verification and decisions, not manual work. The full protocol — type frequencies (`human-verify` 90% / `decision` 9% / `human-action` 1%), the `## CHECKPOINT REACHED` template, when-NOT-to-use rules, and `--auto` mode behavior — is documented in **`references/checkpoint-protocol.md`**.

**Golden rule (always applies):** If the agent CAN automate it, the agent MUST automate it. Checkpoints are for what requires human judgment.

 5. **Regression Gate (before marking wave complete)**
     If this is NOT the first wave:
     ```
     Delegate to regression-gate:
       Input: current wave number, project root
       Purpose: Run prior wave tests to catch cross-wave regressions
     ```

     | Decision | Action |
     |----------|--------|
     | PASS | No regressions. Proceed to state update |
     | WARNING | Partial regression info. Note in wave summary |
     | FAIL | Regressions found. STOP. Fix before marking wave complete |

     **Skip regression gate** if:
     - This is Wave 1 (no prior waves)
     - Plan explicitly marks this wave as "isolated changes"
     - No test files exist in project

 6. **Write QA Handoff Artifact (MANDATORY)**

     After wave completion, write a scope artifact for downstream skills (regression-gate, security-auditor, code-review) to `.sisyphus/notepads/`:

     ```bash
     NOTEPAD=".sisyphus/notepads/wave-{N}-qa-handoff.md"
     mkdir -p $(dirname "$NOTEPAD")
     ```

     **Artifact schema (MUST include all fields):**

     ```markdown
     ---
     type: qa-handoff
     plan: {plan_name}
     wave: {N}
     date: {YYYY-MM-DD}
     author: wave-executor
     ---

     ## Scope Summary
     **Goal:** {one-sentence outcome from PRD}
     **Slices completed:** {slice-1}, {slice-2}, ...
     **Files modified:** {list of key files}

     ## Intent Source
     - **Active plan:** {path to plan}
     - **PRD section:** {section numbers}
     - **Beads issue(s):** {issue IDs}

     ## Truths Verified (from goal-backward verification)
     | # | Truth | Status |
     |---|-------|--------|
     | 1 | {observable behavior} | ✓ VERIFIED |

     ## Critical Links (where stubs may hide)
     - {Component→API}: {file paths}
     - {API→Database}: {file paths}
     - {Form→Handler}: {file paths}

     ## Known Gaps / Human Verification Needed
     - {item} — reason

     ## Anti-patterns Found
     - {none | list warnings/blockers}

     ## Deviation Log
     - {none | list with Rule references}
     ```

     **Why this matters:** Downstream skills read this artifact to avoid redundant verification and to know which truths were already proven. This prevents the "every skill re-verifies from scratch" problem.

     **Storage rules:**
     - Filename: `wave-{N}-qa-handoff.md` (deterministic, no timestamps in filename)
     - One file per wave, overwrite on re-execution
     - If file already exists from a previous run: read it, merge new findings, write back

 7. **Update state file after wave completion**
     ```bash
     TIMESTAMP=$(date -Iseconds)
     # Read existing state, update fields, write back
     ```

     Updated state fields:
     ```json
     {
       "workflow_stage": "wave_{N}_completed",
       "pending_gate": "wave_{N+1}_approval",
       "approval_status": "waiting",
       "current_wave": {N},
       "completed_slices": ["slice-1", "slice-2", ...],
       "gate_history": [
         ...existing gates,
         {"gate": "wave_{N}_complete", "status": "completed", "timestamp": "TIMESTAMP_PLACEHOLDER"},
         {"gate": "wave_{N+1}_approval", "status": "waiting", "timestamp": "TIMESTAMP_PLACEHOLDER"}
       ],
       "qa_handoff": ".sisyphus/notepads/wave-{N}-qa-handoff.md"
     }
     ```

     **Replace TIMESTAMP_PLACEHOLDER** with the actual timestamp generated by `date -Iseconds`.

 7. **Wave Completion Validation (HARD GATE)**

    Before presenting the wave summary, run the mechanical validator:

    ```bash
    bash ~/.config/opencode/scripts/wave-validator.sh {project_root} {wave_number} {plan_name}
    ```

    | Result | Action |
    |--------|--------|
    | **PASS** | Proceed to present wave summary |
    | **FAIL** | **STOP. Wave is NOT complete.** Fix the listed errors, re-verify, then re-run validator |

    **This is a hard gate — the wave cannot be marked complete if validation fails.**

    The validator checks:
    - Evidence directory exists and has files
    - Goal-backward verification files present
    - Build evidence exists
    - Model transparency line found in evidence
    - DESIGN.md exists when UI work detected
    - State file updated with wave completion

    Do NOT bypass this step. Do NOT present a summary for a wave that hasn't passed validation.

 8. **Present wave summary to user**

    **MANDATORY — Include in every wave summary:**

    ```markdown
    ## Wave {N} Summary

    **Model Used:** Executing with [model] via [category]
    *(e.g., "Executing with glm-5.2 via unspecified-high")*

    ### Completed
    - {what was completed in this wave}

    ### Evidence
    - {location of evidence files}

    ### Goal-Backward Verification
    | Slice | Status | Truths Verified |
    |-------|--------|----------------|
    | {slice-name} | passed / gaps_found | {N}/{M} |

    ### Next Wave
    - {slices, acceptance criteria}

    ### Blockers/Risks
    - {any issues discovered}

    ---
    **Wave {N} complete. Approve to continue to Wave {N+1}?**
    ```

    **Checklist before presenting summary:**
    - [ ] Model transparency line included ("Executing with [model] via [category]")
    - [ ] Evidence files exist (verify with `ls .sisyphus/evidence/`)
    - [ ] Goal-backward verification table present for each slice
    - [ ] Wave validator passed ( Step 7 )
    - [ ] If any evidence is missing: STOP, do not present summary. Complete evidence first.

    Do NOT skip the model transparency line. It is required for cost verification and debugging.

## Output

- Wave completion summary
- Evidence file paths
- Updated state file
- Next wave preview

## Gate to Next Phase

User explicitly approves ("continue", "next wave") → hand off to next `wave-executor` call (or self if same session)

---

## Length Exception

This SKILL.md exceeds the 500-line guideline. **Reason:** 8-step wave execution workflow with mandatory state-file updates, QA handoff artifact schema, regression-gate integration, wave-validator hard gate, and summary template — each step has its own checklist and tables that downstream skills (regression-gate, code-review, security-auditor) depend on being inline. **Pruning done:** Checkpoint Protocol extracted to `references/checkpoint-protocol.md` (781→736, Tier 2b). Remaining body is the irreducible execution sequence. Validator WARN is expected and accepted per `skill-creator/SKILL.md` L265.