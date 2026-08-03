---
name: orchestrator-review
description: "Operator-owned fan-out review skill. Forks plugin-bundled review-work's parallel-lane structure with Sisyphus gate lanes: code-review + security-auditor + ui-auditor + goal-verify (against plan/PRD acceptance criteria) + conditional regression-gate + optional oracle second-opinion for high-risk items. All active lanes must reach a terminal state before the merged report is delivered. Invocable in one line. Triggers: 'orchestrator-review', 'fan-out review', 'run all review gates', 'full review pass', 'review before merge', 'capstone review', 'review the graph'."
compatibility: opencode
---

# Orchestrator-Review — Operator-Owned Fan-Out Review Skill

A single skill whose **only job is to run other review skills in parallel and merge their findings into one report**. This is the Sisyphus capstone — the orchestrator pattern that turns "working in graphs" into "engineering graphs" (see `~/developer/ytdl/graph-engineering/GRAPH-ENGINEERING-SOURCE-KNOWLEDGE.md` §11).

## Operator-Owned — Editable

This skill lives at `~/.config/opencode/skills/orchestrator-review/SKILL.md` (this file). It is **not** the plugin-bundled `review-work` skill under `node_modules/oh-my-openagent/dist/skills/review-work/`. It is a deliberate fork:

- **`review-work`** (plugin-bundled, read-only) — 5 generic lanes (goal-verify, QA-execution, code-quality, security, context-mining) tuned for any harness.
- **`orchestrator-review`** (this skill, operator-owned) — Sisyphus-specific gate lanes wiring the actual review skills already in this repo (`code-review`, `security-auditor`, `ui-auditor`, `regression-gate`) plus goal-verification against the HMAC-gated plan/PRD acceptance criteria.

Edit this file freely. It will not be overwritten by `npm install` / plugin upgrades.

## One-Line Invocation

The capstone promise (source knowledge §17 caveat 6): **the only thing the calling prompt needs to say is "use orchestrator-review"** — every lane fans out underneath on its own.

```
orchestrator-review <scope> <artifacts>
```

- `<scope>` — what to review: a wave (`wave-3`), a slice (`slice-auth`), a diff range (`main..HEAD`), or a directory.
- `<artifacts>` — where the truth lives: PRD/plan slug (`my-plan-001`), a DESIGN.md path, a bead id, or `auto` to derive from `git diff`.

Examples:

```
orchestrator-review wave-3 my-plan-001
orchestrator-review slice-auth .sisyphus/plans/auth-plan
orchestrator-review main..HEAD auto
orchestrator-review . auto
```

If `<scope>` or `<artifacts>` is ambiguous, the skill reads `.sisyphus/plans/` + `.sisyphus/prds/` for the active initiative and falls back to `git diff --name-only HEAD~1`. One focused clarifying question maximum — never a checklist.

## The Discipline — One Skill Per Angle

The orchestrator **does not review**. Each review angle runs in its own lane as a separate `task()` with its own skill loaded. The orchestrator only fans out, waits at the barrier, and merges.

**Do not stuff all review types into this skill.** A merged mega-review makes the agent worse, not better (source knowledge §11, §17 caveat 5). Each lane is an independent context window running one skill. The orchestrator never inlines a checklist that a lane's skill already owns.

## Phase 0 — Gather Review Context

Before fanning out, collect:

- **SCOPE** — the `<scope>` argument (or derived).
- **ARTIFACTS** — PRD path, plan path, DESIGN.md path, bead id, or `auto`.
- **ACCEPTANCE_CRITERIA** — pulled from the plan/PRD. The goal-verify lane judges against this. If no plan/PRD is found, fall back to the original user request in the conversation + commit messages and flag `scope-context-unclear` rather than guessing.
- **CHANGED_FILES** — `git diff --name-only <base>..HEAD`.
- **DIFF** — `git diff <base>..HEAD`.
- **FILE_CONTENTS** — full content of each changed file (oracle lanes cannot read files; skill lanes can, but pasting contents keeps lanes symmetric).
- **DESIGN_MD** — path to DESIGN.md if UI/CSS is in scope (drives the ui-auditor lane).
- **HAS_PRIOR_WAVES** — true if `.sisyphus/evidence/` contains prior-wave test logs (drives the regression-gate lane).

Review PRs and branches from a dedicated review worktree (`git worktree add <path> <branch>`) before collecting the diff or running checks. The main worktree is read-only context.

If SCOPE / ARTIFACTS / ACCEPTANCE_CRITERIA cannot be derived, ask **one** focused question — not a checklist.

## Phase 1 — Fan Out Lanes

Launch every lane in a **single turn**, each with `run_in_background=true`. No sequential launches. No waiting between them.

