---
name: reference-checker
description: "Mechanical verification gate that scans .sisyphus/ directories for existing artifacts before creating new ones. Use when: (1) planning workflow needs to verify no conflicts exist, (2) creating PRDs/plans/issues and need to check for duplicates, (3) sisyphus-plan Checkpoint 2 or any 'verify before creating' step. Triggers: check references, reference check, scan plans, find conflicts, check existing, verify before creating, C3 check, reference gate."
compatibility: opencode
triggers:
  - "check references"
  - "reference check"
  - "scan plans"
  - "find conflicts"
  - "check existing"
  - "verify before creating"
  - "C3 check"
  - "reference gate"
mode: automatic
inputs:
  - "artifact name (required) — the plan/PRD/issue name being created"
  - "artifact type (required) — prd | plan | notepad | issue"
  - "project_root (optional) — defaults to ~/Main-vault"
outputs:
  - "Verification report with PASS / WARNING / FAIL decision"
  - "List of existing artifacts that conflict or relate"
produces_artifacts:
  - ".sisyphus/notepads/{plan-name}/reference-check-{timestamp}.md"
requires_artifacts:
  - "None — scans directories fresh each time"
gates:
  - "Gate decision: FAIL blocks creation until conflicts resolved"
  - "Gate decision: WARNING reports related work, user decides"
  - "Gate decision: PASS — no conflicts, proceed with creation"
metadata:
  version: 1.0.0
  category: verification
  complexity: simple
---

# Reference Checker

A mechanical verification skill for the "verify before creating" gate. Scans `.sisyphus/` directories, detects naming conflicts, reports related artifacts, and returns a gate decision. Optimized for cheap models — no reasoning required, just follow the checklist.

## Skill Usage

This skill is loaded via `load_skills` into category-routed tasks:

```typescript
task(
  category="unspecified-low",  // or "quick" for fast mechanical tasks
  load_skills=["reference-checker"],
  prompt="Check for conflicts before creating plan: {slug}"
)
```

**Category routing:** The framework automatically selects an appropriate cheap/fast model. Do not micromanage subagent model selection.

**For all models executing this skill:**
- Follow the **exact steps** — do not skip sections
- Use `ls` and `grep` tools, not reasoning
- If directory doesn't exist, report it explicitly
- Do not invent file names — only report what actually exists
- **Cost note:** This is a mechanical verification task. If your execution costs are high, the category routing may be selecting an expensive model. Verify via `oh-my-openagent.json` category config.

## Core Workflow: Reference Verification

**Trigger:** "check references", "reference check", "scan plans", "find conflicts", "check existing", "verify before creating", "C3 check", "reference gate"

**Input Requirements:**
- `artifact_name` (required) — the name/slug being created (e.g., "dark-mode-toggle", "auto-feed-v3")
- `artifact_type` (required) — one of: `prd`, `plan`, `notepad`, `issue`
- `project_root` (optional) — defaults to `~/Main-vault`

**When to use:**
- Checkpoint 2: Before creating PRD — verify no existing PRD with same/similar name
- Checkpoint 2: Before creating plan — verify no existing plan with same/similar name
- Before creating notepad directory — verify doesn't exist (or is expected)
- Before creating beads issue — verify no duplicate issue titles
- Any workflow Step 0 that says "Reference check (required)"

**Steps:**

### Step 1: Scan Directories

Scan ALL `.sisyphus/` directories regardless of `artifact_type`. Conflicts can exist across directories (e.g., a PRD and a plan with the same name).

**Directories to scan:**
| Directory | File pattern | Purpose |
|-----------|--------------|---------|
| `{project_root}/.sisyphus/prds/` | `*prd.md` | Existing PRDs |
| `{project_root}/.sisyphus/plans/` | `*.md` (excluding templates) | Existing plans |
| `{project_root}/.sisyphus/notepads/` | `*/` (directories) | Existing notepads |
| Beads database | `bd list --open` (if available) | Existing issues |

**Action:** List all existing artifacts across ALL directories.
```bash
ls {project_root}/.sisyphus/prds/ 2>/dev/null || echo "NO_PRDS_DIR"
ls {project_root}/.sisyphus/plans/ 2>/dev/null || echo "NO_PLANS_DIR"
ls {project_root}/.sisyphus/notepads/ 2>/dev/null || echo "NO_NOTEPADS_DIR"
```

**Record:** Exact file names found in each directory (copy the list, do not summarize).

### Step 2: Detect Conflicts

Compare `artifact_name` against each existing file/directory name.

**Conflict types:**

1. **EXACT MATCH** — File name identical to `artifact_name` (with or without `-prd.md` suffix)
   - Example: creating `dark-mode-toggle`, found `dark-mode-toggle-prd.md` or `dark-mode-toggle.md`
   - **Severity: FAIL**

2. **SIMILAR NAME** — File name contains >50% of `artifact_name` words, or `artifact_name` contains >50% of file name words
   - Example: creating `dark-mode`, found `dark-mode-toggle-prd.md`
   - Example: creating `auto-feed-v3`, found `auto-feed-v2.md`
   - **Severity: WARNING**

