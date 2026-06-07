# Nix Rules

> **Provenance:** Inspired by AGENTS (github.com/m3tam3re/AGENTS). Adapted for our workflow.

## Style
- Format with `alejandra` (2-space indent, no trailing whitespace)
- Naming: camelCase for variables, PascalCase for types, hyphen-case for files
- Use explicit `pkgs.packageName` references
- Avoid `with pkgs;` — namespace pollution

## Patterns
- Use `lib.mkIf`, `lib.mkMerge`, `lib.mkOptionDefault` for conditionals
- Use `lib.attrByPath`/`lib.optionalAttrs` instead of `builtins.getAttr`
- Always use flake inputs, never `import <nixpkgs>`

## Naming
| Construct | Convention |
|-----------|-------------|
| Variables | `camelCase` |
| Functions | `camelCase` |
| Types | `PascalCase` |
| Constants | `camelCase` |
| Files | `hyphen-case.nix` |