Lanes are leaf agents: each does its own reading, running, and judging inline. A lane never spawns sub-reviewers. A lane ends at its verdict; a re-review after fixes is a fresh spawn scoped to the delta, never a follow-up to a stale reviewer.

### Lane Map

| # | Lane | Loads | Fires | Routing |
|---|------|-------|-------|---------|
| 1 | Goal Verification | — (oracle reads acceptance criteria directly) | always | `subagent_type="oracle"` |
| 2 | Code Review | `skills/code-review` | always | `category="ultrabrain"` |
| 3 | Security Audit | `skills/security-auditor` | always | `category="ultrabrain"` |
| 4 | UI Audit | `skills/ui-auditor` | only if DESIGN.md or UI/CSS files in scope | `category="ultrabrain"` |
| 5 | Regression Gate | `skills/regression-gate` | only if HAS_PRIOR_WAVES | `category="unspecified-low"` |
| 6 | Oracle Second-Opinion | — (fresh oracle) | only on high-risk items from lanes 1–5 (Phase 2.5) | `subagent_type="oracle"` |

**Strong model at every judging node** (source knowledge §7). Lanes 1–4 judge — they run on `ultrabrain` / `oracle`. Lane 5 is mechanical (run tests, parse, report) — `unspecified-low` per the `regression-gate` skill's own model section. Do not downgrade a judging lane to a cheap category: one bad review inside a graph means agents fix non-bugs and you cannot trace which node started it. Routing abstractions (`category`, `subagent_type`) resolve to actual models via `oh-my-openagent.json`; do not hardcode model identifiers in this file — they drift on every refresh.

### Lane 1 — Goal Verification (always)

```
task(
  subagent_type="oracle",
  run_in_background=true,
  load_skills=[],
  description="Verify implementation against plan/PRD acceptance criteria",
  prompt="""
  <review_type>GOAL VERIFICATION — ACCEPTANCE CRITERIA</review_type>

  <acceptance_criteria>
  {ACCEPTANCE_CRITERIA — every criterion from .sisyphus/plans/<plan> + .sisyphus/prds/<prd>.
   If none found, emit "scope-context-unclear" and fall back to the original user request.}
  </acceptance_criteria>

  <changed_files>{CHANGED_FILES}</changed_files>
  <file_contents>{FILE_CONTENTS}</file_contents>
  <diff>{DIFF}</diff>

  For each acceptance criterion, mark ACHIEVED / MISSED / PARTIAL with specific code evidence.
  Flag any plan/PRD requirement absent from the diff. Flag scope creep (changed files unrelated
  to the stated scope). Walk >=3 representative scenarios through the code.

  OUTPUT: <verdict>PASS|FAIL</verdict> <confidence>HIGH|MEDIUM|LOW</confidence>
  <criterion_table> one row per criterion with status + evidence </criterion_table>
  <blocking_issues> empty if PASS </blocking_issues>
  """)
```

### Lane 2 — Code Review (always)

```
task(
  category="ultrabrain",
  run_in_background=true,
  load_skills=["code-review"],
  description="Structured code review (correctness, security, performance, maintainability, architecture)",
  prompt="""
  <review_type>CODE REVIEW — skills/code-review</review_type>
  <scope>{SCOPE}</scope>
  <changed_files>{CHANGED_FILES}</changed_files>
  <diff>{DIFF}</diff>
  <background>{BACKGROUND}</background>

  Load and follow skills/code-review. Run its full review framework (correctness, security,
  performance, maintainability, testing, error handling, architecture patterns). Apply its
  Intent Hierarchy, Finding Promotion Gate, and Confidence Levels verbatim.

  OUTPUT: the code-review skill's standard report + <verdict>PASS|FAIL</verdict>
  <blocking_issues> CRITICAL+MAJOR only, empty if PASS </blocking_issues>
  """)
```

### Lane 3 — Security Audit (always)

```
task(
  category="ultrabrain",
  run_in_background=true,
  load_skills=["security-auditor"],
  description="6-category security audit (PASS/WARN/FAIL gate)",
  prompt="""
  <review_type>SECURITY AUDIT — skills/security-auditor</review_type>
  <changed_files>{CHANGED_FILES}</changed_files>
  <diff>{DIFF}</diff>

  Load and follow skills/security-auditor. Run all 6 categories: secrets, injection, XSS,
  auth/CSRF, dependencies, path traversal. Return its PASS/WARN/FAIL gate decision.

  OUTPUT: the security-auditor skill's standard gate decision + findings
  <verdict>PASS|WARN|FAIL</verdict> <severity>CRITICAL|HIGH|MEDIUM|LOW|NONE</severity>
  <blocking_issues> CRITICAL+HIGH only </blocking_issues>
  """)
```

