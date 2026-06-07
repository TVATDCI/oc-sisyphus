---
name: agent-development
description: "Creates and configures agents for OpenCode (JSON or Markdown format). (1) Use when creating a new agent or adding to agents.json/opencode.json. (2) Use when configuring agent permissions, mode (primary vs subagent), model, or tools. (3) Use when writing agent system prompts, designing agent triggering, or debugging why an agent does/does not fire. Triggers: 'create agent', 'add agent', 'agents.json', 'subagent', 'primary agent', 'agent permissions', 'agent configuration', 'agent prompt', 'configure agent', 'agent triggering', 'new agent', 'agent design spec'. Format choice: JSON for central management, Markdown for per-project. Not for: general skill creation (use skill-creator), tool/plugin development, or one-off task automation."
compatibility: opencode
triggers:
  - "agent requirements"
  - "skill requirements"
  - "design spec"
mode: human-in-loop
inputs:
  - "agent requirements"
  - "skill requirements"
  - "design spec"
outputs:
  - "agent definition"
  - "skill definition"
  - "configuration"
produces_artifacts:
  - "~/.config/opencode/agents/*.md"
  - "~/.config/opencode/skills/*/SKILL.md"
requires_artifacts:
gates:
  - "user approval for design"
metadata:
  version: 1.0.0
  category: authoring
---



# Agent Development for Opencode

## Overview

Agents are specialized AI assistants configured for specific tasks and workflows. Opencode supports two agent types with different configuration formats.

## Identity & Scope

**Purpose:** Create and configure agents for OpenCode, including JSON/markdown formats, permissions, and system prompts.

**Triggers:** "create agent", "add agent", "agents.json", "subagent", "primary agent", "agent permissions", "agent configuration", "agent prompt", "agent requirements", "skill requirements", "design spec"

**Not For:**
- General skill creation (use [[skill-creator]] — that handles SKILL.md files, not agent definitions)
- Tool/plugin development (different domain)
- API-level customization (use opencode-expert skill)
- One-off task automation (agents are for repeatable workflows)

**Entry Criteria:**
- [ ] User has agent requirements (or skill requirements, or design spec)
- [ ] Format preference known (JSON default if not stated)
- [ ] (Optional) Existing agents to integrate with or differentiate from

**Produces:**
- Agent definition in `~/.config/opencode/agents/*.md` (Markdown format) or `opencode.json` / `agents.json` (JSON format)
- Skill definition in `~/.config/opencode/skills/*/SKILL.md` (when scope is skill-level, not agent-level)
- Configuration with permissions, prompts, and model selection

**Next if Approved:**
- Agent ready → user reviews and deploys
- Skill definition ready → handoff to [[skill-creator]] for full skill-creation workflow
- Configuration needs changes → iterate via Validation + Testing

**Skill Usage:**
This skill is invoked via [[skill-creator]] or directly by the user when working on agent definitions. There is no fixed load_skills pattern — it's contextual to the user request.

## Hard Constraints (NEVER/MUST)

