---
name: ui-auditor
description: "Post-execution UI/UX validation gate that checks implementation against DESIGN.md sections 10-14. (1) Use after wave-executor completes and before merge or handoff. (2) Use to validate CSS architecture, accessibility, performance budget, and theme system compliance. (3) Use to verify that website-analyzer detections were actually addressed in code (no regressions). Triggers: 'audit UI', 'UI review', 'check implementation against design', 'validate CSS', 'accessibility audit', 'theme system check', 'post-execution validation', 'UI quality gate', 'verify DESIGN.md compliance', 'check CSS architecture', 'pre-merge UI check'. Returns PASS/WARNING/FAIL gate decision. Not for: initial design extraction (use website-analyzer), logical or architectural review (use momus-reviewer), or security review (use security-auditor)."
compatibility: opencode
triggers:
  - "audit UI"
  - "UI review"
  - "check implementation against design"
  - "validate CSS"
  - "accessibility audit"
  - "theme system check"
  - "post-execution validation"
  - "UI quality gate"
  - "verify DESIGN.md compliance"
mode: automatic
inputs:
  - "DESIGN.md path (required) — must contain sections 10-14"
  - "Source code directory (required) — implementation to validate"
  - "tech-detections.json (optional) — website-analyzer v1.1.0 output"
outputs:
  - "Gate decision JSON — machine-readable PASS / WARNING / FAIL"
  - "Human-readable audit report — violation details with locations"
produces_artifacts:
  - ".sisyphus/notepads/{plan-name}/ui-audit-{timestamp}.json"
  - ".sisyphus/notepads/{plan-name}/ui-audit-report-{timestamp}.md"
requires_artifacts:
  - "DESIGN.md with sections 10-14 (required)"
  - "Source code files to audit (required)"
gates:
  - "Gate decision: FAIL blocks merge/handoff until fixed"
  - "Gate decision: WARNING requires acknowledgment"
  - "Gate decision: PASS allows merge/handoff to proceed"
metadata:
  version: 1.0.0
  category: review
  complexity: advanced
---

# UI Auditor

A standalone post-execution quality gate that validates implementation code against DESIGN.md sections 10-14. Catches CSS architecture violations, accessibility gaps, performance issues, and theme system defects that website-analyzer detected at analysis phase but may have been missed during implementation.

## Identity & Scope

**Purpose:** Post-execution UI/UX validation gate that validates implementation against [[website-analyzer]] DESIGN.md sections 10-14.
**Triggers:** "audit UI", "UI review", "check implementation against design", "validate CSS", "accessibility audit", "theme system check", "post-execution validation", "UI quality gate", "verify DESIGN.md compliance"
**Validates:** CSS Architecture, Accessibility, Browser Support, Performance Budget, Risk Assessment
**Not For:**
- Initial design extraction (use [[website-analyzer]] instead)
- Architectural/logical review (use [[momus-reviewer]])
- Security review (use [[security-auditor]])
- Functional testing (use wave-executor + test framework)

**Entry Criteria:**
- [ ] DESIGN.md exists with sections 10-14 (CSS Architecture, Accessibility, Browser Support, Performance Budget, Risk Assessment)
- [ ] Source code directory provided and readable
- [ ] Checkpoint: After wave-executor completes, before plan-closer or merge

**Produces:**
- Machine-readable gate decision JSON at `.sisyphus/notepads/{plan-name}/ui-audit-{YYYY-MM-DD}.json`
- Human-readable audit report at `.sisyphus/notepads/{plan-name}/ui-audit-report-{YYYY-MM-DD}.md`

**Next if Approved:**
- PASS → Delegate to `plan-closer` for handoff, or proceed to merge
- WARNING → Proceed with caution notes attached to handoff

**Next if Rejected:**
- FAIL → Return to `wave-executor` for fixes, then re-invoke `ui-auditor`

**Skill Usage:**
```typescript
task(
  category="deep",
  load_skills=["ui-auditor"],
  prompt="Audit UI implementation at src/ against DESIGN.md at .sisyphus/analysis/{name}/DESIGN.md"
)
```

