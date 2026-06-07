# AI-Assisted Agent Generation

Use this template to generate agent configurations using AI assistance.

## Quick Start

### Step 1: Describe Your Agent

Think about:
- What task should the agent handle?
- Primary (Tab-cycleable) or subagent (delegated)?
- Should it modify files or be read-only?
- What permissions does it need?

### Step 2: Use the Generation Prompt

Send to Opencode:

```
Create an agent configuration: "[YOUR DESCRIPTION]"

Requirements:
1. Determine if this should be primary or subagent
2. Select appropriate model and temperature
3. Configure tool access (write, edit, bash)
4. Set permissions for dangerous operations
5. Write comprehensive system prompt

Return JSON format for agents.json:
{
  "agent-name": {
    "description": "...",
    "mode": "...",
    "model": "...",
    "temperature": ...,
    "prompt": "{file:./prompts/agent-name.txt}",
    "tools": { ... },
    "permission": { ... }
  }
}

Also provide the system prompt content separately.
```

### Step 3: Add to Configuration

**Option A: JSON (recommended)**

Add to `agents.json` or `opencode.json`:

```json
{
  "agent": {
    "your-agent": {
      ...generated config...
    }
  }
}
```

Save system prompt to `prompts/your-agent.txt`.

**Option B: Markdown**

Create `~/.config/opencode/agents/your-agent.md`:

```markdown
---
description: ...
mode: subagent
model: ...
temperature: ...
tools:
  write: false
  edit: false
---

[System prompt content]
```

## Example Requests

### Code Review Agent

```
Create an agent configuration: "I need a subagent that reviews code changes for quality issues, security vulnerabilities, and adherence to best practices. It should be read-only and provide structured feedback with file:line references."
```

### Test Generator Agent

```
Create an agent configuration: "I need a subagent that generates comprehensive unit tests. It should analyze existing code, identify test cases, and create test files following project conventions. Needs write access but should be careful with bash commands."
```

### Planning Agent

```
Create an agent configuration: "I need a primary agent for analysis and planning. It should never modify files, only read and suggest. Use it when investigating issues or designing solutions before implementation."
```

### Security Analyzer

```
Create an agent configuration: "I need a subagent that performs security audits on code. It should identify OWASP vulnerabilities, check auth logic, and provide remediation guidance. Read-only but needs bash for git commands."
```

## Configuration Decisions

### Primary vs Subagent

| Scenario | Mode |
|----------|------|
| Direct user interaction, Tab-cycleable | primary |
| Delegated by other agents via Task tool | subagent |
| User invokes with @ mention | subagent |
| Specialized single-purpose task | subagent |
| General workflow mode | primary |

### Model Selection

| Complexity | Model |
|------------|-------|
| Simple, fast tasks | claude-haiku-4 |
| General tasks (default) | claude-sonnet-4 |
| Complex reasoning | claude-opus-4 |

### Temperature

| Task Type | Temperature |
|-----------|-------------|
| Deterministic analysis | 0.0 - 0.1 |
| Balanced (default) | 0.2 - 0.3 |
| Creative tasks | 0.4 - 0.6 |

### Tool Access

| Agent Purpose | write | edit | bash |
|---------------|-------|------|------|
| Read-only analysis | false | false | true |
| Code generation | true | true | true |
| Documentation | true | true | false |
| Testing/validation | false | false | true |

### Permission Patterns

**Restrictive (read-only):**
```json
"permission": {
  "edit": "deny",
  "bash": {
    "*": "ask",
    "git *": "allow",
    "ls *": "allow",
    "grep *": "allow"
  }
}
```

**Careful writer:**
```json
"permission": {
  "edit": "allow",
  "bash": {
    "*": "allow",
    "rm *": "ask",
    "git push*": "ask",
    "sudo *": "deny"
  }
}
```

## Validation

After creating your agent:

1. Reload opencode or start new session
2. For primary: Tab to cycle to your agent
3. For subagent: Use @ mention or let primary invoke
4. Test typical use cases
5. Verify tool access works as expected

## Tips for Effective Agents

### Be Specific in Requests

**Vague:**
```
"I need an agent that helps with code"
```

**Specific:**
```
"I need a subagent that reviews TypeScript code for type safety issues, checking for proper type annotations, avoiding 'any', and ensuring correct generic usage. Read-only with structured output."
```

### Include Context

```
"Create an agent for this project which uses React and TypeScript. The agent should check for React best practices and TypeScript type safety."
```

### Define Output Expectations

```
"The agent should provide specific recommendations with file:line references and estimated impact."
```

## Iterating on Agents

If the generated agent needs improvement:

1. Identify what's missing or wrong
2. Edit the agent configuration or prompt file
3. Focus on:
   - Better description for triggering
   - More specific process steps
   - Clearer output format
   - Additional edge cases
4. Test again