3. **SAME TOPIC** — File content (read first 20 lines) mentions same concepts as artifact
   - Example: creating `theme-toggle`, found PRD about "dashboard theming"
   - **Severity: WARNING** (requires content scan)

4. **NO CONFLICT** — No matching or similar names found
   - **Severity: PASS**

**Rules:**
- Ignore template files (`*template*`, `*example*`)
- Ignore archived evidence files (in `.sisyphus/evidence/`)
- For notepads: check directory names, not files inside
- For issues: if beads not available, skip issue check and note "beads unavailable"

### Step 3: Generate Report

Create verification report at `.sisyphus/notepads/{artifact_name}/reference-check-{YYYY-MM-DD}.md`

**Report structure:**
```markdown
# Reference Check: {artifact_name} ({artifact_type})
**Date:** {YYYY-MM-DD}
**Project root:** {project_root}
**Artifact being created:** {artifact_name}.{extension}

## Scanned Directories
- [ ] `.sisyphus/prds/` — {n} files found
- [ ] `.sisyphus/plans/` — {n} files found
- [ ] `.sisyphus/notepads/` — {n} directories found
- [ ] Beads issues — {n} open issues (or "skipped — beads unavailable")

## Findings

### Exact Conflicts (FAIL)
{list or "None found"}

### Similar Names (WARNING)
{list with explanation of similarity or "None found"}

### Related Content (WARNING)
{list with topic overlap or "None found"}

## Gate Decision

**{PASS / WARNING / FAIL}**

### If FAIL:
Cannot create `{artifact_name}` — exact conflict(s) found:
- {file path}

**Action required:** Rename artifact, overwrite with confirmation, or branch (e.g., `{artifact_name}-v2`).

### If WARNING:
Related work found — review before creating:
- {file path} — {reason}

**Action:** Proceed with caution, or ask user "Found related work — create anyway, merge, or branch?"

### If PASS:
No conflicts found. Safe to create `{artifact_name}`.
```

### Step 4: Return Gate Decision

Return a **machine-readable gate decision** that the orchestrator can consume automatically.

**Required output format (strict):**
```json
{
  "decision": "PASS" | "WARNING" | "FAIL",
  "artifact_path": "{artifact_name}",
  "summary": "{one-line human-readable summary}",
  "blockers": [
    {
      "id": "C-1",
      "severity": "CRITICAL" | "MAJOR" | "MINOR",
      "category": "Exact Conflict" | "Similar Name" | "Related Content",
      "title": "{conflict description}",
      "fix": "{specific resolution: rename, overwrite, or branch}"
    }
  ],
  "next_action": "proceed" | "fix_then_recheck" | "user_decision"
}
```

**Blockers array rules:**
- PASS: empty array `[]`
- WARNING: may include similar/related findings with caution notes
- FAIL: must include all exact conflicts preventing creation

## Gate Behavior

This skill acts as a **mandatory verification gate**:

| Gate Decision | Orchestrator Action | User Action |
|--------------|---------------------|-------------|
| PASS | Proceed with creation | None |
| WARNING | Proceed with caution, log related work | Acknowledge or decide merge/branch |
| FAIL | STOP. Do not create. Resolve conflict first. | Rename, overwrite, or branch |

## Integration with Other Skills

This skill is the mechanical verification gate (Checkpoint 2) in the planning workflow:

```
User: "check references" / "verify before creating"
  ↓
reference-checker (scans directories)
  ↓
Branch: PASS (proceed) / WARNING (user decides) / FAIL (stop)
```

**Input from:**
- `sisyphus-plan`: Checkpoint 2 trigger before creating PRD/plan
- `brief-loader`: Validation before loading brief
- User: "check references", "verify before creating"

**Output to:**
- `sisyphus-plan`: PASS allows creation to proceed
- `prd-writer`: Cleared to create PRD (no conflicts)
- `plan-writer`: Cleared to create plan (no conflicts)

**Integration in sisyphus-plan workflow:**

**Workflow 1b (PRD Creation) — Step 0:**
```
Step 0: Reference check (required — delegated to reference-checker)
  → Input: artifact_name = {PRD slug}, artifact_type = "prd"
  → Gate: [[DELEGATE: reference-checker]]
  → Output: PASS / WARNING / FAIL
  → If FAIL: STOP. Resolve conflicts before drafting PRD.
  → If WARNING: Log related PRDs, ask user "reuse, overwrite, or branch?"
  → If PASS: Proceed to draft PRD.
```

**Workflow 1c (Issue Creation) — Step 0:**
```
Step 0: Reference Verification (mandatory pre-creation gate)
  → Input: artifact_name = {PRD slug}, artifact_type = "plan"
  → Gate: [[DELEGATE: reference-checker]]
  → Output: PASS / WARNING / FAIL
  → If FAIL: STOP. Resolve conflicts before creating issues.
  → If WARNING: Log related plans, ask user "carry over or start fresh?"
  → If PASS: Proceed to create issues.
```

