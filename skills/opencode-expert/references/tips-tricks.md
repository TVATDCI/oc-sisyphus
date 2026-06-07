# Tips & Tricks

Lesser-known features and productivity boosters.

## Input Tricks

### File References

**Syntax:** `@filename`

Fuzzy matches files in your project. Examples:
```
@auth        → matches auth.ts, auth/index.ts, etc.
@readme      → matches README.md
```

**Multiple files:**
```
@file1 @file2 @file3
```

### Shell Commands

**Syntax:** `!command`

Run shell commands inline:
```
!ls -la
!git status
!npm test
```

### Image Attachment

Drag and drop images into the prompt to include them in context.

### Multiline Input

**Methods:**
- `Shift+Enter` (requires terminal support)
- `Ctrl+J` (always works)

---

## Session Tricks

### Fork for Experiments

When you want to try something risky:
```
opencode run --fork
```

This creates a copy of the current session. Changes in the fork won't affect the original.

### Compact Early and Often

Use `<leader>C` to compact sessions when context gets long. Better to compact at 70% than wait for 200 messages.

### Undo is Powerful

`<leader>U` undoes the last AI response. Use it when:
- The response wasn't helpful
- You want to rephrase the question
- You made a mistake in input

### Session Timeline

`<leader>G` shows your session history. Useful for:
- Finding when you asked something
- Reviewing the evolution of your project
- Recovering lost work

---

## Productivity Patterns

### Be Specific

**Instead of:**
> fix this bug

**Say:**
> fix the nil pointer dereference in processRequest function on line 45

**Why:** Specific prompts get specific, accurate responses.

### Explore Before Build

For unfamiliar codebases:
```
explore this project and tell me:
1. What it does
2. How it's structured
3. Key files I should know about
```

### Use Sessions Wisely

**Best practices:**
- One session per task/feature
- Different problems = different sessions
- Keep sessions focused

**Example:**
- `session-frontend-auth` for auth work
- `session-backend-api` for API work
- `session-refactor` for cleanup

### Plan Before Implementation

For complex features, use the plan agent first:
```
1. Switch to plan agent
2. Describe what you want to build
3. Review the proposed approach
4. Switch to build agent
5. Implement
```

---

## Model Selection

### Task-Based Selection

| Task | Recommended Model |
|------|-------------------|
| Quick questions | Fast/cheap models |
| Complex reasoning | Sonnet/Opus class |
| Code generation | Claude 3.5+ |
| Writing/editing | Specific fine-tuned |

### Switching Models

- `F2` - Cycle recent models
- `Shift+F2` - Previous recent
- `<leader>M` - Full model picker
- `Ctrl+T` - Cycle variants

---

## Context Management

### Progressive Disclosure

Don't dump everything at once. Start with:
1. What you're trying to do
2. The specific problem
3. Relevant files

Let the AI ask for more if needed.

### Use Comments

Prefix context with comments:
```
// I want to add user authentication to this API
// Key constraint: must work with existing OAuth system
// File: src/api/users.ts

@users.ts
```

---

## Workflow Automation

### Aliases

Add to your shell config:

```bash
# Quick OpenCode shortcuts
alias oc="opencode"
alias occ="opencode run --continue"
alias ocf="opencode run --fork"

# Project-specific
alias oc-api="opencode --dir ./api"
alias oc-web="opencode --dir ./web"
```

### Custom Commands

Create frequently used workflows as slash commands:

```
~/.config/opencode/commands/test-coverage.md
~/.config/opencode/commands/deploy-staging.md
~/.config/opencode/commands/security-scan.md
```

---

## Hidden Gems

### Share Sessions

`/share` creates a shareable URL. Great for:
- Getting help from others
- Sharing interesting conversations
- Code reviews with context

### Export to Markdown

`<leader>X` exports the conversation. Useful for:
- Creating documentation
- Archiving conversations
- Sharing with others

### Copy Messages

`<leader>Y` copies selected messages. Useful for:
- Extracting code snippets
- Sharing specific exchanges
- Creating tickets/issues

### Command Palette

`Ctrl+P` opens the command palette. Quick access to:
- All slash commands
- Agent switching
- Session management
- Settings

---

## Configuration Tips

### Theme Selection

- `<leader>T` opens theme picker
- Many themes available (tokyonight, gruvbox, nord, etc.)
- Desktop app supports more themes than TUI

### Keybind Customization

Don't like defaults? Change them:

```json
{
  "keybinds": {
    "session_new": "ctrl+n",
    "model_cycle_recent": "alt+m",
    "session_compact": "ctrl+shift+c"
  }
}
```

### Enable Powerful Features

Some features are disabled by default:

```json
{
  "keybinds": {
    "session_fork": "<leader>F"
  }
}
```

---

## Troubleshooting

### Shift+Enter Not Working?

Your terminal might not support it. Use `Ctrl+J` instead.

Or configure your terminal:
- **Windows Terminal**: See keyboard-shortcuts.md
- **Kitty**: Add to kitty.conf
- **iTerm2**: Enable in preferences

### Model Not Responding?

- `Escape` to interrupt
- Check API key configuration
- Try a different model

### Session Stuck?

- `Escape` interrupts current operation
- `/clear` for fresh start
- `opencode run --continue` to resume

---

## Advanced Patterns

### Chain Sessions

Build on previous sessions:
```
opencode run --continue  # Resume last
opencode run --fork      # Experiment safely
```

### Batch Operations

Combine with shell scripts:

```bash
#!/bin/bash
for file in src/**/*.ts; do
  opencode run "add tests for $file"
done
```

### MCP Integration

Connect external tools:

```json
{
  "mcp": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp"]
    }
  }
}
```
