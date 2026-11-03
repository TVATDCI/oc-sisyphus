---
name: memory-doctrine
description: "Sis's standing memory doctrine (captain-ruled 2026-11-03; scout+oracle+kun-sourced): the layered authority map — one boss per memory kind (bd memories, timeline, skills, workflow state, hotcache/handoffs, web tier), the write law (bd_remember.py sole door), read/hydration discipline, retention, the beads-coordination-lanes non-adoption ruling, and the machinery-placement ruling. Load when writing or promoting memories, resolving contradictions between memory sources, deciding where knowledge lives, or evaluating any beads federation/sync/lease/serve feature."
metadata:
  internal: true
---

# Memory doctrine (sis)

Standing law for how sis's memory surfaces relate. Captain-ruled 2026-11-03 in the
sis-memory discussion (scout + oracle + kun chain; rulings record: firstmate
`learnings.md` 2026-11-03 entries "SIS-MEMORY DISCUSSION — CAPTAIN RULINGS" + kun
placement verdict). The mechanism owners below carry the **how**; this skill carries
the **what-wins and why**. Where a mechanism doc states a rule, it stays
authoritative for mechanics; this doctrine supersedes on authority and conflict
questions.

## 1. Authority map — one boss per memory kind

Every memory kind has exactly one canonical home. A fact consulted anywhere else is
a copy; the copy never outranks its boss.

| Kind | Boss for | Never the boss for |
|---|---|---|
| **bd memories** | Small durable facts: constraints, exact values, decisions, next-pointers | History, procedure, phase truth |
| **Timeline** (`COMPLETE-CODEBASE.md` §Change Timeline; `SYSTEM-NARRATIVE.md` Layer-1 log per session-close routing) | Dated history + rationale + superseded decisions | Live state — the timeline records what happened, not what is |
| **Skills** | Versioned procedure (the loaded SKILL.md is the procedure of record) | Durable facts or history |
| **Workflow state** (`~/.sisyphus/`) | Gate/phase truth — `state.json` is Layer-0 trust-root (operator-only), `hotcache.md` its agent-readable projection | Knowledge — phase truth is not memory |
| **Hotcache / handoffs** | Nothing. Derived, expiring, **REBUILDABLE accelerators** — never truth roots | Authority of any kind; a hotcache line contradicted by a boss surface is dead |
| **Web / research tier** | Nothing yet. Untrusted until promoted | Direct-to-canonical memory — raw web/capture content never enters bd, skills, or the timeline as fact |

