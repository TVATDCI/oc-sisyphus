# Efficiency Rules

## Rediscovery Prevention

**Don't re-read files you already read this session.** Use `session_search` to find prior reads.

**Don't explore directories you already explored.** If you know the file structure, target specific files.

**Prefer grep over read for verification.** If you need to check if a function exists, grep for its name rather than reading the whole file.

## Evidence Requirements

"Build passes" is not evidence. Attach the actual command output.
"Tests passing" is not evidence. Attach the test output showing PASS.
"Code works" is not evidence. Attach a log of the verification steps.

Evidence prevents re-work and re-verification, which wastes tokens.

## Token Transparency

When delegating to subagents, always report: `Executing with [model] via [category]`.

This enables cost tracking, model debugging, and verification that cheap models are used for mechanical work.
