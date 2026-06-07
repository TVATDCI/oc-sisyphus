# OpenCode Automation & CI/CD

Reference for headless mode, GitHub Actions, non-interactive shell safety, and team workflows.

> Last verified: 2026-04-30

---

## Headless Mode

Run OpenCode without TUI for automation:

```bash
# One-shot command
opencode run "Add input validation to UserController"

# Continue previous work
opencode run --continue

# Continue specific session
opencode run --session SESSION_ID

# Fork for experiment
opencode run --fork
```

### Non-Interactive Output

Use `--format` for machine-readable output:
```bash
opencode run --format json "List TODOs in codebase"
```

---

## Non-Interactive Shell Safety

**Critical:** OpenCode's shell is non-interactive. Interactive commands will hang.

### Commands That Will Hang

| Command | Problem | Safe Alternative |
|---------|---------|------------------|
| `vim file` | Opens editor | Use `edit` tool instead |
| `nano file` | Opens editor | Use `edit` tool instead |
| `less file` | Opens pager | Use `cat` or `read` tool |
| `more file` | Opens pager | Use `cat` or `read` tool |
| `man command` | Opens pager | Use web search |
| `git add -p` | Interactive staging | Use `git add file` |
| `git rebase -i` | Interactive rebase | Avoid in automation |
| `npm init` | Interactive prompts | `npm init -y` |
| `apt-get install pkg` | Prompts for confirmation | `apt-get install -y pkg` |

### Always Use Flags

```bash
# Good
npm init -y
apt-get install -y pkg
pip install --yes pkg
git commit -m "message"

# Bad (will hang)
npm init
apt-get install pkg
pip install pkg
git commit
```

### Pattern: `yes | command`

For commands without `-y` flag:
```bash
yes | some-interactive-command
```

---

## GitHub Actions Integration

### Basic Workflow

```yaml
name: opencode
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  opencode:
    if: contains(github.event.comment.body, '/oc')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      
      - uses: anomalyco/opencode/github@latest
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        with:
          model: anthropic/claude-sonnet-4-20250514
```

### Automated PR Review

```yaml
name: PR Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      
      - name: Run OpenCode Review
        run: |
          opencode run --format json \
            "Review this PR for security issues, performance, and best practices. Output as JSON with findings array."
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENCODE_PERMISSION: '{"bash":"deny","edit":"deny"}'
```

### Comment-Based Trigger

```yaml
name: opencode-trigger
on:
  issue_comment:
    types: [created]

jobs:
  opencode:
    if: startsWith(github.event.comment.body, '/oc ')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      
      - name: Extract Command
        id: extract
        run: |
          echo "prompt=${BODY#/oc }" >> $GITHUB_OUTPUT
        env:
          BODY: ${{ github.event.comment.body }}
      
      - name: Run OpenCode
        run: opencode run "${{ steps.extract.outputs.prompt }}"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

## Permission Restrictions for CI

Always restrict permissions in CI/CD to prevent accidents:

```bash
export OPENCODE_PERMISSION='{
  "read": {"*": "allow"},
  "edit": {"*": "deny"},
  "bash": {
    "git *": "allow",
    "npm test *": "allow",
    "go test *": "allow",
    "*": "deny"
  }
}'
```

Or inline:
```bash
OPENCODE_PERMISSION='{"bash":"deny","edit":"deny"}' opencode run "Analyze codebase"
```

---

## Local Model for Air-Gapped CI

Use local models to avoid external API calls:

```json
{
  "model": "ollama/llama3.2:7b",
  "small_model": "ollama/llama3.2:3b"
}
```

```bash
# Start Ollama
ollama serve

# Run with local model
opencode run --model ollama/llama3.2:7b "Review code"
```

---

## Session Export for Traceability

Export sessions for audit trails:

```bash
# Export to Markdown
opencode export SESSION_ID > review-$(date +%Y%m%d).md

# Share URL
/share  # In TUI
```

---

## Web/Mobile Access

Start web interface for team access:

```bash
# Start web server
opencode web

# Or headless server
opencode serve

# Connect TUI to remote server
opencode attach http://team-server:4096
```

---

## ACP Protocol

Agent Client Protocol for stdin/stdout communication:

```bash
opencode acp --cwd /path/to/project --port 4096
```

Useful for:
- IDE integrations
- Custom tooling
- Pipeline scripts

---

## IDE Extension Integration

### VS Code Shortcuts

- `Cmd+Esc` (Mac) / `Ctrl+Esc` (Win/Linux) — Open in split terminal
- `Cmd+Shift+Esc` — New session
- `Cmd+Option+K` — Insert file reference `@File#L37-42`

### Editor Environment Variable

```bash
export EDITOR="code --wait"  # VS Code
export EDITOR="cursor --wait"  # Cursor
export EDITOR="nvim"
```

---

## Custom Tools for CI

Create project-specific tools in `.opencode/tools/`:

```typescript
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Query test results database",
  args: {
    testName: tool.schema.string(),
    branch: tool.schema.string()
  },
  async execute(args, context) {
    // Query your test database
    return `Test ${args.testName} on ${args.branch}: PASSED`
  }
})
```

---

## Monorepo Team Setup

```
monorepo/
├── .opencode/
│   ├── opencode.json       # Shared config
│   ├── AGENTS.md           # Shared project context
│   └── agents/
│       └── code-reviewer.md
├── packages/
│   ├── app/
│   │   └── .opencode/
│   │       └── AGENTS.md   # Package-specific context
│   └── lib/
│       └── .opencode/
│           └── AGENTS.md
└── docs/
    └── .opencode/
        └── AGENTS.md
```

Root config:
```json
{
  "instructions": [
    "docs/coding-standards.md",
    "packages/*/AGENTS.md"
  ]
}
```

---

## Docker Integration

```dockerfile
FROM node:22

RUN npm install -g opencode

ENV OPENCODE_PERMISSION='{"bash":"ask","edit":"deny"}'
ENV EDITOR="code --wait"

WORKDIR /app
COPY . .

CMD ["opencode", "run", "Review codebase"]
```

---

## Scheduled Tasks

```bash
#!/bin/bash
# nightly-review.sh

export OPENCODE_CONFIG_DIR=/etc/opencode/profiles/nightly
export OPENCODE_PERMISSION='{"read":"allow","edit":"deny","bash":"deny"}'

opencode run --format json "Review codebase for security issues" > /var/log/opencode/review-$(date +%Y%m%d).json
```

Cron:
```cron
0 2 * * * /usr/local/bin/nightly-review.sh
```
