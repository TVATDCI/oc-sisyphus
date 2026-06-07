# Agent Triggering in Opencode

Understanding how agents are triggered and invoked in Opencode.

## Triggering Mechanisms

### Primary Agents

Primary agents are directly accessible to users:

| Method | Description |
|--------|-------------|
| **Tab key** | Cycle through primary agents |
| **Keybind** | Use configured `switch_agent` keybind |
| **@ mention** | Type `@agent-name` in message |
| **default_agent** | Set in config to start with specific agent |

### Subagents

Subagents are invoked indirectly:

| Method | Description |
|--------|-------------|
| **Task tool** | Primary agent delegates via Task tool |
| **@ mention** | User manually types `@agent-name` |
| **Automatic** | Based on description matching user intent |

## The Description Field

The `description` field is critical for subagent triggering. When a primary agent receives a request, it evaluates subagent descriptions to decide whether to delegate.

### Good Descriptions

**Clear purpose and triggers:**
```json
"description": "Reviews code for quality, security, and best practices. Use when reviewing PRs, after implementing features, or before commits."
```

**Specific use cases:**
```json
"description": "Generates comprehensive unit tests for code. Use after implementing new functions or when improving test coverage."
```

**Domain-specific:**
```json
"description": "Analyzes authentication and authorization code for security vulnerabilities. Use when reviewing auth flows, JWT handling, or session management."
```

### Poor Descriptions

**Too vague:**
```json
"description": "Helps with code"
```

**No trigger conditions:**
```json
"description": "A code review agent"
```

**Too broad:**
```json
"description": "Handles all development tasks"
```

## Triggering Patterns

### Pattern 1: Explicit Delegation

Primary agent explicitly invokes subagent via Task tool:

```
User: "Review my authentication code"

Primary Agent (internal): This matches "code-reviewer" description about 
"reviewing auth flows". Invoke via Task tool.

→ Task tool invokes code-reviewer subagent
```

### Pattern 2: @ Mention

User directly invokes subagent:

```
User: "@security-analyzer check this endpoint for vulnerabilities"

→ security-analyzer subagent is invoked directly
```

### Pattern 3: Automatic Context

Primary agent recognizes pattern from description:

```
User: "I just implemented the payment processing feature"

Primary Agent: Description mentions "after implementing features" and 
"security-critical code (auth, payments)". Consider delegating to 
security-analyzer or code-reviewer.
```

## Task Tool Invocation

When a primary agent invokes a subagent, it uses the Task tool:

```json
{
  "tool": "task",
  "parameters": {
    "subagent_type": "code-reviewer",
    "prompt": "Review the authentication code in src/auth/...",
    "description": "Code review for auth implementation"
  }
}
```

### Task Permissions

Control which subagents an agent can invoke:

```json
{
  "orchestrator": {
    "permission": {
      "task": {
        "*": "deny",
        "code-reviewer": "allow",
        "security-analyzer": "ask"
      }
    }
  }
}
```

- `"allow"`: Invoke without approval
- `"ask"`: Prompt user for approval
- `"deny"`: Remove from Task tool (agent can't see it)

**Note:** Users can still @ mention any subagent, regardless of task permissions.

## Hidden Subagents

Hide subagents from @ autocomplete while still allowing Task tool invocation:

```json
{
  "internal-helper": {
    "mode": "subagent",
    "hidden": true
  }
}
```

Use cases:
- Internal processing agents
- Agents only invoked programmatically
- Specialized helpers not meant for direct user access

## Navigation Between Sessions

When subagents create child sessions:

| Keybind | Action |
|---------|--------|
| `<Leader>+Right` | Cycle forward: parent → child1 → child2 → parent |
| `<Leader>+Left` | Cycle backward |

This allows seamless switching between main conversation and subagent work.

## Description Best Practices

### Include Trigger Conditions

```json
"description": "Use when [condition 1], [condition 2], or [condition 3]."
```

### Be Specific About Domain

```json
"description": "Analyzes [specific domain] for [specific purpose]."
```

### Mention Key Actions

```json
"description": "[What it does]. Invoke after [action] or when [situation]."
```

### Complete Example

```json
{
  "code-reviewer": {
    "description": "Reviews code for quality issues, security vulnerabilities, and best practice violations. Use when: (1) reviewing pull requests, (2) after implementing new features, (3) before committing changes, (4) when asked to check code quality. Provides structured feedback with file:line references.",
    "mode": "subagent"
  }
}
```

## Debugging Triggering Issues

### Agent Not Triggering

Check:
1. Description contains relevant keywords
2. Mode is set correctly (subagent for Task tool)
3. Agent is not disabled
4. Task permissions allow invocation

### Agent Triggers Too Often

Check:
1. Description is too broad
2. Overlaps with other agent descriptions
3. Consider more specific trigger conditions

### Wrong Agent Triggers

Check:
1. Descriptions are distinct between agents
2. Add negative conditions ("NOT for...")
3. Specify exact scenarios in description
