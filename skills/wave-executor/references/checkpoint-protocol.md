# Wave-Executor Checkpoint Protocol

Checkpoints formalize human-in-the-loop points for verification and decisions,
not manual work. The agent invokes this protocol whenever a wave hits a juncture
that requires human judgment.

**Golden rule:** If the agent CAN automate it, the agent MUST automate it.
Checkpoints are for what requires human judgment.

---

## Checkpoint Types

| Type | Frequency | Use For | Action |
|------|-----------|---------|--------|
| `human-verify` (90%) | After automated work complete | Visual/functional verification, UX evaluation | STOP → present verification steps → wait for "approved" or issues |
| `decision` (9%) | When architectural choice needed | Technology selection, design choices, schema decisions | STOP → present options with pros/cons → wait for selection |
| `human-action` (1%) | When no CLI/API exists | Auth gates, email verification, 2FA codes | STOP → present exact steps needed → wait for completion |

## Checkpoint Format

```markdown
## CHECKPOINT REACHED

**Type:** [human-verify | decision | human-action]
**Progress:** {completed}/{total} tasks complete

### Completed Tasks
| Task | Status | Key Changes |
|------|--------|-------------|
| 1 | ✓ | [what was done] |

### Current Task
**Task {N}:** [name]
**Status:** [blocked | awaiting verification | awaiting decision]
**Blocked by:** [specific blocker]

### Checkpoint Details
[Type-specific content]

### Awaiting
[What user needs to do/provide]
```

## When NOT to Use Checkpoints
- Things the agent can verify programmatically (tests, builds, lint)
- File operations the agent can perform directly
- Code correctness verifiable via static analysis
- Anything automatable via CLI/API

## Auto-Mode Behavior
When user invokes with `--auto` or `workflow.auto_advance` is true:
- `human-verify` checkpoints → auto-approve with log `⚡ Auto-approved: [what-built]`
- `decision` checkpoints → auto-select first option (planners front-load recommended choice) with log `⚡ Auto-selected: [option]`
- `human-action` checkpoints → always STOP (auth gates cannot be automated)
