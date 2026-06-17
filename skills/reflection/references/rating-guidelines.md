# Reflection Rating Guidelines

How to classify findings from conversation analysis.

## HIGH — Direct constraints

**Criteria:**
- User explicitly stated a rule or boundary
- User corrected the same behavior more than once
- Violation would cause clear harm or violate a hard constraint

**Action:** Propose a direct edit to the skill. Get user approval first.

**Examples:**
- "Never use `as any`."
- "Always ask before committing."
- "Stop deleting failing tests." (after two instances)

## MEDIUM — Preferences and patterns

**Criteria:**
- User expressed clear preference or positive reinforcement
- Pattern repeated 3+ times and seems stable
- Improves workflow but not a hard requirement

**Action:** Present as a proposal. If approved, edit skill; otherwise store as a note.

**Examples:**
- "I like concise responses."
- "Please run the build after edits."
- "Show me the plan before long edits."

## LOW — Observations

**Criteria:**
- Single instance or tentative signal
- Context-dependent insight
- Nice-to-have, not clearly repeatable

**Action:** Store in `~/.sisyphus/notepads/reflection/{skill}.md` only. Do not edit skill.

**Examples:**
- "Maybe this project could use..."
- "My terminal theme makes that hard to read."
- One-off request that may not generalize

## Approval rules

- HIGH → edit skill if user approves
- MEDIUM → edit skill if user explicitly approves; default to notes
- LOW → notes only
