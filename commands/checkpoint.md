---
description: Save session state without closing (hotcache handoff + evidence entry)
---
Load and execute the session-close skill (mention: @session-close) now, but run ONLY its Checkpoint / Save State section for this session: update the hotcache handoff with current decisions and open questions, and write the timestamped evidence entry to .sisyphus/evidence/. Do NOT run the close/archive layers (L1-L4 routing, protocol completion, or push gates) — the session stays open for further work.
