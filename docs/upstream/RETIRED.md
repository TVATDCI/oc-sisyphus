# RETIRED — agent-registry-silent-default-draft (captain ruling, 2026-10-24)

The unfiled upstream draft `agent-registry-silent-default-draft.md` (prepared by
fm/backlog-impl P1-b, 2026-10-22; 2.1.4 re-verification addendum 2026-10-23) is
RETIRED, not filed. It was removed from the repo on the captain's 2026-10-24
ruling. Two reasons:

1. **The silent-default half is fixed at source.** opencode 2.1.4 (#58355,
   `fix(core): use the agent's model when a session has none`) serves the
   AGENT's model for a session created with an agent reference and no committed
   model — fleet-proven live on both desks by the 2026-10-23 update battery
   (differential 2.1.2 vs 2.1.4; evidence:
   `~/.sisyphus/evidence/battery-opencode-2.1.4-phase2-2026-10-23.md`).
2. **The registry-listing remainder is guarded fleet-side, and this filing will
   never happen.** The dark standalone `agent.list`/`agent.get` surface is
   covered by the standing registry guard
   (`plugins/sisyphus-gates/src/registry-guard.js`) plus the P1-a parity leg,
   and upstream filings are captain-worded: the captain ruled the draft retired
   rather than filed.

Nothing else changes: the registry guard code, the parity leg, and
`scripts/check-agent-registry.py` stay load-bearing and untouched. The full
draft text remains in git history (removed on this branch).
