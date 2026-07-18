---
name: tdd-executor
description: "Execute one feature using Test-Driven Development (TDD). Use when: (1) plan specifies tdd=true for a task, (2) implementing business logic with defined inputs/outputs, (3) user explicitly requests TDD approach. Triggers: 'tdd', 'test-first', 'red-green-refactor', 'write test first'."
compatibility: opencode
---

# TDD Executor

Executes one feature through the full RED-GREEN-REFACTOR cycle. Produces atomic commits and TDD evidence logs.

## When to Use

**TDD improves quality for:**
- Business logic with defined inputs/outputs
- API endpoints with request/response contracts
- Data transformations, parsing, formatting
- Validation rules and constraints
- Algorithms with testable behavior
- State machines and workflows
- Utility functions with clear specifications

**Skip TDD (use wave-executor directly):**
- UI layout, styling, visual components
- Configuration changes
- Glue code connecting existing components
- One-off scripts and migrations
- Simple CRUD with no business logic
- Exploratory prototyping

**Heuristic:** Can you write `expect(fn(input)).toBe(output)` before writing `fn`?
- Yes → Use TDD executor
- No → Use standard wave-executor

## Entry Criteria

- [ ] Feature scope is clear and testable
- [ ] Test framework exists in project (or install permission granted)
- [ ] Plan explicitly marks task as `tdd: true` OR user requests TDD

## Produces

- 1-2 atomic commits (implementation + optional refactor; RED phase not committed)
- TDD evidence log (`.sisyphus/evidence/{issue-id}-tdd-log.md`)
- Passing test suite for the feature

## Steps

### 1. Setup (if first TDD task)

**Detect project type:**
```bash
if [ -f package.json ]; then echo "node"; fi
if [ -f requirements.txt ] || [ -f pyproject.toml ]; then echo "python"; fi
if [ -f go.mod ]; then echo "go"; fi
if [ -f Cargo.toml ]; then echo "rust"; fi
```

**Install minimal framework if needed:**
| Project | Framework | Install |
|---------|-----------|---------|
| Node.js | Jest | `npm install -D jest @types/jest ts-jest` |
| Node.js (Vite) | Vitest | `npm install -D vitest` |
| Python | pytest | `pip install pytest` |
| Go | built-in | `go test` |
| Rust | built-in | `cargo test` |

**Verify setup:**
```bash
npm test  # Node
pytest    # Python
go test ./...  # Go
cargo test     # Rust
```

### 2. RED — Write Failing Test

1. Create test file following project conventions:
   - `*.test.ts` / `*.spec.ts` next to source
   - `__tests__/` directory
   - `tests/` directory at root

2. Write test describing expected behavior from PRD/plan:
   ```typescript
   // Good: Test behavior, not implementation
   describe("email validation", () => {
     it("should reject empty email", () => {
       expect(validateEmail("")).toBe(false);
     });
     it("should accept valid email", () => {
       expect(validateEmail("user@example.com")).toBe(true);
     });
     it("should reject missing @", () => {
       expect(validateEmail("userexample.com")).toBe(false);
     });
   });
   ```

3. **Run test — it MUST fail**
   - If test passes: investigate (feature exists or test is wrong)
   - Fix test before proceeding

4. **Do NOT commit RED phase** — Commit only after GREEN (tests pass)
   > Per project policy: never commit failing tests to main branch

### 3. GREEN — Implement to Pass

1. Write **minimal** code to make test pass
   - No cleverness, no optimization — just make it work
   - Hardcode if needed (will refactor later)

2. **Run test — it MUST pass**
   - If test fails: debug and iterate until green
   - Do NOT skip to refactor

3. **Commit:**
   ```bash
   git add {source-file}
   git commit -m "feat({wave}-{slice}): implement {feature}"
   ```

### 4. REFACTOR (if needed)

1. Clean up implementation if obvious improvements exist:
   - Extract constants
   - Remove duplication
   - Improve naming
   - Add edge case handling

2. **Run tests — MUST still pass**
   - If tests break: undo refactor and try smaller steps

