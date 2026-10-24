---
name: delegation-shapes
description: "Delegation vocabulary and fan-out governance for task() work: chain/diamond/barrier shapes, N≤3 per wave, execution-receipt per node before merge, collapse diamond→chain when parallelism buys nothing. Load when delegating or fanning out."
metadata:
  internal: true
---

## Graph Shapes (Delegation Vocabulary)

Name the delegation shape when fanning out work (source: graph-engineering §15):

- **chain** — serial `task()` calls; simplest, slowest, easiest to trace.
- **diamond** — parallel fan-out, merge as nodes arrive (independent angles).
- **barrier** — parallel fan-out, merge ONLY when ALL N terminate (gates: momus/reviewer/regression — partial results mislead).

**Fan-out governance (routing default, E-trim 2026-09-27):** N≤3 per wave; declare node count; one `execution-receipt` per node before merge. If N× the per-window band (§17 #2) exceeds the comfortable band, **collapse diamond→chain by default** — parallelism must buy wall-time the operator actually consumes.

After every `task()` delegation, read the harness routing note; if the subagent model resolved "via category: unknown", flag the omo category drift and pin the model or category explicitly on that dispatch or the next.
