---
type: reference
title: QA Artifact Schema & Confidence Rubric
date: 2026-05-29
---

# QA Artifact Schema & Confidence Rubric

Shared reference for skills that produce or consume QA handoff artifacts.

## Artifact Schema

All QA handoff artifacts written by `wave-executor` and read by `regression-gate`, `security-auditor`, and `code-review` MUST follow this schema:

### Frontmatter (required)

```yaml
---
type: qa-handoff
plan: {plan-name-slug}
wave: {N}
date: {YYYY-MM-DD}
author: {skill-name}
---
```

### Sections (all required, use "none" if empty)

| Section | Content | Consumer |
|---------|---------|----------|
| `## Scope Summary` | One-sentence goal, completed slices, key files modified | All downstream skills |
| `## Intent Source` | Plan path, PRD sections, beads issue IDs | code-review (intent hierarchy), security-auditor (target type) |
| `## Truths Verified` | Table of observable behaviors with status | regression-gate (skip re-testing), security-auditor (don't re-verify) |
| `## Critical Links` | Wiring points where stubs hide | regression-gate (prioritize), security-auditor (check auth/data flow) |
| `## Known Gaps` | Items needing human verification | regression-gate (elevate if in scope), wave-executor (next wave input) |
| `## Anti-patterns` | Warnings/blockers found | code-review (don't re-flag), security-auditor (check if fixed) |
| `## Deviation Log` | Rule-driven changes with references | plan-updater (track scope drift) |

### Storage Rules

- **Filename:** `wave-{N}-qa-handoff.md` (deterministic, NO timestamps)
- **Location:** `.sisyphus/notepads/`
- **One per wave:** Overwrite on re-execution
- **Merge strategy:** If file exists, read → merge new findings → write back (don't append)

## Confidence Rubric

Coarse operational levels for findings. Do NOT use numeric 1-10 scores.

| Level | When to Use | Display Rule |
|-------|-------------|--------------|
| **Report** | Finding is concrete, evidence is quoted, and you have verified the false-positive path | Show normally in main report |
| **Report with caveat** | Pattern match is correct but context makes severity uncertain | Show in main report with note: "Verify in production context" |
| **Suppress** | Evidence is weak, the line cannot be quoted, or you are reasoning from pattern memory alone | Move to `draft-findings` appendix only |

### Downgrade Rule

**When in doubt, downgrade one level.** A suppressed finding in the appendix is better than a false positive in the main report.

### Skill-Specific Applications

- **code-review:** Apply to all review findings. Suppressed findings go to `draft-findings` appendix.
- **security-auditor:** 
  - Daily mode: suppress anything below "Report"
  - Comprehensive mode: surface "Report with caveat" as `TENTATIVE`
- **regression-gate:** Not applicable (binary pass/fail), but use "Suppress" logic for flaky test warnings

## Intent Hierarchy

When establishing what a change was supposed to accomplish, use this priority order:

1. **Active plan/PRD** — `.sisyphus/plans/` or `.sisyphus/prds/`
2. **Bead issue** — `bd show <id>` for acceptance criteria
3. **`.sisyphus/notepads/`** — recent notepads for scope context
4. **Commit messages** — `git log --oneline origin/main..HEAD` as fallback only

If intent cannot be determined from (1-3), flag: **"Scope context unclear — review may flag intended behavior as drift."**

## Target-Aware Scan Ordering (security-auditor)

| Repo Type | Primary Risk Surface | Scan Order |
|-----------|---------------------|------------|
| **Application code** (web app, API, CLI) | User-facing endpoints, auth, data flow | Secrets in code → Dependency chain → CI/CD → Injection/XSS → Auth/CSRF → Config |
| **Agent/config system** (opencode setup) | Config files, skill definitions, plugin code | Secrets in config → Dependency chain → CI/CD → LLM/prompt injection → Code vulns |
| **Library/SDK** | Public API surface, dependency tree | Dependency chain → Secrets in tests/ci → Code vulns → Config |

## Changelog

- **2026-05-29:** Initial schema based on gstack pattern mining + benchmark results (semble 59% token reduction validated)
