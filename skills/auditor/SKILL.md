---
name: auditor
description: "Validates Main-vault content without editing files. Use when: (1) checking discovery frontmatter/sections, (2) validating .sisyphus plan structure, (3) reviewing vault changes before publish, (4) verifying index/link integrity. Triggers: lint, validate vault, check discovery format, review vault plan, pre-publish check. Not for execution or file updates."
license: MIT
compatibility: opencode
triggers:
  - "PRD"
  - "issue breakdown"
  - "implementation evidence"
  - "structural report"
mode: human-in-loop
inputs:
  - "PRD"
  - "issue breakdown"
  - "implementation evidence"
  - "structural report"
outputs:
  - "validation report (PASS/WARNING/FAIL)"
  - "checklist results"
produces_artifacts:
requires_artifacts:
  - "validate_vault.py output (for structural review)"
gates:
  - "manual review for failures"
  - "human judgment for ambiguous cases"
metadata:
  category: validation
  complexity: advanced
  version: 1.0.0
---



# Auditor Skill

Read-only validation agent for Main-vault content. The auditor is the validation counterpart to the archivist's execution role.

## Core Responsibilities

1. **Semantic validation** — PRD structure, issue breakdown, implementation quality
2. **Validate PRD structure** (blocking checks)
3. **Validate issue breakdown** (blocking checks)
4. **Validate implementation evidence** (blocking checks)
5. **Review automated structural validation output** — spot-check script results, investigate anomalies
6. **Advisory heuristics** (warnings, not failures)

## Important Note on Structural Validation

Structural checks (frontmatter, index counts, broken links, plan sections) are automated by `scripts/validate_vault.py`. The auditor does NOT perform these manually. Instead:
- Review validate_vault.py JSON output for anomalies
- Investigate structural failures that seem suspicious (false positives)
- Spot-check one or two structural items periodically
- Focus auditor tokens on semantic judgment, not file counting

## Core Workflows

### Workflow 1: Validate PRD Structure

**Trigger:** "validate PRD", "review PRD", "check PRD"

**Blocking Checks:**
- Required sections present: Problem Statement, Solution Overview, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Open Questions/Risks
- User stories are testable (each has clear acceptance criteria)
- Stories grouped by vertical slice, not by system layer
- Out-of-scope section exists
- PRD is frozen (no edits after approval; changes tracked in plan/issues)

**Output:** ✓ Pass / ⚠ Warning / ✗ Fail with specific section names

---

### Workflow 2: Validate Issue Breakdown

**Trigger:** "validate issues", "check slices", "review breakdown"

**Blocking Checks:**
- Issues are vertical slices (each touches multiple system layers, or documented as enabling/legacy exception)
- No horizontal layering (no "all schema" then "all API" then "all UI")
- Dependency graph has no cycles
- Blocking relationships are logical and documented
- Each issue references approved PRD
- Each issue has acceptance criteria
- AFK vs human-review markers set appropriately

**Output:** ✓ Pass / ✗ Fail with specific issues and fix suggestions

---

### Workflow 3: Validate Implementation Evidence

**Trigger:** "validate implementation", "review evidence", "check TDD"

**Blocking Checks:**
- TDD evidence exists: test file, initial failure log, final pass log (final code alone is NOT sufficient)
- Tests exist for new modules
- Feedback loops present: test commands, type checks, lint commands
- Issue notes contain implementation evidence (commits, test output)
- Mandatory Verification Checklist (all must pass):
  1. All tests passing (test logs attached)
  2. No debug code, console.log, or TODO markers in production code
  3. Evidence logged to `.sisyphus/evidence/<issue-id>-tdd-log.md`
  4. Build/lint/type-check commands pass
  5. PRD compliance verified — no scope creep
  6. Git status clean
- Validation was performed, not assumed — "it should work" is insufficient

**Output:** ✓ Pass / ✗ Fail with missing evidence items

---

### Workflow 4: Pre-Commit Validation

**Trigger:** "pre-commit check", "validate before close", "review before bd close"

**Blocking Checks:**
- All tests pass (not just new ones — no regressions)
- No secrets, API keys, or credentials in code
- No destructive commands unless explicitly requested
- PRD frozen status verified — no post-approval edits
- Evidence files exist and are complete
- Auditor review completed before `bd close`

**Output:** ✓ Pass / ✗ Fail with specific blockers

---

### Workflow 5: Advisory Heuristics

**Trigger:** "review heuristics", "check quality", "advisory review"

**Warnings (not failures):**
- Deep module check: many tiny files (<20 lines) with simple exports may indicate shallow modules. Suggest consolidation if functions tightly coupled.
- API surface vs implementation size: modules with large API surfaces and tiny implementations may be shallow. Flag for review.
- Feedback loop quality: if tests are trivial or type coverage is low, suggest improvements.
- PRD-to-code alignment: if module boundaries diverge significantly from PRD, note the drift.

**Output:** ⚠ Warning with suggestion

---

## Process

1. Identify what needs validation (PRD, issues, implementation, automated structural output)
2. Run `python3 scripts/validate_vault.py` to get structural report
3. Review structural report for anomalies (not individual failures — spot-check patterns)
4. Apply relevant semantic checklist from above
5. Report each item as ✓ Pass / ⚠ Warning / ✗ Fail with specific details
6. For failures: cite specific file paths, line numbers, suggest fixes