- **Design principles are mandatory** — all 7 principles (deep modules, vertical slices, feedback loops, TDD, human-in-the-loop, skill activation, context efficiency) must inform every agent design
- **Vertical slices over horizontal layers** — never produce an agent that builds layer-by-layer; slices must cut through all system layers
- **TDD for AI quality** — agents must enforce failing-test-first; process evidence (test logs) required, not just final code
- **Human-in-the-loop for planning and QA** — agents may not auto-iterate past planning or QA gates
- **Format preference before configuration** — ask user about JSON vs Markdown format; default to JSON if no preference
- **Built-in agents list is non-exhaustive** — `build`, `plan`, `general`, `explore` are examples; consult current opencode docs for full list
- **Two config formats only** — JSON (central management) or Markdown (per-project/per-skill); no other formats
- **Subagent vs primary distinction is structural** — primary agents are direct interaction; subagents are delegated; never use a subagent definition as a primary
- **Validation before deployment** — every agent definition must pass [[#Validation]] before deployment
- **Boundary: do not auto-deploy** — agent definitions are output, not self-executing; user must approve
- **NEVER execute agent configurations or test agent behavior** — execution is for `archivist` agent or user action
- **NEVER validate existing agent definitions** — use `vault-lint` skill or `auditor` agent for validation
- **NEVER modify AGENTS.md schema or conventions** — discuss schema changes with user first; AGENTS.md is the canonical reference
- **NEVER create new skill files** — this skill is for AGENT development; use `skill-creator` for creating/editing skills
- **NEVER write implementation code for agents** — this skill designs agent definitions and prompts; code implementation is `archivist` domain
- **NEVER commit or push agent changes** — git operations are `git-commit-message` skill or user action
- **MUST explicitly set the mode field** — always declare `mode` as `primary` or `subagent`; avoid relying on defaults
- **MUST have a description field** — description is required and critical for subagent triggering
- **MUST keep system prompts under 10,000 characters** — brevity is essential for context efficiency
- **MUST use second person in prompts** — "You are...", "You will...", not first person
- **MUST use numbered lists for responsibilities** — not bullet points, per standard structure

## Core Workflow (Summary)

The 6-stage agent creation pipeline — see `## Detailed Stages` below for per-stage procedures.
1. **Capture Intent** — What is this agent for? Primary or subagent? Format preference? What existing agents/skill overlap?
2. **Choose Format** — JSON (central management, version control friendly) or Markdown (per-project, quick prototyping); default to JSON
3. **Define Structure** — name, description, model, prompt, tools/permissions, mode
4. **Configure Permissions** — Allow/deny/ask tiers for tools; deny destructive commands; allow only what's needed
5. **Write System Prompt** — Cross-cutting principles, role definition, output format, examples
6. **Validate + Test** — Verify the agent triggers on expected inputs, doesn't trigger on unrelated inputs, follows the system prompt

**Optional:** Description optimization (description field is the agent's triggering contract — must be specific and contain relevant keywords).

## Tool Usage

- **Read tools**: Use to inspect existing agent files, configuration files, prompt templates, and reference examples
- **Write tools**: Use to create new agent definition files (`*.md` in `agents/`, JSON config entries), prompt template files
- **Bash tools**: Use for syntax validation (`python3 -c "import json; ..."`), listing agent directories, copying templates
- **Question tool**: Use when user request is ambiguous about agent scope, permissions, or mode (primary vs subagent)
- **Task tool**: Use to delegate validation to `auditor` agent after creating agent definitions

## Boundaries

- **Do NOT execute agent configurations or test agent behavior** — execution is for `archivist` agent or user action
- **Do NOT validate existing agent definitions** — use `vault-lint` skill or `auditor` agent for validation
- **Do NOT modify AGENTS.md schema or conventions** — discuss schema changes with user first; AGENTS.md is the canonical reference
- **Do NOT create new skill files** — this skill is for AGENT development; use `skill-creator` for creating/editing skills
- **Do NOT write implementation code for agents** — this skill designs agent definitions and prompts; code implementation is `archivist` domain
- **Do NOT commit or push agent changes** — git operations are `git-commit-message` skill or user action

## Design Principles (cross-cutting methodology)

When configuring agents for development workflows, enforce these principles:

1. **Deep Modules Over Shallow Modules**
   - Small interfaces, large implementations
   - Test boundaries around modules, not individual functions
   - Avoid many tiny files with trivial exports

2. **Vertical Slices Over Horizontal Layers**
   - Implement end-to-end features, not layer-by-layer
   - Each slice cuts through all system layers (schema → API → frontend → tests)
   - Exception: enabling slices (foundational infrastructure) and legacy characterization

3. **Feedback Loops Determine AI Quality Ceiling**
   - Tests, type checking, and linting are mandatory
   - The quality of these feedback loops determines how good AI output can be
   - Invest in test infrastructure before scaling AI implementation

4. **TDD Prevents AI From "Cheating"**
   - Write failing test BEFORE implementation (red phase)
   - Implement to make test pass (green phase)
   - Refactor with passing tests (refactor phase)
   - Process evidence (test logs) required — final code alone is insufficient

5. **Human-in-the-Loop for Planning and QA, AFK for Execution**
    - Planning (grill-me, PRD review): human must be present
    - Implementation (clear slices, bounded scope): can run AFK
    - QA (taste checks, UI review, architectural decisions): human must review

6. **Skill Activation as Expert Procedural Guidance**
    - When a skill is loaded, treat its `<instructions>` as expert procedural guidance
    - Prioritize specialized skill rules over general defaults when skill is active
    - Track active skill context to prevent skill context bleeding between tasks
    - Use `<activated_skill>` convention to mark which skill context is active
    - When multiple skills are relevant, explicitly note which skill rules take precedence

7. **Context Efficiency**
    - Context window is the most precious resource — manage it explicitly
    - First slice establishes minimal viable context — don't over-read
    - Reuse established context in subsequent slices — don't re-read files already understood
    - Archive completed slice evidence to free context for next work

### Agent Types

| Type | Description | Invocation |
|------|-------------|------------|
| **Primary** | Main assistants for direct interaction | Tab key to cycle, or configured keybind |
| **Subagent** | Specialized assistants for delegated tasks | Automatically by primary agents, or @ mention |

**Built-in agents:**
- `build` (primary) - Full development with all tools enabled
- `plan` (primary) - Analysis/planning with edit/bash requiring approval
- `general` (subagent) - Multi-step tasks with full tool access
- `explore` (subagent) - Fast, read-only codebase exploration

### Configuration Formats

Agents can be defined in two formats. Ask the user which format they prefer; default to **JSON** if no preference stated.

**Format 1: JSON** (recommended for central management)
- In `opencode.json` under the `agent` key
- Or standalone `agents.json` file
- Best for: version control, Nix flake consumption, central configuration

**Format 2: Markdown** (for quick addition)
- Global: `~/.config/opencode/agents/*.md`
- Per-project: `.opencode/agents/*.md`
- Best for: project-specific agents, quick prototyping

## Configuration Options

### description (required)

Defines when Opencode should use this agent. Critical for subagent triggering.

```json
"description": "Reviews code for best practices and security issues"
```

### mode

Controls how the agent can be used.

| Value | Behavior |
|-------|----------|
| `primary` | Directly accessible via Tab cycling |
| `subagent` | Invoked by Task tool or @ mention |
| `all` | Both (default if omitted) |

```json
"mode": "primary"
```

**IMPORTANT**: Always explicitly set the `mode` field for clarity:
- Primary agents: `"mode": "primary"`
- Subagents: `"mode": "subagent"`
- Avoid relying on defaults; explicit declaration makes intent clear and follows best practices

### model

Override the model for this agent. Format: `provider/model-id`.

```json
"model": "anthropic/claude-sonnet-4-20250514"
```

If omitted: primary agents use globally configured model; subagents inherit from invoking primary agent.

### prompt

System prompt defining agent behavior. Can be inline or file reference.

**Inline:**
```json
"prompt": "You are an expert code reviewer..."
```

**File reference:**
```json
"prompt": "{file:./prompts/agent-name.txt}"
```

File paths are relative to the config file location.

### temperature

Control response randomness (0.0 - 1.0).

| Range | Use Case |
|-------|----------|
| 0.0-0.2 | Focused, deterministic (code analysis, planning, research) |
| 0.3-0.5 | Balanced (general development, writing) |
| 0.6-1.0 | Creative (brainstorming, ideation) |

```json
"temperature": 0.1
```

**RECOMMENDATIONS BY AGENT TYPE:**
- **Research/Analysis**: 0.0-0.2 (focused, deterministic, consistent results)
- **Code Generation**: 0.1-0.3 (precise but allows slight creativity)
- **Code Review**: 0.0-0.2 (strict adherence to patterns)
- **Brainstorming/Creative**: 0.6-1.0 (explore many options)
- **General Purpose**: 0.3-0.5 (balanced approach)

### maxSteps

Limit agentic iterations before forcing text-only response.

```json
"maxSteps": 10
```

### tools

Control which tools are available. Boolean to enable/disable, or object for granular control.

**Disable specific tools:**
```json
"tools": {
  "write": false,
  "edit": false,
  "bash": false
}
```

**Wildcard for MCP tools:**
```json
"tools": {
  "mymcp_*": false
}
```

### hidden

Hide subagent from @ autocomplete menu. Agent can still be invoked via Task tool.

```json
"hidden": true
```

### disable

Disable the agent entirely.

```json
"disable": true
```

## Permissions System

Permissions control what actions require approval. Each rule resolves to:
- `"allow"` - Run without approval
- `"ask"` - Prompt for approval
- `"deny"` - Block the action

### Permission Types

| Permission | Matches Against |
|------------|-----------------|
| `read` | File path |
| `edit` | File path (covers edit, write, patch, multiedit) |
| `bash` | Parsed command |
| `task` | Subagent type |
| `external_directory` | Paths outside project |
| `doom_loop` | Repeated identical tool calls |

### Simple Permissions

```json
"permission": {
  "edit": "ask",
  "bash": "ask"
}
```

### Granular Permissions with Glob Patterns

Rules evaluated in order; **last matching rule wins**.

```json
"permission": {
  "read": {
    "*": "allow",
    "*.env": "deny",
    "*.env.*": "deny",
    "*.env.example": "allow"
  },
  "bash": {
    "*": "ask",
    "git status*": "allow",
    "git log*": "allow",
    "git diff*": "allow",
    "rm *": "ask",
    "sudo *": "deny"
  },
  "edit": "allow",
  "external_directory": "ask",
  "doom_loop": "ask"
}
```

### Task Permissions (Subagent Control)

Control which subagents an agent can invoke via Task tool.

```json
"permission": {
  "task": {
    "*": "deny",
    "code-reviewer": "allow",
    "test-generator": "ask"
  }
}
```

## Quick Reference

### JSON Agent Template

```json
{
  "my-agent": {
    "description": "What this agent does and when to use it",
    "mode": "subagent",
    "model": "anthropic/claude-sonnet-4-20250514",
    "prompt": "{file:./prompts/my-agent.txt}",
    "tools": {
      "write": false,
      "edit": false
    }
  }
}
```

### Markdown Agent Template

```markdown
---
description: What this agent does and when to use it
mode: subagent
model: anthropic/claude-sonnet-4-20250514
tools:
  write: false
  edit: false
---

You are an expert [role]...
```

### Configuration Options Summary

| Option | Required | Type | Default |
|--------|----------|------|---------|
| description | Yes | string | - |
| mode | No | primary/subagent/all | all |
| model | No | string | inherited |
| prompt | No | string | - |
| temperature | No | number | model default |
| maxSteps | No | number | unlimited |
| tools | No | object/boolean | all enabled |
| permission | No | object | allow |
| hidden | No | boolean | false |
| disable | No | boolean | false |

## Validation

Validate agent configuration:

```bash
# Validate agents.json
python3 -c "import json; json.load(open('agents.json'))"
```

## Testing

1. Reload opencode or start new session
2. For primary agents: use Tab to cycle
3. For subagents: use @ mention or let primary agent invoke via Task tool
4. Verify expected behavior and tool access

## Additional Resources

- **System prompt patterns**: See `references/system-prompt-design.md`
- **Triggering examples**: See `references/triggering-examples.md`
- **AI-assisted generation**: See `examples/agent-creation-prompt.md`
- **Complete examples**: See `examples/complete-agent-examples.md`
- **Real-world JSON example**: See `references/opencode-agents-json-example.md`

---

## Detailed Stages

### JSON Agent Structure

#### In opencode.json

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "agent-name": {
      "description": "When to use this agent",
      "mode": "primary",
      "model": "provider/model-id",
      "prompt": "{file:./prompts/agent-name.txt}",
      "permission": { ... },
      "tools": { ... }
    }
  }
}
```

#### Standalone agents.json

```json
{
  "agent-name": {
    "description": "When to use this agent",
    "mode": "subagent",
    "model": "anthropic/claude-sonnet-4-20250514",
    "prompt": "You are an expert...",
    "tools": {
      "write": false,
      "edit": false
    }
  }
}
```

### Markdown Agent Structure

File: `~/.config/opencode/agents/agent-name.md` or `.opencode/agents/agent-name.md`

```markdown
---
description: When to use this agent
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.1
tools:
  write: false
  edit: false
  bash: false
permission:
  bash:
    "*": ask
    "git diff": allow
---

You are an expert [role]...

**Your Core Responsibilities:**
1. [Responsibility 1]
2. [Responsibility 2]
```

The filename becomes the agent name (e.g., `review.md` → `review` agent).

### Complete JSON Example

```json
{
  "chiron": {
    "description": "Personal AI assistant (Plan Mode). Read-only analysis and planning.",
    "mode": "primary",
    "model": "anthropic/claude-sonnet-4-20250514",
    "prompt": "{file:./prompts/chiron.txt}",
    "permission": {
      "read": {
        "*": "allow",
        "*.env": "deny",
        "*.env.*": "deny",
        "*.env.example": "allow",
        "*/.ssh/*": "deny",
        "*credentials*": "deny"
      },
      "edit": "ask",
      "bash": "ask",
      "external_directory": "ask"
    }
  },
  "chiron-forge": {
    "description": "Personal AI assistant (Worker Mode). Full write access.",
    "mode": "primary",
    "model": "anthropic/claude-sonnet-4-20250514",
    "prompt": "{file:./prompts/chiron-forge.txt}",
    "permission": {
      "read": {
        "*": "allow",
        "*.env": "deny"
      },
      "edit": "allow",
      "bash": {
        "*": "allow",
        "rm *": "ask",
        "git push *": "ask",
        "sudo *": "deny"
      }
    }
  },
  "code-reviewer": {
    "description": "Reviews code for quality, security, and best practices",
    "mode": "subagent",
    "model": "anthropic/claude-sonnet-4-20250514",
    "temperature": 0.1,
    "tools": {
      "write": false,
      "edit": false
    },
    "prompt": "You are an expert code reviewer..."
  }
}
```

### System Prompt Design

Write prompts in second person, addressing the agent directly.

#### Standard Structure

```
You are [role] specializing in [domain].

**Your Core Responsibilities:**  ← USE THIS EXACT HEADER
1. [Primary responsibility]
2. [Secondary responsibility]
3. [Additional responsibilities]

**Process:**
1. [Step one]
2. [Step two]
3. [Continue with clear steps]

**Quality Standards:**
- [Standard 1]
- [Standard 2]

**Output Format:**
[What to include and how to structure]

**Edge Cases:**
- [Edge case 1]: [How to handle]
- [Edge case 2]: [How to handle]
```

**IMPORTANT**: Use exact section headers for consistency:
- Use "Your Core Responsibilities:" (not "capabilities", "duties", etc.)
- Use "Process:" for step-by-step workflows
- Use "Quality Standards:" for evaluation criteria
- Use "Output Format:" for response structure
- Use "Edge Cases:" for exception handling

#### Prompt File Convention

Store prompts in a `prompts/` directory with `.txt` extension:
- `prompts/agent-name.txt`

Reference in config:
```json
"prompt": "{file:./prompts/agent-name.txt}"
```

#### Edge Cases

- **Ambiguous agent scope**: Ask user to clarify — primary vs subagent, read-only vs execution, specific domain vs general
- **Missing prompt file reference**: If user references `{file:./prompts/...}` but file doesn't exist, ask user to create prompt or use inline prompt
- **Permission conflicts**: If user requests permissions that conflict with agent's role (e.g., write access for read-only agent), explain tradeoffs and ask for confirmation
- **Existing agent name collision**: If proposed agent name conflicts with existing agent, suggest alternative or ask if overwrite intended
- **Template ambiguity**: If user wants custom format not covered by JSON/Markdown examples, ask which format they prefer

### Best Practices

**DO:**
- Use second person ("You are...", "You will...")
- Be specific about responsibilities
- Use numbered lists for responsibilities (1, 2, 3) - not bullet points
- Provide step-by-step processes
- Define output format
- Include quality standards
- Address edge cases
- Keep under 10,000 characters
- Keep section names consistent with standard structure, but adapt if semantically equivalent (e.g., "Ethical Guidelines" vs "Quality Standards" for research agents)

**DON'T:**
- Write in first person
- Be vague or generic
- Omit process steps
- Leave output format undefined

### Creating Agents

#### Method 1: Opencode CLI (Interactive)

```bash
opencode agent create
```

Prompts for: location, description, tools, then generates the agent file.

#### Method 2: JSON Configuration

1. Add agent to `opencode.json` or `agents.json`
2. Create prompt file in `prompts/` directory
3. Validate with: `python3 -c "import json; json.load(open('agents.json'))"` for syntax check

#### Method 3: Markdown File

1. Create `~/.config/opencode/agents/agent-name.md` or `.opencode/agents/agent-name.md`
2. Add frontmatter with configuration
3. Write system prompt as markdown body