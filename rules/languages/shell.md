# Shell / Bash Rules

> **Provenance:** Inspired by AGENTS (github.com/m3tam3re/AGENTS). Adapted for our workflow.

## Safety
```bash
#!/usr/bin/env bash
set -euo pipefail
```

## Style
- Always quote variables: `"${var}"`
- Use `$()` not backticks
- Use arrays for lists, not strings
- Functions: `my_func() { local var; ... }`
- 2-space indent, lines ≤ 80 chars

## Patterns
- Cleanup with `trap cleanup EXIT`
- Define colors: `RED`, `GREEN`, `YELLOW`, `NC`
- Use `shellcheck` before committing

## Naming
| Construct | Convention |
|-----------|-------------|
| Variables | `UPPER_SNAKE` (env), `lower_snake` (local) |
| Functions | `lower_snake()` |
| Files | `kebab-case.sh` |
