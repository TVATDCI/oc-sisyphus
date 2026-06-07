# Agent Modes Reference

Agents are specialized AI assistants for different tasks.

## Built-in Agents

| Agent | Mode | Best For |
|-------|------|----------|
| `build` | primary | General coding, implementation |
| `plan` | primary | Analysis, planning, design |
| `explore` | subagent | Understanding codebases |
| `general` | primary | General assistance |

### Primary vs Subagent

- **Primary agents**: Main conversation agents. You interact directly with them.
- **Subagents**: Spawned for specific tasks. Run in parallel, can be cycled through.

---

## Switching Agents

### During a Session

| Method | How |
|--------|-----|
| Cycle forward | `Tab` |
| Cycle backward | `Shift+Tab` |
| Picker menu | `<leader>A` |
| Command | `/agent plan` |

### Via Slash Command

```
/agent plan
/agent build
/agent explore
```

---

## The Plan → Build Loop

**Recommended workflow for complex tasks:**

### 1. Plan First

Start with the `plan` agent:
- Analyze the requirements
- Break down the work
- Propose an approach
- Identify risks and considerations

### 2. Review and Approve

As a human, you:
- Review the proposed plan
- Ask questions or request changes
- Approve or modify the approach

### 3. Build

Switch to `build` agent:
- Implement the approved plan
- Ask clarifying questions if needed
- Make incremental changes

### 4. Iterate

For larger tasks, repeat:
- Switch back to `plan` for next phase
- Review
- Switch to `build`
- Continue until done

---

## Custom Agents

### Creating Custom Agents

**File location:** `.opencode/agents/` or `~/.config/opencode/agents/`

**File format:** `my-agent.md`

```markdown
---
description: What this agent specializes in
mode: subagent  # primary, subagent, or all
model: anthropic/claude-sonnet-4-20250514
temperature: 0.0
---

You are [name]. Your role is to:

1. Specific capability 1
2. Specific capability 2
3. Specific capability 3

Guidelines:
- When to use this approach
- What to focus on
- What to avoid
```

### Agent Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `description` | string | Shown in agent picker |
| `mode` | enum | `primary`, `subagent`, or `all` |
| `model` | string | Specific model to use |
| `temperature` | number | 0.0-1.0 for creativity |
| `color` | string | UI color for this agent |

### Mode Explained

```yaml
mode: primary   # Can be used as main conversation agent
mode: subagent  # Only for spawned tasks
mode: all       # Both roles
```

---

## Agent Permissions

Control what agents can access.

### Permission Types

| Permission | Controls |
|------------|----------|
| `skill` | Skill loading |
| `tool` | Tool usage |

### Permission Values

| Value | Behavior |
|-------|----------|
| `allow` | Immediate access |
| `deny` | Hidden, no access |
| `ask` | User approval required |

### Example Configuration

```json
{
  "agent": {
    "plan": {
      "permission": {
        "skill": {
          "internal-*": "allow"
        },
        "tool": {
          "browser": "ask"
        }
      }
    }
  }
}
```

Or in agent markdown:

```yaml
---
permission:
  skill:
    "documents-*": "allow"
    "experimental-*": "ask"
---

You are a documentation agent...
```

---

## Disabling Skills for Agents

Prevent an agent from using skills:

```json
{
  "agent": {
    "simple-helper": {
      "tools": {
        "skill": false
      }
    }
  }
}
```

Or in markdown:

```yaml
---
tools:
  skill: false
---

You are a simple helper that doesn't use skills...
```

---

## Default Agent

Set the default agent in `opencode.json`:

```json
{
  "default_agent": "plan"
}
```

---

## Agent Workflow Examples

### Code Review Workflow

```markdown
---
description: Reviews code for quality
mode: subagent
tools:
  skill: false
---

You are a code reviewer. Analyze the provided code for:
1. Security vulnerabilities
2. Performance issues
3. Code quality and style
4. Potential bugs

Report findings clearly with severity levels.
```

### Documentation Agent

```markdown
---
description: Generates documentation
mode: subagent
---

You are a technical writer. Create clear documentation that includes:
- Overview and purpose
- Usage examples
- API reference (if applicable)
- Troubleshooting tips
```

---

## Subagent Commands

| Command | Action |
|---------|--------|
| `<leader>↓` | Enter first subagent |
| `→` | Cycle to next subagent |
| `←` | Cycle to previous subagent |
| `↑` | Return to parent session |

### Viewing Subagent Output

When multiple subagents run, use arrow keys to cycle between them and review each one's output independently.
