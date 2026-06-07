# Coding Style Rules

> **Provenance:** Inspired by AGENTS (github.com/m3tam3re/AGENTS). Adapted for our workflow.

## General Principles

- Prioritize readability over cleverness
- Fail fast and explicitly — never silently swallow errors
- Keep functions under 20 lines; extract duplicated logic
- Use guard clauses to reduce nesting (avoid arrow-shaped code)
- Validate inputs at function boundaries
- Write self-documenting code; comments explain WHY, not WHAT
- Never commit commented-out code

## Function Design

- **Single responsibility**: One function = one concept
- **Early returns**: Return as soon as you know the answer
- **Pure when possible**: Same input → same output, no side effects
- **Composition over inheritance**: Build behavior from small functions

## Comments

**Good comments:**
- Explain WHY, not WHAT
- Document assumptions and invariants
- Reference external specs or tickets

**Bad comments:**
- Restate the obvious
- Explain code that should be self-evident
- Outdated or incorrect

## Formatting

- Consistent indentation (match project: 2 or 4 spaces)
- Max line length: 100 characters
- One blank line between logical sections
- Group related imports, separate with blank line