**For all models executing this skill:**
- Follow checklists mechanically — do not skip categories
- Apply evidence-based analysis — every violation must have file location and code snippet
- If a category passes, explicitly state "No violations found in [category]"
- Do not invent violations — report honestly
- Use deterministic grep/AST tools first, LLM interpretation second

## Hard Constraints (NEVER/MUST)

- **No invented violations** — report only what patterns confirm; "No violations found in [category]" when nothing found
- **Evidence required per finding** — every violation MUST cite file path, line number, and code snippet
- **All 5 categories must be checked** — CSS Architecture, Accessibility, Browser Support, Performance Budget, Risk Assessment (sections 10-14)
- **DESIGN.md sections 10-14 are the validation baseline** — do not invent other categories
- **Deterministic detection first, LLM second** — use grep/AST before reasoning
- **Exclude false positives** — test files, fixtures, generated code, vendor code
- **Tech-detection context** — if tech-detections.json provided, validate expected detection counts (e.g., "should be 5 CSS files using tokens")
- **Gate decision is OUTPUT, not self-executing** — FAIL blocks merge/handoff but does not auto-merge
- **Boundary: read-only validation** — do NOT modify code, deploy, or trigger CI
- **Boundary: depends on website-analyzer output** — without DESIGN.md sections 10-14, this skill cannot run
- **Do NOT create or update PRDs** — report findings, let orchestrator fix
- **Do NOT create beads issues** — gate decision is the output
- **Do NOT flag false positives** — apply false positive rules from Step 2

## Core Workflow (Summary)

The 5-step validation pipeline — see `## Detailed Steps` below for per-step procedures.
1. **Step 0: Load Spec & Implementation** — Read DESIGN.md (sections 10-14), tech-detections.json (optional), list source files
2. **Step 1: Run Deterministic Detection Pass** — Extract violations without LLM: CSS Architecture (A1-A6), Accessibility (B1-B4), Performance (C1-C4), Theme System (D1-D5)
3. **Step 2: Contextual Verification** — Verify candidates against DESIGN.md spec; classify as violation or false positive
4. **Step 3: Categorize Violations** — Classify by category (A-D) and severity (CRITICAL/MAJOR/MINOR); map to pi-2 known issues
5. **Step 4: Write Gate Decision** — Generate JSON + MD report with Summary/Detailed Findings/Fix Recommendations; return machine-readable gate decision

## Tool Usage

- **Read tools**: Read DESIGN.md, source files, tech-detections.json
- **Grep tools**: PRIMARY detection method (regex, fixed-string) for all 5 categories
- **Bash tools**: Run detection scripts, count violations
- **Write tools**: Create audit JSON + MD report in notepads
- **Task tool**: NEVER delegate — this skill IS the auditor; detection happens in this context

## Boundaries

- **Do NOT modify code** — read-only validation
- **Do NOT auto-merge or trigger CI** — gate decision is output, not self-executing
- **Do NOT skip categories** — even if "no obvious violations"
- **Do NOT validate without DESIGN.md** — sections 10-14 are required input
- **Do NOT conduct open-ended research** — validate only the provided source directory

## Integration with Other Skills

- **[[website-analyzer]]**: Produces the DESIGN.md sections 10-14 that this skill validates against
- **[[momus-reviewer]]**: Reviews PRDs/plans (logical/architectural); complementary
- **[[security-auditor]]**: Reviews code for security vulns; complementary
- **wave-executor**: Implements slices; ui-auditor runs after wave-executor, before plan-closer
- **plan-closer**: Triggered by PASS decision

## Gate Behavior

| Gate Decision | Orchestrator Action | User Action |
|--------------|---------------------|-------------|
| PASS | Proceed to merge/handoff via plan-closer | None |
| WARNING | Proceed with caution notes | Review findings |
| FAIL | STOP merge/handoff; return to wave-executor | Approve fixes, re-audit |

## Calibration Notes

### Detection Accuracy (Calibrated on pi-2-test-clone)

