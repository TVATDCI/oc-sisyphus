---
title: "SYSTEM OVERVIEW"
type: system-overview
date_created: 2026-04-30
date_updated: 2026-06-20
id: system-overview
status: current
version: "4.1"
---

# System Overview → See COMPLETE-CODEBASE.md

Full architecture, routing, and workflow now live in **COMPLETE-CODEBASE.md**.

This file retained for backward compatibility with skill references that load `skill:system-reference`.

**Recent changes (v4.1, 2026-06-17):**
- Intent gate added to `sisyphus` agent prompt routing
- New meta-skills: `execution-receipt` (post-delegation verification), `reflection` (conversation-driven skill improvement)
- New topology gate: `scripts/check-completion-honesty.sh`
- Doc counts reconciled in `COMPLETE-CODEBASE.md`

**Quick links:**
- [COMPLETE-CODEBASE.md](./COMPLETE-CODEBASE.md) — Full system map
- `skill:system-reference` — Detailed system architecture reference
- `~/.sisyphus/evidence/session-handoff-2026-06-07.md` — Session continuity (canonical state in ~/.sisyphus/)
- [THREAT-MODEL.md](./plugins/sisyphus-gates/THREAT-MODEL.md) — Security architecture
