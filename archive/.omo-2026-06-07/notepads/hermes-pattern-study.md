---
type: research
title: Hermes Architecture Pattern Study
date: 2026-05-29
source: https://hermes-agent.nousresearch.com/docs/developer-guide/architecture/
---

# Hermes Architecture Pattern Study

Research into Hermes Agent (NousResearch) architecture for patterns applicable to our Sisyphus/opencode system.

## Key Findings

### 1. Context Compression Architecture

**Hermes runs TWO compressors at deliberately offset thresholds:**
- **Agent compressor** (`context_compressor.py`): fires at 50% of context window
- **Gateway safety net** (`gateway/run.py`): fires at 85% (character-based estimate)

**Why the offset matters:** Setting both to 50% caused premature compression on every turn in long gateway sessions. The 85% threshold exists specifically to stay out of the agent compressor's way.

**Validation for our system:** Our 50% compaction threshold in AGENTS.md aligns with Hermes's primary compressor. Good.

### 2. The 4-Phase Compression Algorithm

When threshold trips:
1. **Prune old tool results** — replace outputs >200 chars with placeholder (no LLM call)
2. **Determine boundaries** — protect first 3 messages + recent tail; align tool_call/tool_result pairs
3. **Generate structured summary** — auxiliary LLM with template; updates previous summary rather than regenerating
4. **Reassemble** — head + summary message + tail verbatim; sanitize orphaned tool pairs

### 3. What Compression Loses (Critical for Our System)

Hermes explicitly documents 5 categories that summarization ALWAYS loses:

1. **Exact numeric values** — thresholds, port numbers, version pins get absorbed into prose
2. **Hard constraints** — "don't touch test files", "no Redis" stated once and assumed permanent
3. **Decision reasoning** — the *why* of decisions rarely survives; only the *what* does
4. **Cross-task dependencies** — file modified in turn 12 that tool in turn 47 depends on
5. **Implicit preferences** — coding style, response tone, formatting habits

**Our equivalent risk:** When we compact at 50%, we face the same 5 loss categories. Our `bd remember` system must capture these BEFORE compaction, not hope they survive.

### 4. Write-Before-Compaction Pattern

Hermes ships Mem0 as native memory provider. It works at 3 points per turn:
- **Before response:** Inject cached Mem0 results into system prompt (zero-latency)
- **After response:** Send exchange to Mem0 API in background thread; facts extracted automatically
- **Simultaneously:** Background search for next turn's memories (pre-loaded)

**Our mapping:**
- `bd remember` = Mem0's persistent memory layer
- `hotcache.md` = Mem0's cached injection
- `.sisyphus/evidence/` = structured artifacts that survive compression
- **Gap:** We don't have automatic extraction after every turn. We rely on manual `bd remember` calls.

### 5. Session Storage: SQLite + FTS5

- SQLite with FTS5 full-text search for session history
- Session lineage tracking (parent/child across compressions)
- Per-platform isolation
- Atomic writes with contention handling

**Our current:** JSON state files. No FTS5 search. No lineage tracking.
**Assessment:** SQLite would be overkill for our current scale. JSONL preservation (already implemented) provides lineage. FTS5 would be nice for searching session history but not critical.

### 6. Plugin Boundaries

**Three discovery sources:**
1. `~/.hermes/plugins/` (user-global)
2. `.hermes/plugins/` (project-local)
3. pip entry points (package-installed)

**Specialized plugin types (single-select):**
- Memory providers — only one active at a time
- Context engines — only one active at a time

**Registry pattern:** Tools self-register at import time via `registry.register()`. No manual import list. `check_fn` gating for availability, not hard dependencies.

**Our mapping:**
- Skills directory = plugins directory
- No single-select constraint currently (multiple skills can be active)
- Registry pattern is similar to our skill auto-discovery

### 7. Design Principles Applicable to Us

| Principle | Hermes Implementation | Our Equivalent |
|-----------|----------------------|----------------|
| Prompt stability | System prompt doesn't change mid-conversation | We mutate system prompt via compaction — risk |
| Observable execution | Every tool call visible via callbacks | Our tool calls are visible in JSONL log |
| Interruptible | API calls cancellable mid-flight | We can cancel background tasks |
| Profile isolation | Each profile gets own HERMES_HOME | We have per-project `.sisyphus/` but no user profiles |
| Loose coupling | Optional subsystems use registry + check_fn | Skills use similar pattern |

### 8. Trajectory Format

Hermes generates ShareGPT-format trajectories from sessions for training data.
**Not applicable** to our system (no training data generation needed).

## Recommendations for Our System

1. **Formalize write-before-compaction in AGENTS.md** — Extract the 5 loss categories to `bd remember` before compaction fires
2. **Add compression-loss awareness to compaction protocol** — Explicitly list what gets lost so users know what to preserve
3. **Consider single-select constraints for certain skill types** — e.g., only one memory provider, one context engine
4. **Keep JSONL lineage** — Already implemented, preserves full history for branching/rewinding
5. **SQLite/FTS5 is overkill for now** — JSON state files + grep are sufficient at current scale

## Sources

- https://hermes-agent.nousresearch.com/docs/developer-guide/architecture/
- https://mem0.ai/blog/how-hermes-and-claude-handle-context-compression-in-real-production-agents-(and-what-you-should-extract)
- https://deepwiki.com/NousResearch/hermes-agent/1.1-architecture-overview
- https://github.com/nousresearch/hermes-agent