Precedence between live conversation and injected memory is unchanged (current
turn wins; see session-begin's precedence doctrine) — the map above governs
memory-vs-memory and memory-vs-artifact authority.

## 2. Write law

bd memory writes go through **one door**, under rules adopted as law 2026-11-03:

1. **Sole door:** `scripts/bd_remember.py`. Hand-running
   `bd remember "scope=...|turn=...|..."` is gate-blocked *and* doctrinally
   off-door. The mechanics live in the wrapper docstring; the phase gating lives in
   `skill:bd-phase-policy`. Deletion/supersede paths (`forget`, `delete`) stay
   phase-gated per that policy.
2. **Canonical categories only:** `constraint`, `decision`, `dependency`, `exact`,
   `files`, `intent`, `next`, `preference`, `reason`. The wrapper warns on a
   non-canonical category — never store under a warned category; re-issue with a
   canonical one.
3. **Deterministic scoped keys:** `{scope}:{category}:{key}`, topic-based keys that
   survive rewording (the key names the subject, not the phrasing).
4. **Supersede, not duplicate:** `--key` updates in place. A replaced fact is
   updated or superseded under the same key — never left stale beside its
   replacement; a resolved constraint leaves the active set (gated forget path),
   with the long-form rationale landing in the timeline (§4).
5. **Source + date inside every record.** A memory without provenance is a rumor
   with a key.
6. **Read-back on critical writes.** A write whose loss would mislead the next
   session (constraints, exact values, decision rationale) is read back and
   confirmed before being reported as stored. Never report "remembered" for a
   write you did not perform.
7. **Degraded-mode sink preserved:** the wrapper records
   `~/.sisyphus/extractor-status.json` around every real bd call (Swamp Club Guard
   2). Never bypass, silence, or fake the sink.
8. **No raw web/capture promotion.** Web and research content reaches canonical
   memory only through the promotion path: operator-confirmed, screened
   (`scripts/screen_bd_proposals.py` flags constraint-category and approval-lexeme
   proposals at session-begin Step 5), carrying source + date. pi never writes bd —
   pi-side proposals arrive via the forward bridge handoff and are promoted here,
   never auto-promoted.

## 3. Read / hydration discipline

- **Load by domain, not recency.** Hydration order law: (1) hard constraints
  first, (2) active-task dependencies and exact values, (3) recency — all inside a
  **strict size budget**. *[Slice-3 marker: the numeric budget value lands with
  implementation slice 3 (hydration budget + retention). The principle and the
  constraint-first ordering are law now.]*
- **Current mechanism unchanged until slice 3:** session-begin Step 2's uniform
  injection (one fixed query, bd-native order, first-15 cap — the 2026-10-23
  determinism ruling) remains the operative mechanism; the doctrine governs the
  target ordering law. Do not silently bend the mechanism and call it the law, or
  vice versa — slice 3 re-lands the mechanism under the budget.
- **Contradictions surface; they are never silently resolved** by newest-wins,
  hotcache, or web content. When two memory sources disagree, present the conflict
  for resolution (boss-surface wins per §1); resolving by silently picking the
  newest or the most convenient source is a doctrine violation.
- **Hotcache honesty:** handoffs carry staleness/provenance markers (`Written
  at:`/`Compacted at:`, `[FROM HOTCACHE]` labels) and are always regenerable from
  the boss surfaces (bd memories + git + state projection). Losing a hotcache is a
  warm-start loss, never data loss — rebuild, don't mourn.

## 4. Retention

- **Stale durable facts are superseded, with the long-form explanation preserved**
  in timeline history (`COMPLETE-CODEBASE.md` timeline entry or `SYSTEM-NARRATIVE.md`
  per session-close routing). The bd record itself updates in place under the same
  key (§2.4) or leaves via the gated forget path — never silent deletion, never
  stale duplication.
- **Periodic relevance review is doctrine.** *[Slice-3 marker: review cadence and
  mechanics land with implementation slice 3.]*

## 5. Beads coordination lanes — non-adoption, standing

**Ruled 2026-11-03 (captain):** beads formulas / molecules / federation / leases /
serve are **non-adopted, standing**. The honest per-kind rationale:

- **federation / sync** — couple sovereign desk-local stores. The twin-desk
  doctrine is two sovereign stores that keep each other honest, not one shared
  store; federation would merge what must stay independent.
- **leases** — solve multi-writer contention. This fleet is single-writer-per-desk;
  the problem leases solve does not exist here.
- **bd gates** (as an authority) — would sit beside the signed trust roots
  (sisyphus-gates HMAC verdicts) as a second authority. Two authorities = authority
  ambiguity; gates stay the operator-signed spine's alone.
- **serve** — adds network exposure with no memory benefit.

**Revisit bar:** a concrete, named need — a real incident or requirement spelled
out — never a mood, a tool-release novelty, or "it might help someday."

## 6. Machinery placement (kun verdict, 2026-11-03)

- **Machinery lives in this repo** (oc-sisyphus). It is sis's distro —
  agent-shaping knowledge lives next to the agent. `dotfiles` is the *desk's*
  distro for cross-agent surfaces, not this machinery's home.
- **Data stays desk-local and sovereign:** bd store, hotcache, workflow state never
  leave the desk (bd stores remain desk-local, no remote).
- **The store snapshot job goes to dotfiles** — desk ops: what survives the agent
  is the desk's business; the store outlives any one agent. *[Deferred: the
  snapshot job is a later captain-worded round — not part of the doctrine ship.]*
- **Graduation trigger: a second agent adopting the pattern.** Until then, keep the
  contracts documented and harness-agnostic inside this repo, so graduation is a
  move, not a rewrite.

## Sources

- Rulings record: firstmate `learnings.md`, 2026-11-03 — "SIS-MEMORY DISCUSSION —
  CAPTAIN RULINGS" (authority map adopted per the oracle's layered map; write law
  adopted as law; lanes non-adoption ruled) + "KUN PLACEMENT VERDICT" (§6).
- Mechanism owners referenced, not restated: `skill:session-begin` (hydration
  mechanism + determinism contract), `skill:compaction` (5-loss-category
  extraction, handoff schema, degraded mode), `skill:bd-phase-policy` (phase
  gating), `scripts/bd_remember.py` (write mechanics),
  `scripts/screen_bd_proposals.py` + `scripts/check_degraded_mode.py` (guards).