### Lane 4 — UI Audit (conditional — only if DESIGN.md or UI/CSS in scope)

Skip if the diff touches no `.css`/`.tsx`/`.html`/templates AND no DESIGN.md path was supplied.

```
task(
  category="ultrabrain",
  run_in_background=true,
  load_skills=["ui-auditor"],
  description="DESIGN.md sections 10-14 validation (CSS architecture, accessibility, perf budget, theme)",
  prompt="""
  <review_type>UI AUDIT — skills/ui-auditor</review_type>
  <changed_files>{CHANGED_FILES}</changed_files>
  <diff>{DIFF}</diff>
  <design_md>{DESIGN_MD path, or "none — flag in report"}</design_md>

  Load and follow skills/ui-auditor. Validate against DESIGN.md sections 10-14. If no DESIGN.md
  exists, return verdict WARN with note "no design baseline — UI changes unanchored".

  OUTPUT: the ui-auditor skill's standard gate decision <verdict>PASS|WARN|FAIL</verdict>
  """)
```

When Lane 4 is skipped, record `N/A — no UI/CSS in scope` in the final lane table. A skipped lane is a terminal state (not pending).

### Lane 5 — Regression Gate (conditional — only if HAS_PRIOR_WAVES)

Skip on the first wave or when no prior-wave test evidence exists.

```
task(
  category="unspecified-low",
  run_in_background=true,
  load_skills=["regression-gate"],
  description="Prior-wave regression suite (catches cross-wave breakage before advancing)",
  prompt="""
  <review_type>REGRESSION GATE — skills/regression-gate</review_type>
  <scope>{SCOPE — "wave N -> wave N+1" or "pre-closure full suite"}</scope>
  <prior_evidence>.sisyphus/evidence/ (glob for prior-wave test logs)</prior_evidence>

  Load and follow skills/regression-gate. Run the prior-wave test suite (between-wave check)
  or the full suite (pre-closure). Consume existing QA handoff artifacts to avoid redundant runs.

  OUTPUT: the regression-gate skill's standard gate decision <verdict>PASS|WARN|FAIL</verdict>
  """)
```

When Lane 5 is skipped, record `N/A — first wave / no prior-wave tests` in the final lane table.

## Phase 2 — Barrier: Wait & Collect

**Do NOT deliver the final report until ALL active lanes have a terminal state: PASS, FAIL, WARN, INCONCLUSIVE, or N/A (skipped).**

Treat each lane's verdict as a progress signal, not a timeout counter. Between `background_output` calls, back off — double the timeout up to ~5 minutes — instead of spinning short cycles. While any lane is active, keep the orchestrator visibly alive: lane name, current phase, latest `WORKING:` signal.

A timeout, ack-only reply, or empty child result is **not** a PASS. If a lane remains silent after one reliability follow-up:

1. Record it as `INCONCLUSIVE` (not pending, not PASS).
2. Respawn a smaller `run_in_background=true` lane scoped to the missing deliverable.
3. If still unfinished after that retry, close the still-running task if safe, keep the lane `INCONCLUSIVE`, and emit the final aggregate result with the incomplete lane named.

Preserve completed lane results immediately — never lose a verdict because another lane is still running.

Track each lane independently:

| # | Lane | Verdict | Confidence | Notes |
|---|------|---------|------------|-------|
| 1 | Goal Verification | pending/PASS/FAIL/INCONCLUSIVE | HIGH/MED/LOW | — |
| 2 | Code Review | pending/PASS/FAIL/INCONCLUSIVE | — | — |
| 3 | Security Audit | pending/PASS/WARN/FAIL/INCONCLUSIVE | severity | — |
| 4 | UI Audit | pending/PASS/WARN/FAIL/INCONCLUSIVE/N/A | — | — |
| 5 | Regression Gate | pending/PASS/WARN/FAIL/INCONCLUSIVE/N/A | — | — |

Lane 6 (Oracle Second-Opinion) is **conditional** — it fires only in Phase 2.5 after the Phase 2 barrier lifts and a high-risk trigger is met. It is NOT tracked in this table; its verdict row appears in the Phase 3 final report.

## Phase 2.5 — Oracle Second-Opinion (conditional, high-risk only)

Fire Lane 6 **only** when a Lane 1–5 verdict triggers a high-risk condition:

- Any lane returns **FAIL** with `confidence: HIGH`
- Lane 3 (security) returns **FAIL** at severity CRITICAL or HIGH
- Lane 1 (goal-verify) marks a P0 acceptance criterion `MISSED`
- Lane 4 (ui-auditor) returns **FAIL** on accessibility (WCAG)

