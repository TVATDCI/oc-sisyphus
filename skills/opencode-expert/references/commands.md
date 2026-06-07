# Slash Commands Reference

Slash commands trigger specific workflows or actions.

## Built-in Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `/help` | `Ctrl+X H` | Show help dialog |
| `/share` | `Ctrl+X S` | Share session online |
| `/unshare` | | Unshare session |
| `/sessions` | `Ctrl+X L` | Browse session list |
| `/new` | `Ctrl+X N` | New session |
| `/clear` | | Clear current session |
| `/init` | `Ctrl+X I` | Create/update AGENTS.md |
| `/details` | `Ctrl+X D` | Toggle tool details |
| `/thinking` | | Toggle thinking display |
| `/connect` | | Add AI provider |
| `/models` | `Ctrl+X M` | List/switch models |
| `/agent` | `Ctrl+X A` | Switch agent |
| `/export` | `Ctrl+X X` | Export to Markdown |
| `/undo` | `Ctrl+X U` | Undo last message |
| `/redo` | `Ctrl+X R` | Redo undone message |
| `/compact` | `Ctrl+X C` | Compact session |
| `/title` | | Change session title |
| `/themes` | `Ctrl+X T` | List themes |
| `/exit` | `Ctrl+X Q` | Exit (alias: `/quit`, `/q`) |

---

## Creating Custom Commands

### File Location

- **Project:** `.opencode/commands/`
- **Global:** `~/.config/opencode/commands/`

### File Format

```markdown
---
description: What this command does
agent: optional-agent-name
model: optional-model-name
---

Your prompt template here.
Use $ARGUMENTS for user input.
```

### Command File Name

The filename (without `.md`) becomes the command name:
- `review.md` → `/review`
- `deploy.md` → `/deploy`
- `explain.md` → `/explain`

---

## Command Examples

### Code Review Command

**File:** `.opencode/commands/review.md`

```markdown
---
description: Review code for quality and issues
agent: build
---

Please review the following code:
@$ARGUMENTS

Focus areas:
1. Security vulnerabilities
2. Performance bottlenecks
3. Code quality and style
4. Potential bugs or edge cases
5. Best practices adherence
```

### Deploy Command

**File:** `.opencode/commands/deploy.md`

```markdown
---
description: Deploy to production environment
agent: build
---

Deploy the following to production:
@$ARGUMENTS

Before deploying, verify:
1. All tests pass
2. No security vulnerabilities
3. Documentation is updated
4. Migration scripts are ready

Report deployment status and any issues.
```

### Explain Command

**File:** `.opencode/commands/explain.md`

```markdown
---
description: Explain code in detail
---

Please explain this code thoroughly:
@$ARGUMENTS

Include:
- Purpose and functionality
- Key components and their roles
- Data flow
- Best practices used
- Areas for improvement
```

---

## Argument Passing

### Basic Arguments

```bash
/review src/auth/login.ts
/deploy production v2.1.0
```

### Multiple Arguments

```bash
/refactor UserService --include-tests --dry-run
```

### Interactive Arguments

If no arguments provided, user is prompted to select files or provide input.

---

## Command Placeholders

| Placeholder | Description |
|-------------|-------------|
| `$ARGUMENTS` | All arguments passed to command |
| `$1`, `$2`, etc. | Individual arguments (if supported) |

---

## Keybinding Commands

Bind frequently used commands to keyboard shortcuts.

### Configuration

In `tui.json`:

```json
{
  "keybinds": {
    "/commit-and-push": "ctrl+alt+c",
    "/deploy": "ctrl+alt+d",
    "/review": "ctrl+alt+r"
  }
}
```

### Pattern

```
/command-name--using-model-name
```

### Examples

```json
{
  "keybinds": {
    "/deploy--using-claude-opus": "ctrl+alt+d",
    "/review--using-claude-sonnet": "ctrl+alt+r"
  }
}
```

---

## Command Patterns

### Wrapper Commands

```markdown
---
description: Run with our conventions
agent: build
---

Always follow these conventions when $ARGUMENTS:
- Use TypeScript strict mode
- Include JSDoc comments
- Add error handling
- Write unit tests

Now $ARGUMENTS
```

### File Selection Commands

```markdown
---
description: Analyze selected files
---

Analyze these files:
@$ARGUMENTS

Provide:
1. Overview of each file
2. Dependencies between files
3. Potential improvements
```

### Git Commands

```markdown
---
description: Smart git operations
---

Handle this git operation:
@$ARGUMENTS

Follow best practices:
- Create meaningful commit messages
- Follow conventional commits format
- Consider branch protection rules
```

---

## Command Best Practices

1. **Single purpose**: Each command does one thing well
2. **Clear descriptions**: Help users understand when to use
3. **Appropriate agent**: Match command to agent capability
4. **Reasonable defaults**: Work without arguments if possible
5. **Document edge cases**: Explain behavior for unexpected input

---

## Testing Commands

Test commands in a safe environment:

1. Create the command file
2. Run with: `/your-command test-input`
3. Review the output
4. Refine and iterate

---

## Command Debugging

If a command doesn't work:

1. Check file location is correct
2. Verify filename matches command name
3. Ensure frontmatter is valid YAML
4. Check `$ARGUMENTS` usage is correct
5. Verify permissions allow command execution
