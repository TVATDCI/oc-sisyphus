# Plan: Extract Best Practices from AGENTS Repository (v2 MVP)

**Goal:** Systematically extract and integrate the highest-value patterns from `/home/vladi/AGENTS` (github.com/m3tam3re/AGENTS) into our Sisyphus v2.1 system.

**Date:** 2026-05-08
**Status:** Complete — All criteria met after remediation (2026-05-31). Oracle control gate: PASS (with 4 criteria corrected from FAIL → PASS). `<script load-rules.sh>` automated rule loading replaces instructional Step 0. 38 skills validate clean (39 PASS, 5 WARN, 0 FAIL). Regression gate wired and passing.

---

## Discovery Summary

### What AGENTS Does Well (that we want)
1. **Rules system** — Language-specific + concern-specific conventions, consumed during execution
2. **Validation scripts** — `test-skill.sh` for testing skills before deployment
3. **Skill-creator methodology** — Well-documented pattern for creating new skills
4. **Git workflow** — Conventional commits, agent identity, branch strategy

### What AGENTS Does That We Don't Need (scope creep)
- Full GSD framework (67 workflows, 19 agents, pi-gsd-tools CLI)
- Nix deployment (flake.nix, home-manager)
- 6-agent pantheon (Chiron, Athena, Apollo, Hermes, etc.)
- Personal productivity (PARA, GTD, Obsidian)
- Harness-agnostic agent definitions (TOML + renderer)

### What's Already Integrated
- ✅ Deviation Rules 1-4 (from GSD executor)
- ✅ Checkpoint Protocol (from GSD)
- ✅ TDD strict enforcement
- ✅ Rules directory structure (languages/ + concerns/)
- ✅ Git workflow basics

---

## Phase 1: Rules Adaptation (Week 1)

### Goal
Make the rules system fully functional and useful by adapting AGENTS patterns.

### Key Principles
- **Adapt, don't copy verbatim** — Paraphrase AGENTS rules into our voice
- **Attribute source** — Add provenance note: "Inspired by AGENTS (github.com/m3tam3re/AGENTS)"
- **No licensing risk** — AGENTS has no repo-wide LICENSE; README says "use as inspiration"

### Tasks

#### 1.1 Enrich Existing Rules
For each existing rule file, read AGENTS equivalent and adapt:

| Our File | AGENTS Source | Action |
|----------|--------------|--------|
| `rules/languages/typescript.md` | `rules/languages/typescript.md` | Add strict mode guidance, framework patterns |
| `rules/languages/python.md` | `rules/languages/python.md` | Add ruff/pyright examples, test patterns |
| `rules/languages/shell.md` | `rules/languages/shell.md` | Add common patterns (trap, colors, logging) |
| `rules/languages/nix.md` | `rules/languages/nix.md` | Already exists — verify completeness |
| `rules/concerns/tdd.md` | `rules/concerns/tdd.md` | Already strict — verify alignment with tdd-executor |
| `rules/concerns/testing.md` | `rules/concerns/testing.md` | Add more Arrange-Act-Assert examples |
| `rules/concerns/git-workflow.md` | `rules/concerns/git-workflow.md` | Already exists — verify agent identity fix |
| `rules/concerns/naming.md` | `rules/concerns/naming.md` | Already exists — verify cross-language consistency |

