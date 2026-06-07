# Complete agents.json Example

This is a production-ready example based on real-world Opencode configurations.

## Dual-Mode Personal Assistant

This pattern implements the same assistant in two modes: Plan (read-only analysis) and Forge (full write access).

```json
{
  "chiron": {
    "description": "Personal AI assistant (Plan Mode). Read-only analysis, planning, and guidance.",
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
        "*/.gnupg/*": "deny",
        "*credentials*": "deny",
        "*secrets*": "deny",
        "*.pem": "deny",
        "*.key": "deny",
        "*/.aws/*": "deny",
        "*/.kube/*": "deny"
      },
      "edit": "ask",
      "bash": "ask",
      "external_directory": "ask",
      "doom_loop": "ask"
    }
  },
  "chiron-forge": {
    "description": "Personal AI assistant (Worker Mode). Full write access with safety prompts.",
    "mode": "primary",
    "model": "anthropic/claude-sonnet-4-20250514",
    "prompt": "{file:./prompts/chiron-forge.txt}",
    "permission": {
      "read": {
        "*": "allow",
        "*.env": "deny",
        "*.env.*": "deny",
        "*.env.example": "allow",
        "*/.ssh/*": "deny",
        "*/.gnupg/*": "deny",
        "*credentials*": "deny",
        "*secrets*": "deny",
        "*.pem": "deny",
        "*.key": "deny",
        "*/.aws/*": "deny",
        "*/.kube/*": "deny"
      },
      "edit": "allow",
      "bash": {
        "*": "allow",
        "rm *": "ask",
        "rmdir *": "ask",
        "mv *": "ask",
        "chmod *": "ask",
        "chown *": "ask",
        "git *": "ask",
        "git status*": "allow",
        "git log*": "allow",
        "git diff*": "allow",
        "git branch*": "allow",
        "git show*": "allow",
        "git stash list*": "allow",
        "git remote -v": "allow",
        "git add *": "allow",
        "git commit *": "allow",
        "npm *": "ask",
        "npx *": "ask",
        "pip *": "ask",
        "cargo *": "ask",
        "dd *": "deny",
        "mkfs*": "deny",
        "sudo *": "deny",
        "su *": "deny",
        "systemctl *": "deny",
        "shutdown *": "deny",
        "reboot*": "deny"
      },
      "external_directory": "ask",
      "doom_loop": "ask"
    }
  }
}
```

## Multi-Agent Development Workflow

This pattern shows specialized agents for a development workflow.

```json
{
  "build": {
    "description": "Full development with all tools enabled",
    "mode": "primary",
    "model": "anthropic/claude-opus-4-20250514",
    "temperature": 0.3,
    "tools": {
      "write": true,
      "edit": true,
      "bash": true
    }
  },
  
  "plan": {
    "description": "Analysis and planning without making changes",
    "mode": "primary",
    "model": "anthropic/claude-opus-4-20250514",
    "temperature": 0.1,
    "tools": {
      "write": false,
      "edit": false,
      "bash": true
    }
  },
  
  "code-reviewer": {
    "description": "Reviews code for quality, security, and best practices",
    "mode": "subagent",
    "model": "anthropic/claude-sonnet-4-20250514",
    "temperature": 0.1,
    "prompt": "{file:./prompts/code-reviewer.txt}",
    "tools": {
      "write": false,
      "edit": false,
      "bash": false
    }
  },
  
  "test-generator": {
    "description": "Generates comprehensive unit tests for code",
    "mode": "subagent",
    "model": "anthropic/claude-sonnet-4-20250514",
    "temperature": 0.2,
    "prompt": "{file:./prompts/test-generator.txt}",
    "tools": {
      "write": true,
      "edit": true,
      "bash": true
    }
  },
  
  "security-analyzer": {
    "description": "Identifies security vulnerabilities and provides remediation",
    "mode": "subagent",
    "model": "anthropic/claude-sonnet-4-20250514",
    "temperature": 0.1,
    "prompt": "{file:./prompts/security-analyzer.txt}",
    "tools": {
      "write": false,
      "edit": false,
      "bash": true
    }
  },
  
  "docs-writer": {
    "description": "Writes and maintains project documentation",
    "mode": "subagent",
    "model": "anthropic/claude-haiku-4-20250514",
    "temperature": 0.3,
    "prompt": "{file:./prompts/docs-writer.txt}",
    "tools": {
      "write": true,
      "edit": true,
      "bash": false
    }
  }
}
```

## Orchestrator with Task Permissions

This pattern shows a primary agent that controls which subagents it can invoke.

```json
{
  "orchestrator": {
    "description": "Coordinates development workflow using specialized subagents",
    "mode": "primary",
    "model": "anthropic/claude-opus-4-20250514",
    "prompt": "{file:./prompts/orchestrator.txt}",
    "permission": {
      "task": {
        "*": "deny",
        "code-reviewer": "allow",
        "test-generator": "allow",
        "security-analyzer": "ask",
        "docs-writer": "allow"
      },
      "edit": "allow",
      "bash": {
        "*": "allow",
        "git push*": "ask",
        "rm -rf*": "deny"
      }
    }
  }
}
```

## Hidden Internal Subagent

This pattern shows a subagent hidden from @ autocomplete but still invokable via Task tool.

```json
{
  "internal-helper": {
    "description": "Internal helper for data processing tasks",
    "mode": "subagent",
    "hidden": true,
    "model": "anthropic/claude-haiku-4-20250514",
    "temperature": 0,
    "prompt": "You are a data processing helper...",
    "tools": {
      "write": false,
      "edit": false,
      "bash": true
    }
  }
}
```

## Key Patterns

### Permission Inheritance

- Global `permission` in opencode.json applies to all agents
- Agent-specific `permission` overrides global settings
- Last matching rule wins for glob patterns

### Prompt File Organization

```
project/
├── opencode.json        # or agents.json
└── prompts/
    ├── chiron.txt
    ├── chiron-forge.txt
    ├── code-reviewer.txt
    └── test-generator.txt
```

### Model Strategy

| Agent Role | Recommended Model | Rationale |
|------------|-------------------|-----------|
| Complex reasoning | opus | Best quality, expensive |
| General tasks | sonnet | Balanced (default) |
| Fast/simple | haiku | Cost-effective |
| Deterministic | temperature: 0-0.1 | Consistent results |
| Creative | temperature: 0.3-0.5 | Varied responses |

### Tool Access Patterns

| Agent Type | write | edit | bash |
|------------|-------|------|------|
| Read-only analyzer | false | false | true (for git) |
| Code generator | true | true | true |
| Documentation | true | true | false |
| Security scanner | false | false | true |
