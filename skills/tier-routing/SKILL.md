---
name: tier-routing
description: Choosing a model, tier, or fallback chain for a task() dispatch or a judging/verify node — wallet-frame tier routing plus the no-cheap-model-at-judging-nodes rule. Load before any dispatch or fan-out decision.
metadata:
  internal: true
---

# Tier Routing

- Tier routing (wallet frame, e66b212): mechanical → zai flat-rate tiers; judgment/gates → opencode-go diversity primaries (kimi-k3/grok-4.7 — grok-4.6 retired upstream, roster-verified 2026-10-22); zai-max = fallback floor; opencode pay-go = last resort. Optimize quota + pay-go dollars — session list-price dollars are NOT wallet impact.
- **Judging/verify nodes never land a cheap model — even as fallback (§17 #3):** review, audit, `momus`, `oracle`, and `post-reviewer` nodes must prune cheap models from their fallback chains. One bad cheap-model review inside a graph means downstream agents fix non-bugs, and you can't trace which node started it.
