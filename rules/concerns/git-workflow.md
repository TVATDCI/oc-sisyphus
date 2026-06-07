# Git Workflow Rules

> **Provenance:** Inspired by AGENTS (github.com/m3tam3re/AGENTS). Adapted for our workflow.

## Conventional Commits

Format: `<type>(<scope>): <subject>`

### Types
- **feat**: New feature
- **fix**: Bug fix
- **refactor**: Code cleanup, no behavior change
- **test**: Test-only changes
- **docs**: Documentation
- **chore**: Maintenance, tooling
- **style**: Formatting only

### Rules
- Subject: imperative mood ("add", not "added")
- Max 72 chars for subject
- No trailing period
- Body explains WHY, not WHAT

## Examples

```
feat(auth): add OAuth2 login flow

Implements Google and GitHub OAuth providers.
Refreshes token automatically on expiry.

fix(api): resolve race condition in batch upload

Two concurrent uploads could overwrite the same temp file.
Added UUID prefix to temp filenames.
```

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready |
| `feat/*` | Feature development |
| `fix/*` | Bug fixes |
| `docs/*` | Documentation |

## Agent Commits

When agents make commits, use consistent conventional commit format. Agent identity is configured at the system level, not by individual agents.