**Process for each file:**
1. Read AGENTS source
2. Identify valuable patterns not in our version
3. Adapt into our voice (paraphrase, don't copy)
4. Add provenance note at top: "Inspired by AGENTS (github.com/m3tam3re/AGENTS)"
5. Validate our version is self-contained

#### 1.2 Create Missing Rules
- `rules/concerns/documentation.md` — Docstring standards, comment quality, README structure
- `rules/concerns/project-structure.md` — Directory conventions, file organization, responsibility boundaries

**Process:**
1. Read AGENTS equivalents
2. Adapt to our typical projects (Node.js/TypeScript focused)
3. Add provenance note
4. Add loading trigger to wave-executor Step 0

#### 1.3 Make wave-executor Step 0 Actually Load Rules
**Current state:** Step 0 exists in wave-executor but is advisory
**Fix needed:**
- After detecting project type, actually READ the rule files
- Inject loaded rules into agent context
- Follow as hard constraints during execution
- If rule causes deviation from plan, document it

**Loading triggers (already in wave-executor):**
- `package.json` → `rules/languages/typescript.md`
- `requirements.txt` → `rules/languages/python.md`
- `jest.config.*` → `rules/concerns/testing.md`
- `tdd: true` task → `rules/concerns/tdd.md`
- `.git` → `rules/concerns/git-workflow.md`

**Add:**
- `README.md` with doc sections → `rules/concerns/documentation.md`
- Complex directory structure → `rules/concerns/project-structure.md`

#### 1.4 Test Rule Loading
**Smoke test:**
1. Pick a project with `package.json` (e.g., img-upload-with-multer)
2. Run wave-executor mentally (or actually if safe)
3. Verify: TypeScript rules loaded, testing rules loaded, git rules loaded
4. Check: Agent follows loaded rules during execution

**Evidence:**
- Rule files present and substantive
- wave-executor Step 0 actively loads and applies rules
- Agent follows loaded rules in next execution

---

## Phase 2: Validation Integration (Week 1-2)

### Goal
Ensure all skills are validated before deployment, reusing existing validation code.

### Key Principles
- **Reuse existing code** — `skill-creator/scripts/quick_validate.py` already exists
- **Thin wrapper** — Don't create new validation logic, just invoke existing
- **skill-creator calls it** — Validation runs automatically after skill creation

### Tasks

#### 2.1 Create Thin Validation Wrapper
**Create:** `scripts/validate-skills.sh`
```bash
#!/usr/bin/env bash
# Thin wrapper around existing validation
# Usage: ./validate-skills.sh [skill-name | --all]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="${HOME}/.config/opencode/skills"
VALIDATOR="${SKILLS_DIR}/skill-creator/scripts/quick_validate.py"

# If no args, validate all skills
# If skill name, validate that skill
# If --all, validate all skills
```

**What it does:**
1. Check SKILL.md exists
2. Check YAML frontmatter (name, description, compatibility)
3. Check no forbidden files inside skill dir (README.md, CHANGELOG.md)
4. Warn if skill >500 lines (skill-creator guidance)
5. Report PASS/WARN/FAIL per skill

#### 2.2 Integrate into skill-creator
**Update `skill-creator/SKILL.md`:**
- After creating a new skill, automatically run validation
- If validation fails, guide user to fix issues
- Don't allow "done" until validation passes

**Update `skill-creator/scripts/init_skill.py`:**
- After scaffolding, call `quick_validate.py` on new skill
- Report results to user
- Block further steps if validation fails

#### 2.3 Document Validation
**Add to SYSTEM-OVERVIEW.md:**
- Validation is part of skill lifecycle
- Run before deploying new skills
- Run periodically to catch drift

**Evidence:**
- `scripts/validate-skills.sh` runs and reports dynamic totals (not hardcoded)
- skill-creator enforces validation before completion
- All existing skills pass validation

---

## Phase 3: Smoke Test + Documentation (Week 2)

### Goal
Verify integration works end-to-end, then document what we took from AGENTS.

### Key Principles
- **Use existing repo** — Don't create imaginary test project
- **Realistic success criteria** — Respect explicit approval gates
- **v2.1.1 not v2.2** — Core workflow unchanged, just additions
- **Concise docs** — Don't over-document

### Tasks

#### 3.1 Smoke Test on Existing Repo
**Use:** `img-upload-with-multer` or any small existing project

**Test:**
1. Run `wave-executor` on one slice
2. Verify Step 0 loads rules (TypeScript, testing, git)
3. Verify agent follows loaded rules during execution
4. Verify validation script runs on all skills

**Success criteria:**
- Rules load correctly for the project type
- Agent behavior reflects loaded rules
- No regressions in existing workflow
- Explicit approval gates still work (not bypassed)

#### 3.2 Update SYSTEM-OVERVIEW.md to v2.1.1
**Changes to document:**
- Rules system added (languages/ + concerns/)
- 3 new skills (tdd-executor, regression-gate, workflow-guard)
- Validation pipeline (scripts/validate-skills.sh)
- Step 0 in wave-executor loads project rules

**Version history:**
- v2.1: Dual Momus gates, phase-specific skills, real-world validation
- v2.1.1: Rules system, validation pipeline, 3 execution-supporting skills

#### 3.3 Create Provenance Note
**Create:** `.sisyphus/notepads/agents-extraction.md`

```markdown
# AGENTS Best Practices Extraction

**Date:** 2026-05-08
**Source:** github.com/m3tam3re/AGENTS

## What We Took
1. Rules system pattern (languages/ + concerns/ directories)
2. Validation script pattern (test-skill.sh → validate-skills.sh)
3. TDD strict enforcement language
4. Git workflow conventions (conventional commits)
5. Deviation rules pattern (GSD executor)
6. Checkpoint protocol (GSD)

## What We Adapted
- Rules paraphrased, not copied verbatim
- Agent format: OpenCode-specific .md (not AGENTS TOML)
- No Nix deployment
- No GSD framework

## What We Skipped
- Full GSD framework (67 workflows)
- 6-agent pantheon (Chiron, Athena, etc.)
- Nix flake deployment
- Personal productivity (PARA, Obsidian)
- Harness-agnostic agent definitions

## Attribution
"Inspired by AGENTS (github.com/m3tam3re/AGENTS)."
AGENTS README states patterns are for inspiration; no repo-wide LICENSE found.
```

#### 3.4 Quick Reference Update
**Update:** Any cross-references that mention AGENTS patterns
- Add note in skill-creator: "See rules/ for coding conventions"
- Add note in wave-executor: "Rules loaded automatically in Step 0"
- Keep it minimal — no full migration guide needed

**Evidence:**
- Smoke test passes on real project
- SYSTEM-OVERVIEW.md updated to v2.1.1
- Provenance note exists
- No doc sprawl

---

## What We Dropped (from original 6-phase plan)

| Original Phase | Why Dropped |
|---------------|-------------|
| Phase 2: More agent definitions | `oh-my-openagent.json` already handles routing; more `.md` files = dead config |
| Phase 5: Advanced patterns | Auto-mode already exists, context warnings already exist, "state CLI" unproven |
| v2.2 version bump | Core workflow (7 phases, gates, 3-artifact chain) unchanged — this is v2.1.1 |
| INDEX.md + migration guide | Over-documentation; SYSTEM-OVERVIEW + provenance note sufficient |
| Integration test on "calculator API" | Use existing repo instead |

---

## Success Criteria

- [ ] All rule files adapted from AGENTS with provenance notes
- [ ] wave-executor Step 0 actively loads rules for detected project type
- [ ] `scripts/validate-skills.sh` exists and runs (thin wrapper)
- [ ] skill-creator calls validation after creating new skill
- [ ] Smoke test on existing repo: rules load, agent follows them
- [ ] SYSTEM-OVERVIEW.md updated to v2.1.1
- [ ] Provenance note exists
- [ ] No regressions in existing 7-phase workflow
- [ ] All 27 skills still validate clean

## Anti-Patterns (actively avoiding)

- ❌ Copying AGENTS verbatim (license risk)
- ❌ Adding dead agent config (oh-my-openagent.json already handles routing)
- ❌ Creating imaginary test projects
- ❌ Over-documenting (INDEX.md, migration guide)
- ❌ Version bump inflation (v2.2 when it's really v2.1.1)
- ❌ Adding complexity without proven pain (state CLI, auto-mode that already exists)

## Effort Estimate

- Phase 1: 3-4 hours (rule adaptation + loading)
- Phase 2: 2-3 hours (validation wrapper + integration)
- Phase 3: 2-3 hours (smoke test + docs)

**Total: ~7-10 hours over 1-2 weeks**

## Next Action

**User approval** → Begin Phase 1