| Detection | True Positives | False Positives | Notes |
|-----------|---------------|-----------------|-------|
| !important | 3 | 0 | All legitimate in `@layer overrides` |
| Unthrottled handlers | 2 | 0 | Original codebase had violations; current is fixed |
| Hardcoded colors | Minimal | 0 | Strong token compliance |
| Layout animations | 0 | 0 | Uses transform/opacity correctly |
| Z-index | 5 | 0 | All use CSS variables |
| Focus-visible | 4 | 0 | Properly implemented |
| Reduced motion | 1 | 0 | Present and correct |
| Color Module L5 | 20+ | 0 | Fallback present |
| CSS Layers | 8 | 0 | Properly ordered |
| Theme system | 3 modes | 0 | Section themes detected |

### Known Limitations

1. **JS runtime issues**: `localStorage` errors, async races not statically detectable. Pair with `security-auditor` for these.
2. **Font licensing**: Requires legal knowledge, not CSS/DOM detectable.
3. **Color contrast**: Estimated from tokens only; low confidence for CSS variable chains.
4. **ARIA correctness**: Detects `role` presence but not semantic correctness.

### Tuning Parameters

| Parameter | Default | When to Adjust |
|-----------|---------|----------------|
| `hardcoded_color_threshold` | 0 | Relax to 5 for legacy projects |
| `z_index_ad_hoc_max` | 0 | Allow 2-3 during migration |
| `focus_visible_minimum` | 3 | Increase to 5 with custom inputs |
| `animation_budget_max` | 5 | Reduce to 3 for low-end mobile |
| `layer_required` | true | Set false if not using CSS Layers |

### Version Compatibility

- **website-analyzer v1.1.0**: Full compatibility.
- **website-analyzer v1.0.x**: Sections 10-14 may not exist; best-effort validation against 1-9.
- **DESIGN.md without 10-14**: Warn and reduce coverage.

## Error Handling

| Scenario | Action |
|----------|--------|
| DESIGN.md missing sections 10-14 | WARN: "DESIGN.md lacks sections 10-14. Validation coverage reduced." Run best-effort validation against available sections. |
| Source directory empty or no CSS/JS files | FAIL: "No implementation files found to audit." |
| tech-detections.json mismatches implementation | FLAG: "website-analyzer expected X unthrottled handlers, found 0. Verify code was fixed." |
| grep tools unavailable | Fallback to LLM read of source files with explicit violation checklist. |
| All categories pass | Explicitly return: "No violations found in any category." |

---

## Detailed Steps

**Trigger:** "audit UI", "UI review", "check implementation against design", "validate CSS", "accessibility audit", "theme system check", "post-execution validation", "UI quality gate"

**Input Requirements:**
- DESIGN.md path (required) — `.sisyphus/analysis/{name}/DESIGN.md`
- Source directory (required) — e.g., `src/`
- tech-detections.json (optional) — from website-analyzer v1.1.0

### Step 0: Load Spec & Implementation

1. Read DESIGN.md — extract sections 10-14 as the validation baseline
2. If tech-detections.json provided: read it for expected detection counts
3. List all source files in target directory (CSS, JS, Astro, TS, HTML)

### Step 1: Run Deterministic Detection Pass

Extract factual violations without LLM interpretation. Run all searches in parallel.

#### Detection A: CSS Architecture

```bash
# A1: !important
grep -rnoP '![ ]*important' --include="*.css" --include="*.scss" --include="*.astro" --include="*.js" --include="*.ts" {src_dir} | head -30
# A2: CSS Layers
grep -rnoP '@layer\s+[\w,\s]+' --include="*.css" --include="*.scss" {src_dir}
# A3: Unlayered styles
grep -rnP '^\s*[^/@\s][^{]*\{' --include="*.css" {src_dir} | grep -v '@layer' | head -20
# A4: Hardcoded colors (outside tokens.css)
grep -rnoP '#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsl\([^)]+\)' --include="*.css" --include="*.scss" --include="*.astro" {src_dir} | grep -v 'tokens.css' | grep -v 'var(--' | head -30
# A5: Z-index values
grep -rnoP 'z-index\s*:\s*(-?\d+)' --include="*.css" --include="*.scss" --include="*.astro" --include="*.js" {src_dir}
# A6: Layout property animations
grep -rnoP '(top|left|right|bottom|width|height|margin|padding)\s*:\s*[^;]+transition' --include="*.css" --include="*.scss" {src_dir}
```