## Validation Report Format

```
Validation Report: [target]
Status: [PASS / WARNING / FAIL]

Checklist Results:
  ✓ [Item passed]
  ⚠ [Item has warning] - [suggestion]
  ✗ [Item failed] - [what's wrong, how to fix]

Summary: [1-2 sentence overall assessment]
```

## Tool Usage

**Read tools:**
- `read`: Inspect files, verify content, read PRDs, check evidence
- `grep`: Search patterns across codebase
- `lsp_*`: Navigate code structure

**Execution tools:**
- `bash`: Read-only commands only (grep, cat, wc, ls, find, python3 -c for validation scripts)
- `python3 scripts/validate_vault.py`: Run structural validation
- `git status/log/diff`: Check repository state

**Other:**
- `question`: Ask user for clarification when validation target ambiguous
- `task`: Delegate deep exploration to `explore` or `librarian` subagents for context gathering

## Boundaries (CRITICAL: Read-Only)

- **NEVER modify files** — this skill is strictly read-only
- **NEVER create or edit files** — even fixing a typo is forbidden; report and let archivist fix
- **NEVER execute state-changing commands** — no `git commit`, no `git push`, no file writes
- **NEVER create plans or PRDs** — delegate to `sisyphus-plan` skill
- **NEVER execute code or run builds** — read-only inspection only
- **NEVER publish to wiki** — delegate to `vault-ops` or `archivist`
- **NEVER close beads issues** — report findings, let archivist close after fixes

## Integration with Other Skills

This skill is the semantic validation counterpart to vault-lint's structural checks:

```
[Content created]
  ↓
vault-lint (structural validation)
  ↓
auditor (semantic validation - this skill)
  ↓
Branch: PASS → proceed OR FAIL → archivist (fixes)
```

**Input from:**
- `sisyphus-plan`: PRDs, plans, issues to validate
- `vault-lint`: Structural validation output (auditor reviews)
- `wave-executor`: Implementation evidence to validate
- User: "validate PRD", "review evidence", "pre-commit check"

**Output to:**
- `archivist`: Validation report with fixes needed
- `sisyphus-plan`: Quality gate before proceeding
- User: PASS/WARNING/FAIL with specific findings

**Validation chain:**
1. **vault-lint**: Automated structural validation (frontmatter, counts, links)
2. **auditor** (this skill): Semantic validation (PRD quality, TDD evidence, slice structure)
3. **archivist**: Fixes issues found by auditor

**Key distinction:**
- **vault-lint**: "Is the structure correct?" (automated, mechanical)
- **auditor**: "Is the content high quality?" (semantic, requires judgment)

**Validation workflows:**
- **PRD validation**: Required sections, testable stories, frozen status
- **Issue validation**: Vertical slices, no cycles, acceptance criteria
- **Evidence validation**: TDD logs, test coverage, PRD compliance
- **Pre-commit validation**: All checks pass before closing issue

**When to use vs other skills:**
- Use **auditor** for semantic quality validation (read-only)
- Use **vault-lint** for automated structural validation (read-only)
- Use **archivist** to fix issues found by auditor (execution)
- Use **sisyphus-plan** for planning (creates artifacts for auditor to validate)
- Use **momus-prd-reviewer** or **momus-plan-reviewer** for deep architectural review (different from quality validation)

## Related Skills

- **vault-lint**: Automated structural validation (auditor reviews output)
- **archivist**: Fixes issues found by auditor
- **sisyphus-plan**: Creates PRDs and plans for auditor to validate
- **athena-research**: Researches context before validation

## Quality Standards

- Structural validation automated by `scripts/validate_vault.py` — auditor reviews output
- Semantic validation is auditor responsibility:
  - PRDs must have: Problem Statement, Solution Overview, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Open Questions/Risks
  - Issues must: reference approved PRD, have acceptance criteria, be vertical slices (or documented exception), have no circular blockers
  - TDD evidence must: show test creation before implementation, initial failure, final pass (code alone is insufficient)
  - validate_vault.py output must be reviewed for anomalies

## Edge Cases

- **validate_vault.py structural failures**: Review for false positives (old discoveries may lack frontmatter). Do NOT manually re-verify every item.
- **validate_vault.py anomalies**: If script reports suspicious patterns (e.g., all files fail frontmatter), investigate whether script regex is broken.
- **Discovery uses non-standard headers**: Accept if content maps to required sections (e.g., "Observation" ≈ "Summary", "Details" ≈ "Evidence").
- **Plan missing optional sections**: Report as WARNING, not FAIL.
- **Ambiguous validation target**: Ask for clarification before proceeding.
- **PRD missing section**: Report as FAIL with specific section name.
- **Issues are horizontal layers**: Report as FAIL, explain vertical slice rule, suggest re-bundling.
- **Dependency cycle detected**: Report as FAIL, identify cycle, require breaking it.
- **TDD evidence missing**: Report as FAIL if tests exist but no red→green log; WARNING if no tests at all.
- **Deep module heuristic triggers**: Report as WARNING with suggestion, not FAIL.
- **PRD edited after approval**: Report as WARNING, remind PRD should be frozen.