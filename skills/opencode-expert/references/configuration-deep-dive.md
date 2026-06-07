# OpenCode Configuration Deep Dive

Reference for config precedence, hidden flags, team patterns, and known caveats.

> Last verified: 2026-04-30

---

## Config Precedence Hierarchy

OpenCode loads config in this order (later overrides earlier):

| Priority | Source | Override Method |
|----------|--------|-----------------|
| 1 | Remote `.well-known/opencode` | Org defaults |
| 2 | Global `~/.config/opencode/opencode.json` | User preferences |
| 3 | `OPENCODE_CONFIG` env var | Custom file path |
| 4 | Project `opencode.json` | Project-specific |
| 5 | `.opencode/` directories | Project-local agents/skills/commands |
| 6 | `OPENCODE_CONFIG_CONTENT` env var | Runtime overrides |
| 7 | Managed settings | Enterprise deployment |

**Key insight:** The `.opencode/` directory tree is walked **up** from CWD to git worktree root. Parent `.opencode/` configs override child configs (inverted from typical expectation).

---

## Known Precedence Bugs

### Bug #11628: `OPENCODE_CONFIG_CONTENT` not highest priority
Documentation claims `OPENCODE_CONFIG_CONTENT` has highest precedence, but `.opencode/` directories override it in practice.

**Workaround:** Use `OPENCODE_CONFIG` (file path) instead of `OPENCODE_CONFIG_CONTENT` (inline JSON).

### Bug #21307: Nested `.opencode/` precedence inverted
In nested directories, parent `.opencode/` wins over child `.opencode/` (should be the opposite).

**Workaround:** Place config at project root or use `opencode.json` at project root.

---

## Storage Locations

| Purpose | Path |
|---------|------|
| Main config | `~/.config/opencode/` or `~/.opencode/` (legacy) |
| User preferences | `~/.local/state/opencode/` (model selection, prompt history) |
| Session state | `~/.local/share/opencode/` |

---

## Hidden/Experimental Features

### Snapshot Control
```json
{ "snapshot": false }
```
- **Default:** `true` (tracks file changes for undo)
- **Problem:** Can consume 170GB+ disk space on large repos
- **When to disable:** Large repos, limited disk space, CI/CD environments

### Experimental Flags
```bash
export OPENCODE_EXPERIMENTAL=true
```
Enables:
- `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` — LSP integration
- `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS=30000` — Bash timeout

### Models Fetch Control
```bash
export OPENCODE_DISABLE_MODELS_FETCH=true
```
Skip auto-fetching model list from models.dev. Useful for:
- Air-gapped environments
- Faster startup
- Custom model providers

### Project Config Disable
```bash
export OPENCODE_DISABLE_PROJECT_CONFIG=true
```
Useful for:
- External tooling integration
- Running from non-project directories
- Profile-based workflows

---

## Profile-Based Configs

Use `OPENCODE_CONFIG_DIR` for context switching:

```bash
# Personal profile
OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/personal opencode

# Work profile  
OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/work opencode

# Client project
OPENCODE_CONFIG_DIR=~/.config/opencode/profiles/client-a opencode
```

Each profile is a complete `~/.config/opencode/` directory tree.

**Caveat:** Profile AGENTS.md is ignored if global `~/.config/opencode/AGENTS.md` exists.

---

## Team & Enterprise Patterns

### Shared Project Config
Commit `.opencode/` to repo for team-wide behavior:
```
.opencode/
├── opencode.json
├── AGENTS.md
├── agents/
│   └── code-reviewer.md
└── skills/
    └── company-standards/
        └── SKILL.md
```

### Managed Settings (Enterprise)
System-wide defaults via MDM or config management:
- macOS: `/Library/Application Support/opencode/`
- Linux: `/etc/opencode/`
- Windows: `%ProgramData%\opencode\`

### Remote Config
Organizations provide defaults via `.well-known/opencode` endpoint:
```json
{
  "mcp": {
    "jira": {
      "type": "remote",
      "url": "https://jira.example.com/mcp",
      "enabled": false
    }
  }
}
```

---

## Environment Variable Injection

```bash
# Inject inline config
export OPENCODE_CONFIG_CONTENT='{"mcp":{"my-server":{"enabled":false}}}'

# Inject file contents
export OPENCODE_CONFIG="/path/to/alternate-config.json"

# Inject permissions
export OPENCODE_PERMISSION='{"bash":"ask","edit":"deny"}'
```

---

## Model Variants

Many providers support model variants (reasoning effort levels):

```json
{
  "provider": {
    "openai": {
      "models": {
        "gpt-5": {
          "variants": {
            "high": { "reasoningEffort": "high" },
            "low": { "reasoningEffort": "low" }
          }
        }
      }
    }
  }
}
```

Cycle variants with `Ctrl+T` in TUI.

---

## Config Variables

Use placeholders in `opencode.json`:

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

Supported:
- `{env:VAR_NAME}` — Environment variable
- `{file:./path/to/file}` — File contents (relative to config or absolute)

---

## Claude Code Compatibility

OpenCode reads Claude Code conventions as fallbacks:
- `CLAUDE.md` if no `AGENTS.md`
- `~/.claude/CLAUDE.md` if no global `AGENTS.md`
- `.claude/skills/` directory

Disable:
```bash
export OPENCODE_DISABLE_CLAUDE_CODE=1
```

---

## Compaction Config

Control auto-compaction behavior:

```json
{
  "compaction": {
    "auto": true,
    "prune": true,
    "reserved": 10000
  }
}
```

- `auto`: Automatically compact when context fills
- `prune`: Remove old messages after compaction
- `reserved`: Tokens reserved for working memory

---

## Server Config

```json
{
  "server": {
    "port": 4096,
    "hostname": "0.0.0.0",
    "mdns": true,
    "mdnsDomain": "myproject.local",
    "cors": ["http://localhost:5173"]
  }
}
```

Use `opencode serve` to start headless server, `opencode attach` to connect TUI.

---

## Provider-Specific Options

```json
{
  "provider": {
    "anthropic": {
      "options": {
        "timeout": 600000,
        "chunkTimeout": 30000,
        "baseURL": "https://api.anthropic.com/v1"
      }
    },
    "amazon-bedrock": {
      "options": {
        "region": "us-east-1",
        "profile": "default"
      }
    }
  }
}
```
