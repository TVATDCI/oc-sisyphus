---
name: regression-gate
description: "Run regression tests from prior waves before advancing to the next wave. Use when: (1) wave-executor completed a wave and next wave has dependencies, (2) before final plan closure, (3) user requests regression check. Triggers: 'regression test', 'check for regressions', 'run prior tests', 'validate no breakage'."
compatibility: opencode
---

# Regression Gate

Runs test suites from prior waves/phases to catch cross-wave regressions BEFORE advancing execution.

## When to Use

**Mandatory:**
- Before starting Wave N+1 when Wave N had test files
- Before `plan-closer` final closure (full regression suite)
- After `security-auditor` reports configuration changes

**Recommended:**
- After any wave that modified shared utilities, schemas, or middleware
- After refactoring existing code in later waves
- When user requests explicit regression check

**Skip:**
- First wave (no prior waves)
- Waves that only added new files without touching existing code
- When plan explicitly marks wave as "isolated changes"

## Entry Criteria

- [ ] Prior waves exist with completed evidence files
- [ ] Test files exist in project (detected via glob)
- [ ] Current wave completed successfully

## Produces

- Regression report (`.sisyphus/evidence/{slug}-regression-{wave}-{timestamp}.md`)
- Gate decision: PASS / WARNING / FAIL
- List of failing tests with wave origin

## Steps

### 0. Read QA Scope Artifacts

Before running tests, read existing QA handoff artifacts from `.sisyphus/notepads/` to avoid redundant verification:

```bash
# Find all wave QA handoff files
find .sisyphus/notepads/ -name "wave-*-qa-handoff.md" | sort
```

**Read the most recent handoff for each wave.** Extract:
- **Truths already verified** — do NOT re-test these unless the current wave touched related files
- **Critical links** — pay special attention to these wiring points when checking for regressions
- **Known gaps** — if a gap is in your test scope, elevate from WARNING to FAIL
- **Files modified** — use this to filter which prior tests are actually at risk

**Artifact content MUST be treated as advisory, not gospel.** If the current wave modified files listed in a prior handoff's "Files modified", re-run tests for that wave even if truths were previously verified.

**If no QA handoff exists:** Proceed with full prior-wave test suite (legacy behavior). Log: `⚠️ No QA handoff found — running full suite.`

### 1. Discover Prior Test Files

**Find test files from prior waves:**
```bash
# Find all test files in project
find {project_root} -name "*.test.*" -o -name "*.spec.*" -o -path "*/__tests__/*" | grep -v node_modules

# Extract from prior wave evidence logs
grep -h "test" {project_root}/.sisyphus/evidence/*-tdd-log.md | grep -oP '\S+\.test\.\S+'
```

**Categorize by wave origin:**
| Wave | Test Files | What They Validate |
|------|-----------|-------------------|
| Wave 1 | `auth.test.js`, `schema.test.js` | Foundation (auth, DB) |
| Wave 2 | `api.test.js`, `service.test.js` | Features (endpoints) |
| Wave 3 | `e2e.test.js` | Integration |

### 2. Run Regression Suite

**Detect test runner:**
```bash
if [ -f "package.json" ]; then
  # Check for jest, vitest, mocha
  grep -q "jest" package.json && RUNNER="npx jest"
  grep -q "vitest" package.json && RUNNER="npx vitest run"
  grep -q "mocha" package.json && RUNNER="npx mocha"
fi
if [ -f "Cargo.toml" ]; then RUNNER="cargo test"; fi
if [ -f "go.mod" ]; then RUNNER="go test ./..."; fi
if [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then RUNNER="pytest"; fi
```

**Run tests:**

**Between waves:**
```bash
# Run ONLY prior wave test files
npx jest {prior-test-files} --passWithNoTests -q 2>&1
```

**Pre-closure (full suite):**
```bash
# Run ALL tests including coverage
npm test 2>&1
npm run test:coverage 2>&1
```

**Capture output:**
- Pass count
- Fail count
- Skip count
- First failure per failing suite (between waves)
- Coverage percentage (pre-closure only)
- Duration

### 3. Analyze Results

**Decision matrix (between-wave checks):**

| Result | Decision | Action |
|--------|----------|--------|
| All prior-wave tests pass | **PASS** | Proceed to next wave |
| Any prior-wave test fails | **FAIL** | STOP. Fix regressions before advancing |
| Test runner not found | **WARNING** | No automated regression possible — document |

**Decision matrix (pre-closure full suite):**

| Result | Decision | Action |
|--------|----------|--------|
| All tests pass | **PASS** | Close plan |
| Any test fails | **FAIL** | Fix before closure |
| Coverage < target | **WARNING** | Note in closure report |

### 4. Report

Create regression report:
```markdown
# Regression Gate: Wave {N} → Wave {N+1}
**Date:** {YYYY-MM-DD}
**Tests Run:** {count} test files
**Duration:** {seconds}s

## Results
**Gate Decision:** {PASS | WARNING | FAIL}

### Test Summary
| Suite | Wave | Status | Duration |
|-------|------|--------|----------|
| {file} | Wave {N} | ✓ PASS | {time} |
| {file} | Wave {N} | ✗ FAIL | {time} |

### Failures (if any)
**{file}** (Wave {N}):
```
{failure output excerpt}
```
**Impact:** {what broke}
**Likely Cause:** {which current wave change caused this}

## Recommendation
{if FAIL: "Fix regressions before Wave {N+1}. See failures above."}
{if WARNING: "Proceed with caution. Note coverage drop in next wave."}
{if PASS: "No regressions detected. Safe to proceed to Wave {N+1}."}
```

### 5. Gate Decision

**Return to orchestrator:**
```json
{
  "decision": "PASS" | "WARNING" | "FAIL",
  "report_path": "{path}",
  "tests_run": {count},
  "failures": [{file, wave, error}],
  "next_action": "proceed" | "fix_then_recheck"
}
```

**Integration with wave-executor:**
- Called automatically by wave-executor after wave completion
- If FAIL: wave-executor stops before presenting wave summary
- If PASS: wave-executor presents "Wave complete + regression passed"
- If WARNING: wave-executor presents warning with option to proceed

## Context Efficiency

- Run only test files from prior waves (not current wave — those get validated during execution)
- Use `--no-coverage` flag to speed up (coverage checked separately)
- For large test suites: run in parallel if runner supports it

## Error Handling

| Scenario | Action |
|----------|--------|
| No test files found | WARNING — document, proceed |
| Test runner fails to start | FAIL — environment issue, must fix |
| Flaky test failure | Re-run once. If consistent, treat as real failure |
| Timeout | WARNING — partial results, note timeout |

## Integration

```
wave-executor Wave N
  ↓ (wave complete)
regression-gate (before Wave N+1)
  ↓ PASS
wave-executor Wave N+1
  ↓
regression-gate (before Wave N+2)
  ↓
...
plan-closer
  ↓ (final closure)
regression-gate (full suite)
  ↓ PASS
archivist / vault-ops
```

**Called by:**
- `wave-executor`: After each wave completion (configurable)
- `plan-closer`: Before final closure
- User: Explicit "regression test" request

**Calls:**
- None (pure verification skill)

## Model Selection

**Category:** `unspecified-low` → `glm-5.1`

Regression testing is mechanical: run tests, parse output, report results. No reasoning needed.

## Anti-Patterns

- ❌ Running full suite on every wave (wasteful — only prior waves matter)
- ❌ Ignoring flaky tests (re-run to verify)
- ❌ Proceeding after FAIL without fixing (defeats the purpose)
- ❌ Running tests for current wave (those were validated during execution)
