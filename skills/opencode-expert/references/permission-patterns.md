# OpenCode Permission Patterns

Reference for permission configuration, wildcard syntax, and safe defaults.

> Last verified: 2026-04-30

---

## Permission Keys

| Key | Controls |
|-----|----------|
| `read` | File reading |
| `edit` | File writing/modifying |
| `glob` | File glob operations |
| `grep` | Content searching |
| `list` | Directory listing |
| `bash` | Shell command execution |
| `task` | Subagent invocation |
| `external_directory` | Access outside project |
| `todowrite` | Todo list management |
| `webfetch` | URL fetching |
| `websearch` | Web search |
| `codesearch` | Code search |
| `lsp` | LSP operations |
| `skill` | Skill loading |
| `question` | User prompting |
| `doom_loop` | Loop detection |

---

## Permission Values

| Value | Behavior |
|-------|----------|
| `"allow"` | Execute without asking |
| `"ask"` | Prompt user for confirmation |
| `"deny"` | Refuse execution |

---

## Wildcard Pattern Syntax

Use `*` and `?` for pattern matching in permission values:

- `*` — Matches any sequence of characters
- `?` — Matches exactly one character

### Critical Rule: Order Matters

**Patterns are evaluated top-to-bottom, last match wins.**

```jsonc
// ❌ WRONG: Catch-all first, specific after (specific never matches)
"permission": {
  "bash": {
    "*": "allow",
    "rm *": "deny"
  }
}

// ✅ CORRECT: Specific first, catch-all last
"permission": {
  "bash": {
    "rm *": "deny",
    "git status *": "allow",
    "git diff *": "allow",
    "go test *": "allow",
    "*": "ask"
  }
}
```

### Safe Defaults Template

```jsonc
{
  "permission": {
    "read": { "*": "allow" },
    "edit": { "*": "ask" },
    "bash": {
      "git status *": "allow",
      "git diff *": "allow",
      "git log *": "allow",
      "git branch *": "allow",
      "ls *": "allow",
      "cat *": "allow",
      "go test *": "allow",
      "go build *": "allow",
      "npm test *": "allow",
      "rm *": "deny",
      "git push *": "ask",
      "*": "ask"
    },
    "external_directory": "ask"
  }
}
```

---

## Per-Agent Permissions

Override permissions per agent:

```jsonc
{
  "permission": {
    "read": { "*": "allow" },
    "edit": { "*": "ask" }
  },
  "agent": {
    "code-reviewer": {
      "permission": {
        "edit": { "*": "deny" },
        "bash": { "*": "deny" }
      }
    },
    "deployer": {
      "permission": {
        "bash": {
          "docker *": "allow",
          "kubectl *": "allow",
          "*": "deny"
        }
      }
    }
  }
}
```

---

## MCP Per-Agent Control

Disable MCP globally, enable for specific agents:

```jsonc
{
  "tools": { "my-mcp*": false },
  "agent": {
    "researcher": {
      "tools": { "my-mcp*": true }
    }
  }
}
```

---

## Tool Control Patterns

Glob patterns for disabling/enabling tool groups:

```jsonc
{
  "tools": {
    "mcp*": false,      // Disable all MCP tools
    "mcp:github": true  // Re-enable GitHub MCP
  }
}
```

---

## Environment Variable Permissions

Override permissions via environment variable:

```bash
export OPENCODE_PERMISSION='{"bash":"ask","edit":"deny"}'
```

Useful for CI/CD where you want strict defaults.

---

## Permission Pattern Examples

### Read-Only Reviewer
```jsonc
{
  "permission": {
    "read": { "*": "allow" },
    "edit": { "*": "deny" },
    "bash": { "*": "deny" },
    "task": { "*": "deny" }
  }
}
```

### Safe Developer
```jsonc
{
  "permission": {
    "read": { "*": "allow" },
    "edit": { "*": "ask" },
    "bash": {
      "git *": "allow",
      "ls *": "allow",
      "cat *": "allow",
      "npm *": "ask",
      "docker *": "ask",
      "rm *": "deny",
      "*": "ask"
    }
  }
}
```

### CI/CD Runner
```jsonc
{
  "permission": {
    "read": { "*": "allow" },
    "edit": { "*": "deny" },
    "bash": {
      "git *": "allow",
      "npm test *": "allow",
      "go test *": "allow",
      "*": "deny"
    }
  }
}
```

### Database Admin
```jsonc
{
  "permission": {
    "bash": {
      "psql *": "allow",
      "pg_dump *": "allow",
      "*": "deny"
    }
  }
}
```

---

## Hidden Permission Keys

| Key | Purpose |
|-----|---------|
| `doom_loop` | Triggered when same tool repeats 3x in a row |
| `external_directory` | Access files outside the project root |

```jsonc
{
  "permission": {
    "external_directory": "ask"
  }
}
```

---

## Anti-Patterns to Avoid

1. ❌ `*": "allow"` for bash without specific overrides
2. ❌ Putting catch-all `*` before specific patterns
3. ❌ Forgetting `deny` for destructive commands (`rm`, `git push --force`)
4. ❌ Using `"*": "ask"` in CI/CD (will hang waiting for input)

---

## Agent Permission Defaults

Built-in agents have these defaults:

| Agent | edit | bash | task |
|-------|------|------|------|
| build | allow | ask | allow |
| plan | deny | ask | allow |
| explore | deny | ask | deny |
| general | allow | ask | allow |
