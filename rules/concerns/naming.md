# Naming Conventions

> **Provenance:** Inspired by AGENTS (github.com/m3tam3re/AGENTS). Adapted for our workflow.

## Cross-Language Reference

| Context | TypeScript | Python | Shell | Nix |
|---------|-----------|--------|-------|-----|
| Variables | `camelCase` | `snake_case` | `UPPER_SNAKE` | `camelCase` |
| Functions | `camelCase` | `snake_case` | `lower_case` | `camelCase` |
| Classes | `PascalCase` | `PascalCase` | — | — |
| Constants | `UPPER_SNAKE` | `UPPER_SNAKE` | `UPPER_SNAKE` | `camelCase` |
| Files | `kebab-case.ts` | `snake_case.py` | `kebab-case.sh` | `hyphen-case.nix` |

## General Rules

- **Functions**: verb-noun pattern (`getUserData`, `validateInput`)
- **Booleans**: prefix with `is`, `has`, `should` (`isActive`, `hasPermission`)
- **Collections**: plural noun (`users`, `activeSessions`)
- **Temp variables**: loop counters only (`i`, `j`, `k`). All others: descriptive
- **No abbreviations** except universally known (`id`, `url`, `api`)

## Examples

```typescript
// GOOD
const isUserAuthenticated = true;
const activeUserSessions = new Map();
function getUserById(userId: string) { ... }

// BAD
const u = true;
const data = [];
function get(id: string) { ... }
```
