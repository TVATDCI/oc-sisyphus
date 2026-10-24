---
name: doc-drift-guard
description: Decide COMPLETE-CODEBASE.md sync scope when a change touches skills, agents, routing, permissions, canonical paths, or workflow docs — the routine-model-swap exception (commit-message-only) vs mandatory timeline+prose sync, and routing pin ownership (generated pipeline cast vs per-desk omo.*.jsonc variants).
user-invocable: false
metadata:
  internal: true
---

**Exception — routine model swaps are commit-message-only** (no timeline entry, no prose sync): fallback-chain reshuffles, `modelConcurrency` cap tweaks, free-tier retirements/additions. Primary-model changes stay prose-synced (overlay category-primary swaps are hard-enforced by `check-completion-honesty.sh` Check 9 via `omo-query.js`; pipeline-cast pins are enforced by the generator drift gate). Routing ownership since pipe-port-m2: the pipeline cast = the generated fleet files (`agents/*.md` via `scripts/generate-pipeline-personas.py` — skills delegate with `task(subagent_type=...)`); the per-desk repo variants (`omo.ddd.jsonc` / `omo.tnt.jsonc`, hostname-resolved) are the pin-authoring overlay — the omo plugin and its live `~/.omo/omo.jsonc` are retired (omo-retire, 2026-10-22). **Timeline + prose sync stays mandatory for architectural/decision changes**: new skills/agents, gate layers, canonical-path changes, permission-model changes, workflow/process changes, non-obvious decisions (the *why*).

For routing decisions, refer to the skill system map in `COMPLETE-CODEBASE.md` or `skill:system-reference`. Skills are invoked by domain match against their trigger descriptions — and `session-close` includes a mandatory COMPLETE-CODEBASE.md drift check if system topology changed.
