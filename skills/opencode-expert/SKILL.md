---
name: opencode-expert
compatibility: opencode
description: "OpenCode power-user skill for interactive usage questions. Covers keyboard shortcuts, agent modes, session management, basic configuration, and skill system. Use when asked about opencode features, how to do X in opencode, shortcuts, commands, agents, sessions, skills, or MCP setup. For CI/CD, automation, permission hardening, or config debugging, see references/automation-ci.md and references/troubleshooting.md."
triggers:
  - "opencode question"
  - "how to use opencode"
  - "opencode shortcut"
  - "opencode command"
  - "opencode agent"
  - "opencode session"
  - "opencode config"
  - "opencode skill"
  - "opencode mcp"
mode: human-in-loop
inputs:
  - "opencode question"
  - "configuration issue"
  - "feature request"
outputs:
  - "opencode guidance"
  - "configuration advice"
  - "troubleshooting steps"
produces_artifacts:
  - "references consulted"
requires_artifacts:
gates:
  - "clarify user intent if ambiguous"
metadata:
  version: 2.0.0
  category: reference
  last_verified: 2026-04-30
---

# OpenCode Expert

Your guide to mastering OpenCode. This skill routes you to the right reference material based on your question.

## When to Use This Skill

| Question Type | Reference |
|---------------|-----------|
| Shortcuts, navigation, TUI controls | references/keyboard-shortcuts.md |
| Slash commands, custom commands | references/commands.md |
| Agent modes, custom agents, permissions | references/agents.md |
| Session management (create, continue, export, share) | This file — Session Management |
| Configuration, hidden flags, precedence, team setup | references/configuration-deep-dive.md |
| Permission patterns, safe defaults, wildcards | references/permission-patterns.md |
| CI/CD, headless mode, GitHub Actions, automation | references/automation-ci.md |
| Hanging commands, config not loading, disk space | references/troubleshooting.md |
| Skills, MCP, tips & tricks | This file — Skills & MCP |

---

## Safety Warnings

### Non-Interactive Shell
OpenCode's shell is **non-interactive**. These commands will **hang**:
- `vim`, `nano`, `less`, `more`, `man`
- `git commit` (use `git commit -m "msg"`)
- `npm init` (use `npm init -y`)
- `git add -p`, `git rebase -i`

### Config Precedence Bugs
- `.opencode/` parent directories override child configs (inverted)
- `OPENCODE_CONFIG_CONTENT` is NOT highest priority (`.opencode/` overrides it)
- See references/configuration-deep-dive.md for workarounds

### Disk Space
`snapshot: true` (default) can consume 100GB+. Disable with:
```json
{ "snapshot": false }
```

---

## Quick Reference Card

```
<leader> = Ctrl+X (default)

SESSIONS
  <leader>N  New        <leader>L  List
  <leader>C  Compact    <leader>G  Timeline
  <leader>X  Export     <leader>S  Share

NAVIGATION
  Ctrl+P     Command palette
  Tab        Cycle agents
  F2         Cycle models
  Ctrl+T     Cycle model variants

AGENTS
  plan       Analysis, no edits
  build      Coding, full tools
  @explore   Read-only search
  @general   Multi-step tasks

Plan first (Tab to plan), review, then build (Tab to build).
```

---

## Session Management

### Basic Commands

| Action | Command | Shortcut |
|--------|---------|----------|
| New session | `opencode run` | `<leader>N` |
| List sessions | `opencode session list` | `<leader>L` |
| Continue last | `opencode run --continue` | |
| Continue specific | `opencode run -s SESSION_ID` | |
| Fork session | `opencode run --fork` | |
| Export | `opencode export` | `<leader>X` |
| Share | `/share` | `<leader>S` |

### Subagent Navigation

When subagents create child sessions:
- `<leader>down` — Enter first child session
- `right` / `left` — Cycle child sessions
- `up` — Return to parent

### Context Management

- **Compact** (`<leader>C`): Collapse old context to save tokens
- **Undo** (`<leader>U`): Undo last message (reverts file changes too)
- **Redo** (`<leader>R`): Redo undone message
- **Timeline** (`<leader>G`): Browse session history

---

## Skills System

### What Are Skills?

Reusable instruction bundles agents load on-demand. Unlike commands (single tasks), skills teach general expertise.

### Skill Discovery

Searched in order:
1. `.opencode/skills/*/SKILL.md` (project)
2. `~/.config/opencode/skills/*/SKILL.md` (global)
3. `.claude/skills/*/SKILL.md` (Claude-compatible)

### SKILL.md Format

```markdown
---
name: my-skill
description: When to trigger and what it does
---

Instructions...
```

### Loading Skills

Agents call: `skill({ name: "my-skill" })`

---

## MCP Integration

MCP connects OpenCode to external tools.

### Quick Config

```json
{
  "mcp": {
    "context7": {
      "command": ["npx", "-y", "@context7/mcp"]
    }
  }
}
```

### Environment Variables

```json
{
  "mcp": {
    "stripe": {
      "environment": {
        "STRIPE_SECRET_KEY": "{env:STRIPE_SECRET_KEY}"
      }
    }
  }
}
```

---

## Integration with Other Skills

This skill is the primary reference guide for OpenCode-specific questions:

```
User question about OpenCode
  ↓
[Route based on topic]
  ↓
opencode-expert → references/*.md files
OR
athena-research → external research
```

**When to use this skill vs others:**

| Question Type | Use This Skill | Use Other Skills |
|---------------|----------------|------------------|
| OpenCode shortcuts, commands | ✅ **opencode-expert** | - |
| Agent configuration, modes | ✅ **opencode-expert** | - |
| Session management | ✅ **opencode-expert** | - |
| Skills system, MCP setup | ✅ **opencode-expert** | - |
| Config, permissions | ✅ **opencode-expert** | - |
| CI/CD, automation | ✅ **opencode-expert** (points to automation-ci.md) | - |
| Troubleshooting hangs, errors | ✅ **opencode-expert** (points to troubleshooting.md) | - |
| External library questions | - | **athena-research** |
| General coding questions | - | **athena-research** |
| Codebase exploration | - | **explore** subagent |
| Implementation work | - | **build** agent |

**Routing logic:**
- **opencode-expert**: OpenCode-specific features, configuration, usage
- **athena-research**: External libraries, general programming, research

**Integration with references/:**
This skill loads reference files progressively:
- `references/keyboard-shortcuts.md` — navigation
- `references/commands.md` — slash commands
- `references/agents.md` — agent configuration
- `references/configuration-deep-dive.md` — config details
- `references/permission-patterns.md` — permissions
- `references/automation-ci.md` — CI/CD
- `references/troubleshooting.md` — known issues

## For Detailed Reference

| Topic | File |
|-------|------|
| All keyboard shortcuts | references/keyboard-shortcuts.md |
| All slash commands | references/commands.md |
| Agent modes & creation | references/agents.md |
| Config deep dive, hidden flags, team setup | references/configuration-deep-dive.md |
| Permission patterns & safe defaults | references/permission-patterns.md |
| CI/CD, headless, automation | references/automation-ci.md |
| Troubleshooting known issues | references/troubleshooting.md |

> Last verified: 2026-04-30