#### Detection B: Accessibility

```bash
# B1: Focus-visible
grep -rnoP ':focus-visible' --include="*.css" --include="*.scss" --include="*.astro" {src_dir}
# B2: prefers-reduced-motion
grep -rnoP '@media\s*\(\s*prefers-reduced-motion' --include="*.css" --include="*.scss" {src_dir}
# B3: ARIA roles
grep -rnoP 'role\s*=\s*"[^"]+"' --include="*.astro" --include="*.html" --include="*.jsx" --include="*.tsx" {src_dir} | wc -l
# B4: Semantic landmarks
grep -rnoP '<(header|nav|main|footer|aside|section|article)' --include="*.astro" --include="*.html" --include="*.jsx" {src_dir} | wc -l
```

#### Detection C: Performance

```bash
# C1-C2: Unthrottled scroll/resize handlers
grep -rnoP 'addEventListener\([\'"]scroll[\'"]\s*,\s*[^,]+\)' --include="*.js" --include="*.ts" --include="*.astro" {src_dir}
grep -rnoP 'addEventListener\([\'"]resize[\'"]\s*,\s*[^,]+\)' --include="*.js" --include="*.ts" --include="*.astro" {src_dir}
# C3: requestAnimationFrame nearby (check if throttled)
grep -rnoP 'requestAnimationFrame' --include="*.js" --include="*.ts" --include="*.astro" {src_dir}
# C4: Universal selector transitions
grep -rnoP '\*\s*\{[^}]*transition' --include="*.css" --include="*.scss" {src_dir}
```

#### Detection D: Theme System

```bash
# D1: data-theme usage
grep -rnoP 'data-theme' --include="*.css" --include="*.js" --include="*.ts" --include="*.astro" {src_dir} | wc -l
# D2: CSS Color Module L5
grep -rnoP 'rgb\(\s*from\s+' --include="*.css" --include="*.scss" {src_dir}
# D3: @supports fallback
grep -rnoP '@supports\s+not\s*\(\s*color\s*:\s*rgb\(from' --include="*.css" --include="*.scss" {src_dir}
# D4: Section-level themes
grep -rnoP '\.(dark|light|work|hero)\s*\{[^}]*background|color' --include="*.css" --include="*.scss" {src_dir} | head -20
# D5: Transition strategy
grep -rnoP 'transition.*background-color|transition.*color' --include="*.css" --include="*.scss" {src_dir} | head -20
```

**Step 1 Output:** Raw violation candidates with file paths and line numbers.

### Step 2: Contextual Verification Pass

For each candidate violation, verify against DESIGN.md spec:

1. **Read the violating file** at the identified line
2. **Check if DESIGN.md explicitly allowed it**
   - Example: `.work, .work * { transition: none !important; }` may be in `@layer overrides` per spec
   - Example: `z-index: var(--z-nav)` uses tokens — not a violation
3. **Classify as violation or false positive**

**False Positive Rules:**
- `!important` inside `@layer overrides` → NOT a violation
- `z-index: var(--*)` → NOT a violation (uses tokens)
- Hardcoded colors in `tokens.css` → NOT a violation
- `requestAnimationFrame` within 10 lines of handler → NOT unthrottled
- `:focus` fallback when `:focus-visible` also present → NOT a violation

### Step 3: Categorize Violations

#### Category A: CSS Architecture Violations
**Question:** Does the code violate the CSS architecture specified in DESIGN.md section 10?

Check for:
- [ ] `!important` outside `@layer overrides` or systematic override contexts
- [ ] Missing CSS layers when DESIGN.md specified them
- [ ] Unlayered styles when `@layer` system is required
- [ ] Hardcoded color values when token system is specified
- [ ] Ad-hoc z-index values when systematic scale is specified
- [ ] Layout property animations (top/left/width/height) when transform/opacity is specified

