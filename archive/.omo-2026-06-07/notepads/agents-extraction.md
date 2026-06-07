# AGENTS Best Practices Extraction

**Date:** 2026-05-08
**Source:** github.com/m3tam3re/AGENTS
**Status:** Complete (3-phase MVP)

---

## What We Took

1. **Rules system pattern** — Language-specific (`languages/`) + concern-specific (`concerns/`) directories, consumed during execution
2. **Validation script pattern** — `test-skill.sh` → `validate-skills.sh` (thin wrapper)
3. **TDD strict enforcement language** — RED-GREEN-REFACTOR, 1-2 commits, no regressions
4. **Git workflow conventions** — Conventional commits, agent identity
5. **Deviation rules pattern** — GSD executor rules adapted for wave-executor
6. **Checkpoint protocol** — 3 types (auto-mode, manual, state CLI) from GSD
7. **Analysis Paralysis Guard** — Timebox decisions, escalate instead of looping

---

## What We Adapted

- Rules paraphrased into our voice, not copied verbatim (license safety)
- Agent format: OpenCode-specific `.md` with YAML frontmatter (not AGENTS TOML)
- Validation integrated into `skill-creator` workflow, not standalone script only
- Rule loading is automatic in `wave-executor` Step 0, not manual
- No Nix deployment, no 6-agent pantheon, no GSD framework

---

## What We Skipped

- Full GSD framework (67 workflows, 19 agents)
- 6-agent pantheon (Chiron, Athena, Apollo, Hermes, etc.)
- Nix flake deployment
- Personal productivity (PARA, GTD, Obsidian)
- Harness-agnostic agent definitions (TOML + renderer)
- State CLI integration (unproven value)

---

## Files Created / Modified

| File | Action | Notes |
|------|--------|-------|
| `rules/languages/typescript.md` | Enriched | Strict mode, modern TS patterns |
| `rules/languages/python.md` | Enriched | Ruff/pyright idioms |
| `rules/concerns/testing.md` | Enriched | AAA pattern, mocking philosophy |
| `rules/concerns/documentation.md` | Created | Docstring standards, README structure |
| `rules/concerns/project-structure.md` | Created | Directory conventions |
| `skills/wave-executor/SKILL.md` | Updated | Step 0 rule loading, Analysis Paralysis Guard |
| `skills/tdd-executor/SKILL.md` | Created | RED-GREEN-REFACTOR |
| `skills/regression-gate/SKILL.md` | Created | Cross-wave regression testing |
| `skills/workflow-guard/SKILL.md` | Created | Advisory untracked edit detection |
| `skills/skill-creator/SKILL.md` | Updated | Validation step added |
| `scripts/validate-skills.sh` | Created | Thin wrapper (24 PASS, 3 WARN, 0 FAIL) |
| `agents/oracle.md` | Created | OpenCode format with YAML frontmatter |
| `SYSTEM-OVERVIEW.md` | Updated | v2.1.1 |

---

## Attribution

"Inspired by AGENTS (github.com/m3tam3re/AGENTS)."

AGENTS README states patterns are for inspiration; no repo-wide LICENSE found.

---

## Validation

- All 27 skills + 4 agents pass validation (28 PASS, 3 WARN line count, 0 FAIL)
- All 11 rule files have provenance notes
- Smoke test: wave-executor Step 0 loads rules for detected project type
- Agent behavioral proof: spawned agent with loaded rules, produced compliant code (no `any`, no `var`, AAA tests, JSDoc), zero deviations
- `init_skill.py` auto-runs validation after scaffolding
- Oracle control gate: **9 PASS / 0 WARNING / 0 FAIL**
- Real-world test: club-de-typography project — full governance, approval gates, correct model selection
- **Overall verdict: v2.1.1 test SUCCESS.**
- No regressions in 7-phase workflow
