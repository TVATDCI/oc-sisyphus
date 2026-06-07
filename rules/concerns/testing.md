# Testing Rules

> **Provenance:** Inspired by AGENTS (github.com/m3tam3re/AGENTS). Adapted for our workflow.

## Arrange-Act-Assert Pattern

Structure every test in three distinct phases:

```typescript
// Arrange: Set up test data
const user = new User({ name: "Alice", role: "admin" });

// Act: Execute behavior
const result = user.canAccess("admin-panel");

// Assert: Verify outcome
expect(result).toBe(true);
```

Never mix phases. Keep Act to one line if possible.

## Behavior vs Implementation Testing

Test behavior, not implementation details:

```typescript
// GOOD: Tests observable behavior
expect(calculateDiscount("PREMIUM", 100)).toBe(10);

// BAD: Tests internal implementation
expect(discountHelper.wasCalled).toBe(true);
```

## Mocking Philosophy

Mock external dependencies, not internal code:
- Mock: databases, network calls, file system, external APIs
- Don't mock: private methods, internal state, fast stable dependencies

## Coverage Guidelines

- Business logic: >80% coverage
- UI components: Test behavior, not rendering internals
- Error paths: Must be tested (not just happy path)
- Edge cases: Empty input, null, maximum values

## Test Organization

Group tests by feature or behavior, not by file structure:

```typescript
describe("User Authentication", () => {
  it("valid credentials succeeds", () => { ... });
  it("invalid credentials fails", () => { ... });
  it("locked account fails", () => { ... });
});
```

Each test stands alone. No shared mutable state.

## Test Data

Use realistic data that reflects production:

```typescript
// GOOD
const user = { email: "alice@example.com", name: "Alice Smith", age: 28 };

// BAD
const user = { email: "test@test.com", name: "Test User", age: 999 };
```

## Test Independence

- Each test sets up its own state
- No shared mutable state between tests
- Use `beforeEach` for common setup, not shared variables
