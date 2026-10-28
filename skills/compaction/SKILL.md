---
name: compaction
description: "Compaction and context-management protocol — fire at ~50% context usage, when compaction is imminent or just fired, when writing or validating a session handoff/hotcache, or when context looks degraded: 5 loss categories, bd_remember extraction, handoff schema, hotcache rotation, memory injection, degraded mode, write-before-compaction checklist."
metadata:
  internal: true
---

### Compaction Protocol

Trigger compaction at **50% usage** (not 100%). The goal is to preserve task continuity while shedding redundant history.

**⚠️ Critical: What Compression Loses**

Compaction uses lossy summarization. Based on Hermes research (see `~/.sisyphus/notepads/hermes-pattern-study.md`), these 5 categories are ALWAYS lost or degraded during compression:

1. **Exact numeric values** — thresholds, port numbers, version pins, token counts
2. **Hard constraints** — "don't touch test files", "no Redis", "use Postgres only"
3. **Decision reasoning** — the *why* of architecture choices (only the *what* survives)
4. **Cross-task dependencies** — links between files modified in different turns
5. **Implicit preferences** — coding style, response tone, formatting habits

**Rule:** Extract these to `bd remember` BEFORE compaction fires. Do not rely on them surviving the summary.

---

### Immutable System Prompt Rule

**The system prompt (this AGENTS.md) MUST NOT be modified during compaction.** It is the root instruction layer and must remain stable for the entire session.

**What this means:**
- During compaction, do NOT overwrite or edit the system prompt content
- Instead, compaction produces a separate **handoff message** containing session state
- The handoff message is appended to the working context, not merged into instructions
- Precedence: **Current user turn > Immutable system prompt > Pinned hard constraints > Handoff message > Retrieved memory**

**Why:** If compaction overwrites the system prompt, a single bad summary can corrupt the agent's core rules (constraints, tone, safety policies). A separate handoff message preserves the instruction layer while still providing continuity.

---

### Handoff Message Schema

During compaction, write a structured handoff message (NOT freeform prose):

```markdown
## Session Handoff
**Compacted at:** {timestamp}
**Original intent:** {one-sentence user request}
**Current phase:** {e.g., wave 2 execution, debugging}

### Files Modified
- {file} — {one-line why}

### Decisions Made
- {decision} — {brief rationale}

### Next Steps
- {remaining tasks}

### Evidence References
- {path to evidence file}

### Preserved Constraints
- {hard constraints from write-before-compaction checklist}

### Critical Values
- {exact numeric values, version pins, etc.}
```

**Storage:** Write handoff to `~/.sisyphus/hotcache.md` as the compaction artifact. Do NOT modify AGENTS.md.

---

### Post-Turn Memory Extractor

**Extract the 5 loss categories continuously, not just before compaction.** After every completed turn (user message + assistant response + any tool calls), check for facts in these categories and capture them immediately.

**What to extract:**
1. **Exact values** — Any numbers, timeouts, version pins, limits stated by user or discovered
2. **Hard constraints** — Forbidden actions, must-use/must-not-use rules
3. **Decision reasoning** — Why X was chosen over Y (not just "chose X")
4. **Cross-task dependencies** — "File A was modified; File B depends on it"
5. **Implicit preferences** — Style, tone, formatting habits demonstrated by user

**How to extract:**
- After each turn, scan the exchange for facts in the 5 categories
- Store via the gate-safe wrapper: `python3 ~/.config/opencode/scripts/bd_remember.py --scope <global|bead-ID> --turn <N> --category <cat> --key <dedup-key> --value "<fact>"`. Hand-running `bd remember "scope=...|turn=...|..."` is shell-safety-gate-blocked (the canonical record format uses `|` as a delimiter; the wrapper assembles the pipe-string internally in Python so the gate never sees the `|`).
- Deduplicate by `{scope}:{category}:{key}` (the wrapper passes this as `bd --key` for update-in-place)
- If confidence is low, do NOT store

**Example:**
```bash
python3 ~/.config/opencode/scripts/bd_remember.py --scope global --turn 12 --category constraint --key new_deps --value "no new dependencies"
```

---

### Pre-Turn Memory Injection

**Rehydrate preserved facts at session boundaries.** When a session begins, continues, or compacts, inject relevant stored memories back into working context before reasoning.

**When to inject:**
- `session-begin` trigger
- `continue` / `pick up` / `where was I` triggers
- Immediately after compaction completes

**What to inject:**
1. **Pinned hard constraints** — Always inject all active constraints first
2. **Current task facts** — Exact values and decisions relevant to the active bead/plan
3. **Cross-file dependencies** — Links for files in the current scope