The second-opinion lane is a **fresh oracle** pass from a clean context — it does not inherit the failing lane's reasoning. Its job is to confirm or clear the high-risk finding before the orchestrator escalates to the operator.

```
task(
  subagent_type="oracle",
  run_in_background=true,
  load_skills=[],
  description="Second-opinion confirmation of high-risk finding",
  prompt="""
  <review_type>SECOND OPINION — HIGH-RISK CONFIRMATION</review_type>
  <trigger>{which lane, which finding, original evidence quoted}</trigger>
  <changed_files>{CHANGED_FILES}</changed_files>
  <file_contents>{FILE_CONTENTS — only files referenced by the finding}</file_contents>

  A prior review lane flagged this as high-risk. Confirm or clear the finding from a fresh read.
  Do not inherit the prior lane's reasoning. State whether the finding holds under independent review.

  OUTPUT: <verdict>CONFIRMED|CLEARED|INCONCLUSIVE</verdict> <confidence>HIGH|MEDIUM|LOW</confidence>
  <reasoning> 2-4 sentences </reasoning>
  """)
```

A `CLEARED` second-opinion downgrades the original finding from blocking to advisory in the final report. A `CONFIRMED` finding is escalated as the lead blocker. `INCONCLUSIVE` leaves the original verdict standing.

Skip Lane 6 entirely if no high-risk trigger fires — most reviews do not need it.

## Phase 3 — Merge & Deliver Verdict

Verdict logic:

```
ALL active lanes PASS (or N/A) and no Lane 6 CONFIRMED   -> REVIEW PASSED
ANY lane WARN but none FAIL and no Lane 6 CONFIRMED      -> REVIEW PASSED WITH WARNINGS
ANY lane FAIL or (security CRITICAL/HIGH)                -> REVIEW FAILED
ANY lane INCONCLUSIVE and none failed                    -> REVIEW INCONCLUSIVE — not approved
```

Final report:

```markdown
# Orchestrator-Review — Final Report

**Scope:** {SCOPE} | **Artifacts:** {ARTIFACTS} | **Date:** {YYYY-MM-DD}

## Overall Verdict: PASSED / PASSED WITH WARNINGS / FAILED / INCONCLUSIVE

| # | Lane | Skill | Verdict | Confidence | Notes |
|---|------|-------|---------|------------|-------|
| 1 | Goal Verification | oracle (agents/oracle.md) | ... | ... | ... |
| 2 | Code Review | skills/code-review | ... | ... | ... |
| 3 | Security Audit | skills/security-auditor | ... | severity | ... |
| 4 | UI Audit | skills/ui-auditor | ... / N/A | ... | ... |
| 5 | Regression Gate | skills/regression-gate | ... / N/A | ... | ... |
| 6 | Oracle Second-Opinion | oracle (agents/oracle.md) | ... / not fired | ... | ... |

## Blocking Issues
[Aggregated, deduplicated, prioritized. Each tagged with its source lane.]

## Key Findings
[Top findings across lanes, grouped by theme. Each tagged with its source lane.]

## Recommendations
[If FAILED: exactly what to fix, in priority order, with file:line references.
 If PASSED: non-blocking suggestions only — do not turn a pass into a lecture.]
```

If FAILED, be specific — the operator must know what to fix and in what order. If PASSED, keep it short.

## What This Skill Does NOT Do

- **Does not write code.** Fixing findings is a separate `wave-executor` / `tdd-executor` task.
- **Does not run HMAC gates.** This skill produces a review report; signing a verdict (`plugins/sisyphus-gates/cli.js sign-verdict`) is an operator-only action that this skill cannot perform or request.
- **Does not inline review checklists.** Each lane loads its own skill. Inlining would create the mega-review anti-pattern the source knowledge warns against (§17 caveat 5).
- **Does not chain serially.** All mandatory lanes fire in parallel; the only serial step is the optional Lane 6 second-opinion, which fires after Phase 2.
- **Does not replace `momus-reviewer`.** `momus-reviewer` is the serial HMAC-gated PRD/plan reviewer. This skill is the parallel fan-out over completed implementation. Different shapes, different gates — both stay.

## Anti-Patterns

- Inlining any lane's checklist into this skill (creates the mega-review; the lane loses its isolated context window)
- Firing lanes sequentially instead of in one turn (loses the parallelism that makes the graph fast)
- Delivering a verdict while a lane is still `pending` (violates the barrier)
- Treating an empty child result or timeout as a PASS (it is INCONCLUSIVE)
- Routing a judging lane to a cheap category (one bad review cascades through the whole graph — source knowledge §7)
- Firing Lane 6 on every finding (it is for high-risk only — otherwise it doubles token burn for no signal)
- Editing the plugin-bundled `review-work` instead of this file (this is the operator-owned fork; that one is read-only)
