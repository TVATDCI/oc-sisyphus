---
description: Reflect on a skill's performance by analyzing conversation history for user corrections and feedback. Proposes skill improvements based on detected signals.
---

Reflect on skill performance and propose improvements based on conversation analysis.

**Usage:**

```
/reflection [skill-name]
```

**If no skill name is provided:** Ask which skill to analyze from recent session usage.

**What this does:**

1. Scans conversation history for user corrections, preferences, and feedback signals.
2. Classifies findings as HIGH (constraints), MEDIUM (preferences), or LOW (observations).
3. Reads the target skill's current `SKILL.md` to avoid redundant suggestions.
4. Proposes specific improvements with user confirmation before applying.
5. Stores deferred or rejected findings in `~/.sisyphus/notepads/reflection/{skill}.md`.

**Examples:**

```
/reflection wave-executor
"Analyze how wave-executor performed in this session and suggest improvements"

/reflection
"Which skill should I analyze?"
"skill-creator"
"Analyzing skill-creator performance..."
```

**Note:** This command is always explicit/user-triggered. It does not run automatically at session close.
