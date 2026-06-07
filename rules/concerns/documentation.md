# Documentation Rules

> **Provenance:** Inspired by AGENTS (github.com/m3tam3re/AGENTS). Adapted for our workflow.

## When to Document

**Document:**
- Public APIs (functions, classes, modules users interact with)
- Complex logic (algorithms, state machines, non-obvious implementations)
- Business rules (domain knowledge that isn't obvious from code)
- Trade-offs (why this approach was chosen over alternatives)

**Do NOT document:**
- Obvious code (comments like `// increment counter`)
- What the code does (code should be self-explanatory)

## Docstring Formats

### TypeScript / JavaScript (JSDoc)

```typescript
/**
 * Validates user input against security rules.
 * @param input - Raw user input from form
 * @param rules - Validation constraints
 * @returns True if input passes all rules
 * @throws ValidationError if input violates constraints
 */
function validateInput(input: string, rules: ValidationRules): boolean {
```

### Python (Google Style)

```python
def calculate_price(quantity: int, unit_price: float, discount: float = 0.0) -> float:
    """Calculate total price after discount.
    
    Args:
        quantity: Number of items ordered
        unit_price: Price per item in USD
        discount: Decimal discount rate (0.0 to 1.0)
    
    Returns:
        Final price in USD
    
    Raises:
        ValueError: If quantity is negative
    """
```

## Inline Comments: WHY Not WHAT

**Incorrect:**
```typescript
// Iterate through all users
for (const user of users) {
  // Check if user is active
  if (user.active) {
    // Increment counter
    count += 1;
  }
}
```

**Correct:**
```typescript
// Count only active users to calculate monthly revenue
for (const user of users) {
  if (user.active) {
    count += 1;
  }
}
```

**Rule:** Describe intent and context. Never describe what the code obviously does.

## README Standards

Every project needs a README at the top level.

**Required sections:**
1. **What it does** — One sentence summary
2. **Installation** — Setup commands
3. **Usage** — Basic example
4. **Configuration** — Environment variables and settings

**Keep READMEs focused.** Link to separate docs for complex topics. Don't make the README a tutorial.
