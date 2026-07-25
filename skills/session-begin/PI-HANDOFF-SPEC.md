# Pi Handoff Export — Contract for pi to implement

> **Status:** Contract spec (opencode-authored, pi-implements).
> **Direction:** pi → opencode (reverse of `bd-bridge.ts` which is opencode → pi).
> **Owner:** pi writes the export at session-close; opencode reads at session-begin.
> **Consumed by:** `skills/session-begin/SKILL.md` Step 4 + Step 5.

## Purpose

When pi finishes a micro-session, it writes a handoff export so opencode can
resume with full context. This closes the "pi does micro work, opencode resumes
blind" gap (identified in Oracle session
`ses_065b0b403ffeB6v1zG3QRTIPBd`, 2026-07-24).

The forward bridge (`bd-bridge.ts`) already gives pi access to opencode's bd
memories at pi's `before_agent_start`. The reverse bridge gives opencode
access to pi's session-level context at opencode's session-begin.

## Where pi writes

```
~/.pi/agent/exports/pi-handoff.md
```

Pi owns the `~/.pi/agent/exports/` directory — create it if absent. One file,
overwritten each session (no append, no history — git is the history).

## When pi writes

At session-close, **before** pi's close commit. The handoff is part of pi's
close protocol, mirroring how opencode's `skill:session-close` writes
`hotcache.md` before its Layer 4 push.

If pi has no session-close skill yet, this spec is the seed: pi should add a
session-close step (via `skill-creator`) that writes this export.

## Schema

```markdown
# Pi Handoff — <one-line session summary> (<YYYY-MM-DD>)

**Written at:** <ISO 8601 timestamp>
**Pi session:** <pi session-id if available>
**Original intent:** <one-sentence user request that drove the session>

## Summary
<2-3 sentence narrative of what pi did. Plain prose, no tables.>

## Files touched
- <path> — <one-line why it changed>

## Decisions made
- <decision> — <brief rationale>

## Dead ends
<High-value section. What pi tried and abandoned, so opencode doesn't repeat.>
- <approach> — <why it didn't work>

## Incomplete work
- <what's mid-flight, needs continuation>

## Proposed bd facts
Pi proposes these for opencode to author. Opencode reviews + promotes via
`scripts/bd_remember.py`. Pi NEVER writes bd directly (constitution: pi is
read-only on bd).

- scope=global | category=<cat> | key=<key> | value="<fact>"
- scope=global | category=<cat> | key=<key> | value="<fact>"

## Next steps for opencode
- <handoff items pi couldn't complete>
```

## Schema rules

1. **Pi NEVER writes to bd.** Proposed facts live only in this markdown.
   Opencode promotes them after review.
2. **Pipe-delimited format** for proposed facts (matches `bd_remember.py`
   schema B: `scope=X|turn=Y|category=Z|key=K|value=V`). Pi does not need to
   escape pipes in values — opencode handles that on promotion.
3. **One handoff per session.** Overwrite the previous export. **Commit the
   `exports/` directory to pi's repo** — git history is the only authenticity /
   integrity signal for the handoff (no HMAC yet), and it costs nothing.
4. **Categories** opencode accepts: `exact`, `constraint`, `reason`,
   `dependency`, `preference` (loss categories) or `intent`, `files`,
   `decision`, `next` (compaction categories).
5. **Visible label.** Opencode presents this as `[FROM pi]`, never merged into
   its own memory or hotcache.

## Dead ends section — why it matters

The highest-value section. Opencode's `skill:debugging` says "after three
failed approaches, stop editing and consult Oracle." Pi's dead ends prevent
opencode from burning the same three attempts. Document:

- What was tried (the approach, not just the symptom)
- Why it failed (root cause if known, or the observation that ruled it out)
- What pi did instead (the path that worked, or "deferred")

A 1-line dead-end entry can save opencode 20 minutes of rediscovery.

## Commit prefix convention (R4)

Pi's session-close commit to its own repo (`~/.pi/agent/`) uses the `pi:` prefix
to distinguish authorship in shared logs and operator cross-references:

```
pi: session-close — <summary>
```

Or conventional-commit hybrid:

```
pi: feat(skills): <subject>
pi: fix(bridge): <subject>
pi: docs: <subject>
```

**Status:** Operator confirms this convention with pi. Pi's current commits use
standard conventional format without the prefix (`feat(skills):`,
`docs(skills):`, `chore(skills):`). Adopting `pi:` is a convention shift —
operator decision, not opencode's to impose.

Rationale for the prefix: when the operator scans `git log` across multiple
repos (opencode-config, dotfiles, pi agent), the `pi:` prefix instantly
identifies pi-authored commits without reading the diff. Especially useful
during incident triage or context recovery.

## Why this mirrors bd-bridge.ts (symmetry)

| Direction | Writer | Reader | Mechanism |
|---|---|---|---|
| Forward (opencode → pi) | opencode (`bd remember`) | pi (`bd-bridge.ts` at `before_agent_start`) | `bridge/export-bd-global.sh` exports to JSONL; pi reads |
| Reverse (pi → opencode) | pi (this spec) | opencode (`session-begin` Step 4) | pi writes `exports/pi-handoff.md`; opencode reads |

Both bridges are **read-path only at the consumer**. Neither agent writes to the
other's memory store. Each writes its own store; the other reads a projection.

This preserves the constitutional boundaries:
- pi never writes bd
- opencode never writes pi's files (except this contract spec, once)
- neither agent is trusted to write the other's state

## Implementation path for pi

1. **Read this spec** — pi's `skill-creator` can author a pi-side session-close
   skill that writes the export.
2. **Create `~/.pi/agent/exports/`** — pi owns this path.
3. **Hook into session-close** — pi writes the export before its close commit.
4. **Add to `doctor.sh`** (operator-side, in dotfiles) — a check that the
   handoff exists and is fresh, mirroring checks 11-13 for the forward bridge.

## Test plan

Once pi implements the export:
1. pi writes a handoff at its next session-close
2. opencode's next session-begin reads it (Step 4) — verify `[FROM pi]` block appears
3. opencode surfaces proposed bd facts (Step 5) — verify operator can promote
4. Round-trip: pi's dead-end entry prevents opencode from repeating an approach

Until pi implements this, opencode's session-begin Step 4 gracefully notes
"no pi handoff present" — no breakage.