**When to use vs other skills:**
- Use **reference-checker** for mechanical "does this exist?" checks
- Use **momus-prd-reviewer** or **momus-plan-reviewer** for deep quality analysis of existing artifacts
- Use **sisyphus-plan** for workflow unspecified-high (calls this skill at Checkpoint 2)

## Tool Usage

- **Bash tools**: `ls`, `grep`, `wc` for directory scanning and pattern matching
- **Read tools**: Read first 20 lines of potentially related files (for content overlap)
- **Write tools**: Create verification report in notepads directory
- **Task tool**: NEVER delegate — this skill IS the verification step

## Boundaries

- **Do NOT create or modify artifacts** — this is verification only
- **Do NOT delete files** — report conflicts, let orchestrator decide
- **Do NOT conduct deep analysis** — surface-level name matching and first-20-lines scan only
- **Do NOT ask user questions** — return gate decision, let orchestrator handle user interaction

## Examples

### Example 1: PASS — Empty Directory
```
User: "Check references for 'ai-hero-integration' PRD"

Agent loads reference-checker skill:
1. Scan `.sisyphus/prds/`: ls returns "NO_PRDS_DIR" (or empty)
2. Detect conflicts: No files found → PASS
3. Write report: "No conflicts found. Safe to create ai-hero-integration."
4. Return: PASS
```

### Example 2: WARNING — Similar Name
```
User: "Check references for 'dark-mode' plan"

Agent loads reference-checker skill:
1. Scan `.sisyphus/plans/`: found 4 files:
   - dark-mode-toggle.md
   - vault-web-dashboard.md
   - sisyphus-plan-optimization.md
   - reference-checker.md
2. Detect conflicts:
   - dark-mode-toggle.md: SIMILAR ("dark-mode" is 2/3 words of "dark-mode-toggle")
   - Others: NO CONFLICT
3. Write report with WARNING: "Similar plan found: dark-mode-toggle.md"
4. Return: WARNING — "Found related plan dark-mode-toggle.md. Proceed with caution."
```

### Example 3: FAIL — Exact Conflict
```
User: "Check references for 'auto-feed-v3' plan"

Agent loads reference-checker skill:
1. Scan `.sisyphus/plans/`: found 3 files:
   - auto-feed-v3.md
   - auto-feed-v2.md
   - dashboard-enhancement.md
2. Detect conflicts:
   - auto-feed-v3.md: EXACT MATCH → FAIL
3. Write report with FAIL: "Exact conflict: auto-feed-v3.md already exists"
4. Return: FAIL — "Cannot create auto-feed-v3 — plan already exists. Rename, overwrite, or branch."
```

### Example 4: Checkpoint Gate — Auto-invoked
```
Orchestrator begins Workflow 1b (PRD creation):
- Step 0: Delegates to reference-checker
- Input: artifact_name="course-gamification", artifact_type="prd"
- reference-checker scans, finds `course-gamification-prd.md` (EXACT MATCH)
- Returns: FAIL
- Orchestrator stops: "PRD creation blocked — existing PRD found. User, overwrite or branch?"
```

## Edge Cases

| Error | Action |
|-------|--------|
| `.sisyphus/` directory doesn't exist | PASS with note — no artifacts means no conflicts. Recommend initializing `.sisyphus/` structure. |
| No read permission on `.sisyphus/` | FAIL — cannot verify, unsafe to proceed. Report permission error. |
| Beads not installed | Skip issue check, note "beads unavailable" in report. Continue with directory checks only. |
| Empty artifact_name | FAIL — cannot check references without a name. Ask orchestrator for artifact_name. |
| Invalid artifact_type | FAIL — must be one of: prd, plan, notepad, issue. Report invalid type. |
| 100+ files in directory | Scan all — this is mechanical, not reasoning. List all files in report appendix. |
| Unicode/special characters in names | Match exact bytes — do not normalize or transliterate. |

## Cost Monitoring & Escape Hatch

**Target cost:** ≤€0.01 per verification (mechanical directory scanning).

**If costs exceed target:**
1. Check `oh-my-openagent.json` — verify `unspecified-low` category routes to cheapest model
2. If category fallback chain selects expensive model, report: "Cost drift detected: {model} used for verification. Consider tuning category config."
3. **Escape hatch (only if benchmarked drift >20% over 10+ tasks):**
   - Create custom `verification` category in `oh-my-openagent.json`
   - Route: `opencode/glm-5.1` → `opencode/gpt-5.4-mini` → `opencode/claude-haiku-4-5`
   - Use only for reference-checker tasks, not general `unspecified-low`

**Do not activate escape hatch without evidence.** Category routing is usually correct; manual overrides create brittleness.

## Scoring Reference

For skill validation, a good reference-check scores high on:
- **Completeness**: All 4 directories checked (prds, plans, notepads, issues)
- **Accuracy**: Exact matches actually identical, similar names plausibly related
- **Honesty**: Reports "None found" when appropriate (no invented conflicts)
- **Speed**: Uses `ls` + `grep`, not reading full file contents
- **Gate enforcement**: Actually returns FAIL when conflicts exist (doesn't soften to WARNING)
