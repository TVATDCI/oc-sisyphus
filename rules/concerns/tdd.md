# Test-Driven Development (TDD)

> **Provenance:** Inspired by AGENTS (github.com/m3tam3re/AGENTS). Adapted for our workflow.

## Critical Rules

**NEVER write production code without a failing test first.**
**ALWAYS follow the red-green-refactor cycle.**
**Refactor if obvious improvements exist.**
**ALWAYS commit after green, never commit red tests.**

## The Red-Green-Refactor Cycle

### Phase 1: Red (Write Failing Test)
- Test MUST fail for the right reason (not syntax error)
- Test describes ONE behavior
- Test name clearly states expected outcome

### Phase 2: Green (Write Minimum Code)
- No cleverness, no optimization — just make it work
- Hardcode if needed (refactor later)

### Phase 3: Refactor (Clean Up)
- Extract constants, remove duplication
- Tests MUST still pass
- Only commit if changes made

## Test Quality

**Test behavior, not implementation:**
- Good: "returns formatted date string"
- Bad: "calls formatDate helper with correct params"

**One concept per test:**
- Good: Separate tests for valid, empty, malformed input
- Bad: Single test with multiple assertions

**Descriptive names:**
- Good: "should reject empty email"
- Bad: "test1", "handles error"

## When to Use TDD

**Use:** Business logic, API endpoints, data transformations, validation rules, algorithms
**Skip:** UI layout, config changes, glue code, one-off scripts, simple CRUD
