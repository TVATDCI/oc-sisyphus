# OpenCode Troubleshooting

Symptom to cause to workaround for known issues.

> Last verified: 2026-04-30

---

## Config Not Loading

### Symptom: Changes to .opencode/opencode.json not taking effect

**Cause:** Nested .opencode/ directories have inverted precedence (parent overrides child — Bug #21307).

**Workaround:**
1. Move config to project root opencode.json
2. Or use OPENCODE_CONFIG env var pointing to absolute path

---

### Symptom: OPENCODE_CONFIG_CONTENT not overriding project config

**Cause:** .opencode/ directories override OPENCODE_CONFIG_CONTENT (Bug #11628).

**Workaround:** Use OPENCODE_CONFIG (file path) instead:

    export OPENCODE_CONFIG=/path/to/override.json

---

## Disk Space Issues

### Symptom: ~/.local/share/opencode/ consuming 100GB+

**Cause:** snapshot: true (default) tracks all file changes via internal Git repo.

**Fix:**

    # Check size
    du -sh ~/.local/share/opencode/

    # In opencode.json:
    { "snapshot": false }

**To clean existing snapshots:**

    rm -rf ~/.local/share/opencode/snapshots/

---

## Commands Hanging

### Symptom: OpenCode becomes unresponsive after running a command

**Cause:** Interactive command waiting for input in non-interactive shell.

**Common culprits:**
- npm init (use npm init -y)
- apt-get install pkg (use apt-get install -y pkg)
- git commit (use git commit -m "message")
- vim, nano, less, more, man
- git add -p, git rebase -i

**Fix:** Cancel with Escape, then retry with non-interactive flags.

---

## Model List Empty

### Symptom: No models shown with <leader>M

**Cause:** Model list fetch failed or provider not configured.

**Fix:**

    # Refresh models
    opencode models --refresh

    # Or disable fetch and use known models
    export OPENCODE_DISABLE_MODELS_FETCH=true

---

## Permission Denied

### Symptom: Tool not available despite permission config

**Cause:** Pattern order wrong — catch-all * must come LAST.

**Fix:**

    # Wrong
    "bash": { "*": "allow", "rm *": "deny" }

    # Right
    "bash": { "rm *": "deny", "*": "allow" }

---

## Subagent Not Found

### Symptom: @agent-name not in autocomplete

**Cause:** Agent missing required frontmatter or wrong location.

**Check:**
1. File at .opencode/agents/agent-name.md or ~/.config/opencode/agents/agent-name.md
2. Frontmatter has description field
3. mode is primary, subagent, or all
4. File name matches directory structure

---

## Skill Not Loading

### Symptom: skill() call fails or skill not in context

**Check:**
1. SKILL.md spelled in ALL CAPS
2. Frontmatter has name and description
3. Name matches directory name
4. Skill in discoverable location (.opencode/skills/ or ~/.config/opencode/skills/)
5. Permissions allow skill loading

---

## Session Resume Issues

### Symptom: Cannot find session to continue

**Cause:** Session list shows IDs but not branch names or descriptions.

**Workaround:** Use external tool to search sessions:

    opencode session list --format json | jq '.[] | select(.title | contains("search term"))'

---

## Snapshot Git Conflicts

### Symptom: File changes not tracked or undo fails

**Cause:** Snapshot Git repository corrupted or branch mismatch.

**Fix:**

    rm -rf ~/.local/share/opencode/snapshots/
    # Snapshots will be recreated on next session

---

## Slow Startup

### Symptom: opencode takes 10+ seconds to start

**Causes:**
1. Fetching model list from models.dev
2. Loading many skills
3. Large AGENTS.md files

**Fix:**

    export OPENCODE_DISABLE_MODELS_FETCH=true

    # Or reduce skills loaded
    # In opencode.json:
    "skills": { "my-skill*": true, "*": false }

---

## Windows Terminal Shift+Enter

### Symptom: Shift+Enter not working for new lines

**Fix:** Add to Windows Terminal settings.json:

    "actions": [{ 
      "command": { "action": "sendInput", "input": "\u001b[13;2u" }, 
      "id": "User.sendInput.ShiftEnterCustom" 
    }],
    "keybindings": [{ 
      "keys": "shift+enter", 
      "id": "User.sendInput.ShiftEnterCustom" 
    }]

---

## External Directory Access Denied

### Symptom: Cannot read files outside project root

**Cause:** external_directory permission set to deny or ask.

**Fix:**

    # In opencode.json:
    "permission": {
      "external_directory": "allow"
    }

    # Or specific paths:
    "permission": {
      "external_directory": {
        "/home/user/shared/**": "allow",
        "*": "deny"
      }
    }