3. **Commit (only if changes made):**
   ```bash
   git add {source-file}
   git commit -m "refactor({wave}-{slice}): clean up {feature}"
   ```

### 5. Log Evidence

Create TDD evidence log:
```markdown
# TDD Log: {feature-name}
**Date:** {YYYY-MM-DD}
**Slice:** {wave}-{slice}
**Commits:**
- GREEN: {hash} — implementation passing tests
- REFACTOR: {hash} — cleanup (if applicable)

> Note: RED phase (failing test) is not committed per project policy

## RED Phase
**Test written:** {what was tested}
**Expected behavior:** {behavior}
**Test result:** FAIL (as expected)

## GREEN Phase
**Implementation:** {what was built}
**Minimal change:** {yes/no}
**Test result:** PASS

## REFACTOR Phase
**Changes:** {what was cleaned up}
**Test result:** PASS (no regressions)

## Coverage
- Happy path: ✓
- Edge cases: [list]
- Error handling: [list]

## Deviation Notes
[Any auto-fixes from deviation rules]
```

## Context Budget

TDD plans target **~40% context usage** (lower than standard execution's ~50%).

Why lower:
- RED phase: write test, run test, debug why it didn't fail
- GREEN phase: implement, run test, iterate on failures
- REFACTOR phase: modify code, run tests, verify no regressions

Each phase involves reading files, running commands, analyzing output.

## Quality Rules

**Test behavior, not implementation:**
- Good: "returns formatted date string"
- Bad: "calls formatDate helper with correct params"
- Tests should survive refactors

**One concept per test:**
- Good: Separate tests for valid input, empty input, malformed input
- Bad: Single test checking all edge cases with multiple assertions

**Descriptive names:**
- Good: "should reject empty email", "returns null for invalid ID"
- Bad: "test1", "handles error", "works correctly"

**No implementation details:**
- Good: Test public API, observable behavior
- Bad: Mock internals, test private methods, assert on internal state

## Error Handling

| Scenario | Action |
|----------|--------|
| Test doesn't fail in RED | Investigate — feature exists or test is wrong |
| Test doesn't pass in GREEN | Debug implementation, iterate until green |
| Tests fail in REFACTOR | Undo refactor, try smaller steps |
| Unrelated tests break | Stop and investigate — may indicate coupling issue |
| 3+ fix attempts fail | Document as deferred issue, continue or escalate |

## Integration with Wave Executor

TDD executor is called **within** a wave when a slice specifies `tdd: true`:

```
wave-executor Wave 1
  ├── Slice 1: Schema changes → wave-executor (no TDD)
  ├── Slice 2: API endpoint → tdd-executor (tdd: true)
  │   ├── RED: Write failing test
  │   ├── GREEN: Implement endpoint
  │   └── REFACTOR: Clean up
  └── Slice 3: UI component → wave-executor (no TDD)
```

**Input from:**
- `wave-executor`: Task marked with `tdd: true`
- `plan-writer`: Plan specifies test-first approach for certain slices

**Output to:**
- `wave-executor`: Returns to main execution flow with test evidence
- `plan-updater`: Commits logged as progress

## Model Selection

**Category:** `unspecified-high`

Runtime model and fallbacks are resolved from `oh-my-openagent.json` by category. Do not hardcode model identifiers here — they drift on every model refresh.

TDD execution is mechanical: write test, make it pass, clean up. No architectural reasoning needed — that's in the PRD.

**Escalation:** If tests fail after 2 attempts, escalate to `category="deep"` for debugging.

## Commit Pattern

TDD plans produce 1-2 atomic commits (GREEN + optional REFACTOR):

```
feat(01-02): implement email validation

- Tests: valid email, empty email, malformed email
- All tests pass

refactor(01-02): extract regex to constant (optional)

- No behavior changes
- Tests still pass
```

**Benefits:**
- Each commit independently revertable
- Git bisect works at commit level
- Clear history showing TDD discipline
- Consistent with wave-executor commit format
