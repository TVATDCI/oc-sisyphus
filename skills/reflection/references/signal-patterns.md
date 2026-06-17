# Signal Patterns for Reflection

Patterns to look for when scanning conversation history.

## HIGH — Explicit constraints

| Pattern | Example |
|---------|---------|
| Direct negation | "No, don't do that." / "Not like that." |
| Explicit rule | "Always run tests first." / "Never commit without asking." |
| Repeated correction | Same correction 2+ times in one session |
| Escalation | "I already told you..." / "Stop doing X." |
| Override | "Ignore that instruction; do Y instead." |

## MEDIUM — Preferences and adopted patterns

| Pattern | Example |
|---------|---------|
| Positive reinforcement | "That's perfect." / "Exactly." / "Much better." |
| Adoption | User starts using your suggested phrasing or workflow |
| Optimization request | "Can you do X faster next time?" |
| Scope preference | "I prefer smaller diffs." |

## LOW — Observations

| Pattern | Example |
|---------|---------|
| Contextual note | "In this project we usually..." |
| Tentative feedback | "Maybe X would help?" |
| Environmental constraint | "My machine is slow, so avoid heavy ops." |

## False positives to ignore

- General discussion about a technology
- Debugging back-and-forth that isn't about skill behavior
- User expressing frustration about external tools or APIs
- One-off typos or slips
