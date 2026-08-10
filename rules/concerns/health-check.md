# Health Check Rules

## When to Apply

Apply this rule when the user wants to verify OpenCode setup is working correctly. Trigger phrases include:

- "check if all works"
- "does it work"
- "is everything ok"
- "verify setup"
- "doctor"
- "diagnose"
- "troubleshoot opencode"
- "something is broken with opencode"
- "health check"

## The Check

When triggered, run the official health check and report results to the user:

```bash
bunx oh-my-opencode doctor
```

This is the canonical verification tool. It checks:

- OpenCode version and plugin versions
- Configuration schema validity (`~/.omo/omo.jsonc`, `opencode.json`)
- Model availability for all configured agents
- Skill/agent load status
- Cache consistency
- Any outstanding warnings

## What to Do With the Output

- **All green (0 warnings)**: Report "System OK" with version line. Task complete.
- **Warnings present**: List each warning verbatim, explain what it means in plain language, and propose a fix. Do NOT auto-fix unless the user asks.
- **Errors present**: Report the error, stop, and ask the user how to proceed. Do NOT attempt fixes without confirmation.

## When NOT to Run Doctor

- Mid-task verification (e.g., "does this build work?") — use `lsp_diagnostics` or build commands instead.
- After a config edit — wait for the user to request verification.
- As a routine preamble to unrelated work — it's a deliberate health check, not a greeting.

## Related

- For config schema questions, also see `rules/concerns/project-structure.md`.
- For model selection or category changes, see the `~/.omo/omo.jsonc` file directly (`[opencode]` section) and `system-reference` skill.