**Budget rules:**
- Cap injected memory at ~10% of context window
- Prefer recency and relevance over completeness
- Never inject memories that conflict with the user's most recent message
- Label injected facts as `[FROM MEMORY]` so they can be distinguished from live context

**Retrieval policy (superseded 2026-10-23, aligned 2026-10-24):** the earlier adaptive policy (match the current task/bead ID, sort hard constraints first, take top-K with K=5 constraints + 10 facts) is RETIRED. The live contract is session-begin's determinism rule: one fixed query, first 15 entries, truncated in order — no re-ranking, no task-matching, identical everywhere. Do not reintroduce adaptive retrieval here; if the fixed subset needs changing, change session-begin's rule itself.

---

### Observable Degraded Mode

**Signal when the context-management loop is compromised.** Do not silently operate on degraded context.

**Deterministic trigger scan (Swamp Club Guard 2, Oracle 2a — run FIRST):**
post-compaction and post-resume (session-begin Step 1), run
`python3 ~/.config/opencode/scripts/check_degraded_mode.py` — it mechanically asserts
handoff-schema completeness and the mechanical trigger facts below and
emits the trigger list (exit 1 = triggers present). Detection is code;
the degraded-mode RESPONSE (below) stays model judgment. A scan failure
is itself a fail-closed trigger (conservative direction — a false
positive lands safe).

**Degraded mode triggers:**
- Compaction occurred but handoff message is missing or incomplete
- Relevant memories exist in `bd remember` but were NOT injected
- Post-turn extractor failed on the last turn
- Previously known hard constraints are absent after compaction
- Handoff message lacks "Preserved Constraints" or "Critical Values" sections

**When degraded:**
1. **Signal visibly** — Start response with: `⚠️ Context degraded: {reason}. Operating conservatively.`
2. **HARD RULE — Block destructive operations** — When degraded mode is active, ALL destructive operations (rm, mv, git push, deploy, DROP TABLE, ALTER, DELETE) require explicit user confirmation BEFORE execution. Do NOT proceed with these operations even if they seem correct.
3. **Pre-flight check** — Before executing ANY shell command or file operation while degraded:
   - Check: Is this operation destructive? (modifies, deletes, or publishes anything)
   - If yes: STOP and ask user for explicit confirmation
   - If user confirms: Log the override with reason
   - If user declines: Cancel the operation
4. **Rehydrate aggressively** — Re-read `~/.sisyphus/hotcache.md`, query bd remember, re-verify constraints
5. **Log the event** — Write to `~/.sisyphus/evidence/degraded-mode-{timestamp}.md` with reason and recovery actions

**Do NOT trigger degraded mode for:**
- Normal compaction with complete handoff
- Missing memories for completed, unrelated tasks
- Minor formatting differences in handoff

---

### Preserve these 5 anchors in the compaction summary
1. **Session intent** — original user request + current phase
2. **File modifications** — files created, modified, deleted (paths only)
3. **Decisions made** — architecture choices, scope decisions, model selections
4. **Next steps** — current task, remaining subtasks, blocked items
5. **Evidence references** — paths to `~/.sisyphus/evidence/` files, key test results

**Discard** (summarize to 1-2 lines):
- Full file contents already read
- Detailed exploration logs
- Intermediate reasoning chains
- Redundant verification outputs
- Skill instructions (can reload on demand)

**Execution:**
```
1. Detect 50% threshold (token estimate)
2. Run post-turn extractor on recent turns (capture 5 loss categories) via
   ~/.config/opencode/scripts/bd_remember.py (intent / files / decision / next categories)
3. Write structured handoff message to `~/.sisyphus/hotcache.md` (rotate: copy hotcache.md → hotcache-prev.md first, then overwrite)
4. Archive detailed evidence to `~/.sisyphus/evidence/compaction-{timestamp}.md`
5. Inject preserved facts from bd remember into working context
6. Run the deterministic trigger scan: `python3 ~/.config/opencode/scripts/check_degraded_mode.py`;
   signal per Observable Degraded Mode if triggers fired (exit 1), and treat
   scan failure (exit 2) as degraded too — fail-closed
7. Continue with compact context
```

**Write-Before-Compaction Checklist:**
Before triggering compaction, verify these are in `bd remember`:
- [ ] Any hard constraints or forbidden actions stated by the user
- [ ] Exact numeric values (timeouts, limits, version pins)
- [ ] Key decision reasoning (why X over Y)
- [ ] Cross-file dependencies the agent is tracking
- [ ] User's implicit preferences (style, tone, formatting)

The full conversation history is always preserved in JSONL regardless of compaction — branching and rewinding remain possible.
