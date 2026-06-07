---
name: toolkit-lsp
description: "LSP (Language Server Protocol) tools for code analysis — diagnostics, references, definitions, rename, symbols. Use when: (1) checking for compile errors, (2) finding where a symbol is used, (3) navigating to definitions, (4) renaming symbols across files, (5) exploring project structure via symbols. Triggers: lsp, diagnostics, find references, goto definition, rename symbol, code analysis."
compatibility: opencode
---

# LSP Toolkit

Language Server Protocol tools for code intelligence. These tools are always available to call but loaded on-demand to keep the agent focused.

## Available Tools

### `lsp_diagnostics`
Get errors, warnings, and hints for a source file or directory.

```typescript
lsp_diagnostics({ filePath: "src/file.ts", severity: "error" })
```

**Usage patterns:**
- Check a file after editing: `lsp_diagnostics({ filePath: "src/myfile.ts" })`
- Check entire project: `lsp_diagnostics({ filePath: "." })`
- Filter by severity: `{ severity: "error" }`, `{ severity: "warning" }`, `{ severity: "all" }`
- Default severity is `all`

### `lsp_find_references`
Find all references to a symbol across the workspace.

```typescript
lsp_find_references({ filePath: "src/utils.ts", line: 15, character: 3 })
```

**Line and character are 1-based (line) and 0-based (character).** Place cursor on the symbol name, not the declaration keyword.

### `lsp_goto_definition`
Find where a symbol is defined.

```typescript
lsp_goto_definition({ filePath: "src/utils.ts", line: 15, character: 3 })
```

Same coordinate convention as find_references.

### `lsp_prepare_rename`
Check whether a symbol can be renamed at a position. Always call BEFORE `lsp_rename` to verify.

```typescript
lsp_prepare_rename({ filePath: "src/utils.ts", line: 15, character: 3 })
```

### `lsp_rename`
Rename a symbol across the workspace and apply all changes.

```typescript
lsp_rename({ filePath: "src/utils.ts", line: 15, character: 3, newName: "newSymbolName" })
```

Call `lsp_prepare_rename` first to verify the symbol is renameable.

### `lsp_status`
List configured and active LSP servers without starting a new language server.

```typescript
lsp_status()
```

Use when diagnostics aren't showing up — check if the LSP server for that language is active.

### `lsp_symbols`
List document symbols or search workspace symbols.

```typescript
// Document outline
lsp_symbols({ filePath: "src/utils.ts", scope: "document" })

// Workspace search
lsp_symbols({ filePath: "src/utils.ts", scope: "workspace", query: "useAuth" })
```

## Recommended Workflow

```
1. Edit code
2. lsp_diagnostics → check for errors
3. If errors: lsp_goto_definition → understand types
4. lsp_find_references → find usages before changing APIs
5. lsp_prepare_rename → verify renameable
6. lsp_rename → apply rename
7. lsp_diagnostics → verify no new errors
```
