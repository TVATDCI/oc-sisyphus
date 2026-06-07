# TypeScript Rules

> **Provenance:** Inspired by AGENTS (github.com/m3tam3re/AGENTS). Adapted for our workflow.

## Style
- Prefer `type` over `interface` for object shapes (unless declaration merging needed)
- Use strict TypeScript (`strict: true` in tsconfig)
- No `any` — use `unknown` with type guards
- No `@ts-ignore` or `@ts-expect-error` without comment explaining why
- Prefer `satisfies` for type-safe object literal inference
- Use `as const` for frozen literal types
- Prefer union types over enums: `type Status = "active" | "inactive"` not `enum Status { Active, Inactive }`

## Naming
| Construct | Convention |
|-----------|-------------|
| Variables | `camelCase` |
| Functions | `camelCase` |
| Classes | `PascalCase` |
| Constants | `UPPER_SNAKE` |
| Files | `kebab-case.ts` |
| React components | `PascalCase.tsx` |

## Error Handling
- Prefer `Result<T, E>` patterns over throwing
- If throwing: catch specific errors, never bare `catch`
- Log context before re-throwing
- Handle `noUncheckedIndexedAccess`: array access returns `T | undefined`

## Async
- Use `async/await`, not `.then()` chains
- Handle Promise rejections explicitly
- No floating promises (must await or void-explicit)

## Modern Features
- Use `satisfies` for type-safe object literal inference
- Use `as const` for frozen literal types
- Prefer union types over enums: `type Status = "active" | "inactive"` not `enum Status { Active, Inactive }`
- Handle `noUncheckedIndexedAccess`: array access returns `T | undefined`

## Toolchain
- Runtime: `tsx` or `bun` for development
- Linting: `eslint` with TypeScript plugin
- Formatting: `prettier`

## Anti-Patterns
```typescript
// NEVER: as any
const data = response as any;

// NEVER: @ts-ignore without explanation
// @ts-ignore
const value = unknownFunction();

// NEVER: non-null assertion
const element = document.querySelector("#foo")!;

// NEVER: enum (prefer union or const object)
enum Status { Active, Inactive } // ❌
type Status = "active" | "inactive"; // ✅
```