**Violation format:**
```
A-{n}: [Severity] [Title]
- Rule: [DESIGN.md section 10 subsection]
- Location: [file:line]
- Evidence: "[exact code snippet]"
- Spec: "[what DESIGN.md required]"
- Fix: [specific fix]
```

#### Category B: Accessibility Violations
**Question:** Does the code meet the accessibility requirements in DESIGN.md section 11?

Check for:
- [ ] Missing `:focus-visible` styles on interactive elements (buttons, links, tabs)
- [ ] No `prefers-reduced-motion` support when animations exist
- [ ] Missing ARIA roles on custom components (tabs, modals, toggles)
- [ ] No semantic landmark elements (`<nav>`, `<main>`, `<footer>`)
- [ ] Low contrast combinations (if colors are hardcoded and checkable)

**Violation format:**
```
B-{n}: [Severity] [Title]
- Rule: [DESIGN.md section 11 subsection]
- Location: [file:line]
- Evidence: "[exact code snippet]"
- Spec: "[what DESIGN.md required]"
- Fix: [specific fix]
```

#### Category C: Performance Issues
**Question:** Does the code violate performance contracts in DESIGN.md section 13?

Check for:
- [ ] Unthrottled scroll/resize handlers without `requestAnimationFrame`
- [ ] Universal selector `*` transitions (expensive recalc)
- [ ] Layout-triggering animations (width, height, top, left, margin, padding)
- [ ] Excessive simultaneous animations exceeding budget

**Violation format:**
```
C-{n}: [Severity] [Title]
- Rule: [DESIGN.md section 13 subsection]
- Location: [file:line]
- Evidence: "[exact code snippet]"
- Spec: "[what DESIGN.md required]"
- Fix: [specific fix]
```

#### Category D: Theme System Gaps
**Question:** Does the theme system implementation match DESIGN.md section 12/14 requirements?

Check for:
- [ ] CSS Color Module L5 (`rgb(from ...)`) used without `@supports not` fallback
- [ ] Missing section-level theme support when DESIGN.md specifies it (e.g., `.work` always dark)
- [ ] Universal `*` transition strategy when scoped was specified
- [ ] Missing `data-theme` or `prefers-color-scheme` handling
- [ ] No transition strategy for theme changes

**Violation format:**
```
D-{n}: [Severity] [Title]
- Rule: [DESIGN.md section 12/14 subsection]
- Location: [file:line]
- Evidence: "[exact code snippet]"
- Spec: "[what DESIGN.md required]"
- Fix: [specific fix]
```

### Step 4: Synthesize Findings

1. **Count violations by severity:**
   - CRITICAL: Will cause user-facing bugs, accessibility failures, or significant performance degradation. Blocks handoff.
   - MAJOR: Will cause rework or violate explicit DESIGN.md requirements. Strongly recommend fix.
   - MINOR: Style inconsistency, missing polish, or non-blocking deviation from spec.

2. **Map to pi-2 known issues** — verify the 12 known refactoring issues:

| # | Issue | Category | Expected |
|---|-------|----------|----------|
| 1 | Unthrottled scroll handler | C | Caught if no rAF |
| 2 | Unthrottled resize handler | C | Caught if no rAF |
| 3 | Universal `*` transitions | C | Caught |
| 4 | Missing localStorage error handling | C/JS | Flag if no try-catch |
| 5 | Duplicate CSS definitions | A | Caught |
| 6 | CSS Color Module L5 fallback needed | D | Caught if no `@supports` |
| 7 | Section-level theme complexity | D | Caught if missing |
| 8 | Font licensing risk | — | Skip (not detectable) |
| 9 | Focus management needed | B | Caught if no `:focus-visible` |
| 10 | prefers-reduced-motion support | B | Caught if no `@media` |
| 11 | z-index scale recommendation | A | Caught if ad-hoc |
| 12 | CSS Layers architecture | A | Caught if missing |

**Expected: 10+ of 12 issues flagged.**

3. **Estimate fix effort** — trivial (< 1h), small (1-4h), medium (half day), large (full day+)

### Step 5: Write Gate Decision

#### Machine-Readable JSON

Write to `.sisyphus/notepads/{plan-name}/ui-audit-{YYYY-MM-DD}.json`:

```json
{
  "decision": "PASS" | "WARNING" | "FAIL",
  "design_md_path": "{path}",
  "source_dir": "{path}",
  "summary": "{one-line summary}",
  "violation_counts": {
    "critical": 0,
    "major": 0,
    "minor": 0,
    "total": 0
  },
  "categories": {
    "css_architecture": {
      "status": "PASS" | "WARNING" | "FAIL",
      "violations": [
        {
          "id": "A-1",
          "severity": "CRITICAL" | "MAJOR" | "MINOR",
          "title": "{title}",
          "location": "{file}:{line}",
          "evidence": "{snippet}",
          "spec_reference": "DESIGN.md section 10.{subsection}",
          "fix": "{fix suggestion}"
        }
      ]
    },
    "accessibility": {
      "status": "PASS" | "WARNING" | "FAIL",
      "violations": []
    },
    "performance": {
      "status": "PASS" | "WARNING" | "FAIL",
      "violations": []
    },
    "theme_system": {
      "status": "PASS" | "WARNING" | "FAIL",
      "violations": []
    }
  },
  "known_issue_coverage": {
    "pi_2_issues_caught": 10,
    "pi_2_issues_total": 12,
    "missed_issues": ["Font licensing risk (not statically detectable)"]
  },
  "next_action": "proceed" | "fix_then_recheck" | "user_decision"
}
```

#### Human-Readable Report

Write to `.sisyphus/notepads/{plan-name}/ui-audit-report-{YYYY-MM-DD}.md`:

```markdown
# UI Audit Report: {plan-name}
**Date:** {YYYY-MM-DD}
**Artifacts reviewed:** DESIGN.md: {path}, Source: {dir}

## Summary
**Gate Decision:** {PASS / WARNING / FAIL}
**Violations:** {n} total ({critical} critical, {major} major, {minor} minor)
**Known Issue Coverage:** {X}/12 pi-2 issues caught

### Category Status
| Category | Status | Violations |
|----------|--------|------------|
| A. CSS Architecture | {PASS/WARNING/FAIL} | {n} |
| B. Accessibility | {PASS/WARNING/FAIL} | {n} |
| C. Performance | {PASS/WARNING/FAIL} | {n} |
| D. Theme System | {PASS/WARNING/FAIL} | {n} |

## Detailed Findings
### A. CSS Architecture Violations
{violations or "None found"}

### B. Accessibility Violations
{violations or "None found"}

### C. Performance Issues
{violations or "None found"}

### D. Theme System Gaps
{violations or "None found"}

## Fix Recommendations (Priority Order)
1. **[Severity]** [Title] — [specific fix] — Effort: [size]
```

### Step 6: Return Gate Decision

Return the JSON gate decision to the orchestrator.

### Summary

**Gate Decision:** {PASS / WARNING / FAIL}
**Violations:** {n} total ({critical} critical, {major} major, {minor} minor)
**Known Issue Coverage:** {X}/12 pi-2 issues caught

#### Category Status
| Category | Status | Violations |
|----------|--------|------------|
| A. CSS Architecture | {PASS/WARNING/FAIL} | {n} |
| B. Accessibility | {PASS/WARNING/FAIL} | {n} |
| C. Performance | {PASS/WARNING/FAIL} | {n} |
| D. Theme System | {PASS/WARNING/FAIL} | {n} |

### Detailed Findings

#### A. CSS Architecture Violations
{violations or "None found"}

#### B. Accessibility Violations
{violations or "None found"}

#### C. Performance Issues
{violations or "None found"}

#### D. Theme System Gaps
{violations or "None found"}

### Fix Recommendations (Priority Order)
1. **[Severity]** [Title] — [specific fix] — Effort: [size]

## Example Output

See `references/examples.md` for full PASS/FAIL examples with annotated violations.

### Example: Audit — PASS
```
User: "Audit UI implementation src/ against DESIGN.md"
Agent: 1. Runs deterministic detection pass
      2. Verifies 0 critical, 0 major, 1 minor violation
      3. Minor: z-index token --z-tooltip not used (ad-hoc 45 found)
      4. Returns: PASS with caution note
```