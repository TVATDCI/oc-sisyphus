---
name: reflection
description: "Conversation analysis to improve skills based on user feedback. Use when: (1) user explicitly requests reflection ('reflect', 'improve', 'learn from this'), (2) user asks to analyze skill performance, (3) after a session with multiple corrections. Triggers: reflect, improve, learn, analyze conversation, skill feedback, review skill performance. NOT for: general conversation analysis, debugging, or planning."
compatibility: opencode
---

# Reflection Skill

Analyze conversations **and preserved memory** to detect user corrections, preferences, and observations, then propose skill improvements — with user confirmation before any edit.

## Purpose

Meta-learning: turn real conversational feedback and preserved constraints into better skills. Repeated corrections, explicit rules, adopted patterns, and exact values rehydrated at session boundaries are the most valuable training data.

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

### 2. Rehydrate preserved memory

Before scanning the current conversation, read the artifacts that survive compaction and session boundaries:

```bash
# Current session context
session_info({ session_id: "$OPENCODE_SESSION_ID" })

# Preserved constraints, decisions, exact values, dependencies
bd memories "constraint"
bd memories "decision"
bd memories "exact"
bd memories "$TARGET_SKILL"

# Session handoff (contains Preserved Constraints and Critical Values)
read ~/.sisyphus/hotcache.md
```

Also scan `~/.sisyphus/notepads/reflection/{target-skill}.md` if it exists, to avoid duplicating rejected or pending observations.

Look for:

- Hard constraints the user stated (e.g., "Always...", "Never...")
- Decision reasoning (why X was chosen over Y)
- Exact values (timeouts, version pins, limits)
- Cross-task dependencies involving the target skill
- Implicit preferences (tone, formatting, response style)

### 3. Scan current conversation

Use canonical session tools to read the current conversation:

```typescript
session_read({ session_id: "$OPENCODE_SESSION_ID", include_todos: true })
```

Look for:

- When the target skill was triggered or referenced
- User responses immediately after skill usage
- Correction signals (see `references/signal-patterns.md`)
- Repeated interactions or patterns
- Positive/negative feedback

### 4. Merge signal sources

Combine findings from:

1. **Preserved memory** (`bd remember`, `hotcache.md`) — highest authority; survives compaction
2. **Current conversation** — live feedback from this session
3. **Previous reflection notes** — `~/.sisyphus/notepads/reflection/{target-skill}.md`

Deduplicate by signal meaning, not by wording. If the same constraint appears in `bd remember` and in the conversation, treat it as one HIGH finding and cite both sources.

### 5. Classify findings

Rate each finding using the 3-tier system in `references/rating-guidelines.md`:

| Priority | Examples |
|----------|----------|
| **HIGH** | Direct corrections, explicit rules ("Always...", "Never..."), repeated violations, preserved hard constraints |
| **MEDIUM** | Positive reinforcement, adopted patterns (3+ times), workflow optimizations, preserved preferences |
| **LOW** | Contextual insights, tentative patterns, environmental preferences, single-instance observations |

### 6. Read target skill

Before proposing changes, read the current skill:

```bash
read ~/.config/opencode/skills/{target-skill}/SKILL.md
glob pattern="**/*.md" path=~/.config/opencode/skills/{target-skill}/references/
```

Avoid suggesting what already exists.

### 7. Generate proposals

For each finding, produce:

- **HIGH:** exact constraint text and where to insert it
- **MEDIUM:** preferred approach and optional example
- **LOW:** observation and potential future action

### 8. Present findings

```markdown
## Reflection Analysis: {Skill Name}

### HIGH Priority (Constraints)
1. **[Finding Title]**
   - Source: [conversation / bd remember / hotcache / previous reflection]
   - Signal: [What user said/did or what was preserved]
   - Proposed: [Specific change to skill]

### MEDIUM Priority (Preferences)
1. **[Finding Title]**
   - Source: [conversation / bd remember / hotcache / previous reflection]
   - Signal: [What indicated this preference]
   - Proposed: [Suggested update]

### LOW Priority (Observations)
[...]

---

Approve changes to {skill name}? (yes / no / selective)
```

### 9. Apply or document

**If user approves (`yes`):**

1. Edit `~/.config/opencode/skills/{target-skill}/SKILL.md`.
2. Validate with `scripts/validate-skills-v2.py skills/{target-skill}/SKILL.md`.
3. Update `COMPLETE-CODEBASE.md` if counts or routing changed.
4. Confirm: "Updated {skill name} with {N} improvements."
5. Show the diff.

**If user selects some (`selective`):**

1. Ask which findings to apply.
2. Apply only approved changes.
3. Write rejected findings to `~/.sisyphus/notepads/reflection/{target-skill}.md`.

**If user declines (`no`):**

1. Create/append to `~/.sisyphus/notepads/reflection/{target-skill}.md`.
2. Document all findings with full context and sources.
3. Confirm: "Documented {N} observations in ~/.sisyphus/notepads/reflection/{target-skill}.md."

## Storage Format

Path: `~/.sisyphus/notepads/reflection/{skill-name}.md`

```markdown
# Observations for {Skill Name}

Generated: {Date}
From session: {Session ID}

## HIGH: {Finding Title}
**Context:** [Which scenario/workflow]
**Source:** [conversation / bd remember / hotcache]
**Signal:** [User's exact words or repeated pattern]
**Constraint:** [The rule to follow]
**Proposed Change:** [Exact text to add to skill]
**Status:** Pending user approval

---

## MEDIUM: {Finding Title}
**Context:** [Which scenario/workflow]
**Source:** [conversation / bd remember / hotcache]
**Signal:** [What indicated this preference]
**Preference:** [The preferred approach]
**Rationale:** [Why this works well]
**Proposed Change:** [Suggested skill update]
**Status:** Pending user approval

---

## LOW: {Observation Title}
**Context:** [Which scenario/workflow]
**Source:** [conversation / bd remember / hotcache]
**Signal:** [What was noticed]
**Observation:** [The pattern or insight]
**Potential Action:** [Possible future improvement]
**Status:** Noted for future consideration
```

## Constraints

1. **Never edit skills without user approval.**
2. **Read preserved memory first** — hotcache and `bd remember` survive compaction; the conversation window does not.
3. **Read the skill before proposing changes** — avoid redundant suggestions.
4. **Preserve existing structure and style.**
5. **Be specific** — vague observations aren't actionable.
6. **Scan the full conversation and preserved memory**, not just recent messages.
7. **One skill per invocation.**
8. **Only HIGH findings get direct edits** unless the user explicitly asks for more.
9. **MEDIUM/LOW findings default to notes** in `~/.sisyphus/notepads/reflection/`.
10. **Update docs if topology changed** — `COMPLETE-CODEBASE.md` drift is a hard failure in this repo.
