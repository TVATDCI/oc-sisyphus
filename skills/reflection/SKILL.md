---
name: reflection
description: "Conversation analysis to improve skills based on user feedback. Use when: (1) user explicitly requests reflection ('reflect', 'improve', 'learn from this'), (2) user asks to analyze skill performance, (3) after a session with multiple corrections. Triggers: reflect, improve, learn, analyze conversation, skill feedback, review skill performance. NOT for: general conversation analysis, debugging, or planning."
compatibility: opencode
---

# Reflection Skill

Analyze conversations to detect user corrections, preferences, and observations, then propose skill improvements — with user confirmation before any edit.

## Purpose

Meta-learning: turn real conversational feedback into better skills. Repeated corrections, explicit rules, and adopted patterns are valuable training data.

## Core Workflow

### 1. Identify target skill

**If explicitly mentioned:**

```
User: "Reflect on the wave-executor skill"
→ Target: wave-executor
```

**If not specified, ask:**

```
"Which skill should I analyze? Recent skills used: [list from session]"
```

Only analyze **one skill per invocation**.

### 2. Scan conversation

Use session tools to read the current conversation:

```bash
session_read --session_id [current] --include_todos true
```

Look for:

- When the target skill was triggered or referenced
- User responses immediately after skill usage
- Correction signals (see `references/signal-patterns.md`)
- Repeated interactions or patterns
- Positive/negative feedback

### 3. Classify findings

Rate each finding using the 3-tier system in `references/rating-guidelines.md`:

| Priority | Examples |
|----------|----------|
| **HIGH** | Direct corrections, explicit rules ("Always...", "Never..."), repeated violations |
| **MEDIUM** | Positive reinforcement, adopted patterns (3+ times), workflow optimizations |
| **LOW** | Contextual insights, tentative patterns, environmental preferences |

### 4. Read target skill

Before proposing changes, read the current skill:

```bash
read ~/.config/opencode/skills/{target-skill}/SKILL.md
glob pattern="**/*.md" path=~/.config/opencode/skills/{target-skill}/references/
```

Avoid suggesting what already exists.

### 5. Generate proposals

For each finding, produce:

- **HIGH:** exact constraint text and where to insert it
- **MEDIUM:** preferred approach and optional example
- **LOW:** observation and potential future action

### 6. Present findings

```markdown
## Reflection Analysis: {Skill Name}

### HIGH Priority (Constraints)
1. **[Finding Title]**
   - Signal: [What user said/did]
   - Proposed: [Specific change to skill]

### MEDIUM Priority (Preferences)
1. **[Finding Title]**
   - Signal: [What indicated this preference]
   - Proposed: [Suggested update]

### LOW Priority (Observations)
[...]

---

Approve changes to {skill name}? (yes / no / selective)
```

### 7. Apply or document

**If user approves (`yes`):**

1. Edit `~/.config/opencode/skills/{target-skill}/SKILL.md`.
2. Validate with `scripts/validate-skills-v2.py skills/{target-skill}/SKILL.md`.
3. Confirm: "Updated {skill name} with {N} improvements."
4. Show the diff.

**If user selects some (`selective`):**

1. Ask which findings to apply.
2. Apply only approved changes.
3. Write rejected findings to `~/.sisyphus/notepads/reflection/{target-skill}.md`.

**If user declines (`no`):**

1. Create/append to `~/.sisyphus/notepads/reflection/{target-skill}.md`.
2. Document all findings with full context.
3. Confirm: "Documented {N} observations in ~/.sisyphus/notepads/reflection/{target-skill}.md."

## Storage Format

Path: `~/.sisyphus/notepads/reflection/{skill-name}.md`

```markdown
# Observations for {Skill Name}

Generated: {Date}
From session: {Session ID}

## HIGH: {Finding Title}
**Context:** [Which scenario/workflow]
**Signal:** [User's exact words or repeated pattern]
**Constraint:** [The rule to follow]
**Proposed Change:** [Exact text to add to skill]
**Status:** Pending user approval

---

## MEDIUM: {Finding Title}
**Context:** [Which scenario/workflow]
**Signal:** [What indicated this preference]
**Preference:** [The preferred approach]
**Rationale:** [Why this works well]
**Proposed Change:** [Suggested skill update]
**Status:** Pending user approval

---

## LOW: {Observation Title}
**Context:** [Which scenario/workflow]
**Signal:** [What was noticed]
**Observation:** [The pattern or insight]
**Potential Action:** [Possible future improvement]
**Status:** Noted for future consideration
```

## Constraints

1. **Never edit skills without user approval.**
2. **Read the skill first.**
3. **Preserve existing structure and style.**
4. **Be specific** — vague observations aren't actionable.
5. **Scan the full conversation**, not just recent messages.
6. **One skill per invocation.**
7. **Only HIGH findings get direct edits** unless the user explicitly asks for more.
8. **MEDIUM/LOW findings default to notes** in `~/.sisyphus/notepads/reflection/`.
