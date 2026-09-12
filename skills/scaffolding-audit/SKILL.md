---
name: scaffolding-audit
description: |
  Audit prompt/skill scaffolding for stale model claims when models or plans
  change — the 9-step-harness Step-9 pruning gap, closed (sis twin of the
  pi skill; one hash-pinned shared spec). Deterministic 5-class scan
  (historical model ids, workaround prose, era-pinned quota constants,
  doctrine residue, dated knowledge) over sis routing surfaces — omo
  binding config (agents + categories, primary + fallback_models chains),
  the skill tree, repo-root routing/count docs — plus skill-count claim
  verification, doctrine diff vs the last audited commit, manifest-diff
  drift check, and the omo doctor leg. Read-only, propose-only: flags carry
  file:line + class + quote + suggested action; the operator arbitrates
  every change. Triggers: "scaffolding audit", "stale scaffolding",
  "audit routing text", "drift check", "routing state drifted". Do NOT use
  for: live endpoint verification (model-audit), skill gap/overlap maps
  (skill-auditor), applying proposed edits, or pi-side surfaces.
---

# Scaffolding Audit (sis twin)

Steering surface for model/plan churn on the sis desk: routing text executes
constantly, but nothing audited it on change. This skill is that audit. It is
the twin of the pi landing (`~/.pi/agent/skills/scaffolding-audit/`) — same
routine, same vendored spec, sis surfaces. Posture first, always:

## Hard rules

- **Propose-only (INV-1).** Every flag is a suggestion with evidence. This
  skill never deletes, edits, or applies anything — the only permitted writes
  are its own state-dir manifest (only via the explicit non-dry recording
  script) and stdout.
- **Read-only by default.** `scan.ts` and `drift-check.ts` never write. Run
  them with `deno run --allow-read` — the permission grant itself proves the
  read-only posture.
- **Scope mode is invocation-selected, never auto-detected (AC-8).**
  `--scope=full` or `--scope=diff` must be supplied explicitly; without it
  the scan exits with a usage error. No code path guesses model-change days
  from ambient state.
- **Legacy vocabulary only (INV-3).** The twin reads and records `.model` /
  `fallback_models` keys only; it never emits or requires the chain-format
  key. It never edits `~/.omo/omo.jsonc`, the desk variants
  (`omo.ddd.jsonc` / `omo.tnt.jsonc`), or anything under `~/.pi/agent/`.
- **JSONC-aware parsing only** for the binding config — comments and
  trailing commas are handled by the string-aware parser in
  `scripts/lib/model-state.ts` (repo precedent: `scripts/omo-query.js`);
  never a naive JSON parse.
- **Vocabulary authority is the vendored spec** at `spec/spec-shared.md`
  (shared with the pi landing, hash-pinned per OPEN-1). Never re-define or
  re-word the five classes locally. Every audit starts with the audit-time
  hash-identity check (§ Vendoring).

## Audited surfaces (self-enumerated)

1. `~/.omo/omo.jsonc` — agents + categories: primary assignments and
   `fallback_models` chains (the model-binding source of truth).
2. Repo-root routing/count docs — root `*.md` self-enumerated at run time
   (incl. `COMPLETE-CODEBASE.md`, `AGENTS.md` routing text, `README.md`).
3. `skills/<name>/SKILL.md` — enumerated at run time (never a hardcoded
   count), excluding this skill's own dir (self-exclusion: its docs
   legitimately quote specimens) and `_`-prefixed shared-ref dirs.

## Workflow

1. **Hash-identity check** (OPEN-1): the scan hashes the vendored spec; when
   the pi landing's copy is reachable, hashes must match — mismatch = hard
   stop (divergence, AC-13).
2. **Drift check** (cheap leg, manifest-diff only — INV-2):
   `deno run --allow-read scripts/drift-check.ts` — opens ONLY the state
   manifest + `~/.omo/omo.jsonc`; prints the single reminder flag
   `routing state drifted since last audit — run scaffolding-audit` when
   stale or never-audited; silent when fresh; never writes.
3. **Scan** (invoked leg):
   `deno run --allow-read --allow-run=git scripts/scan.ts --scope=full`
   (diff-scope needs a manifest anchor: `--scope=diff`). Emits the flag
   report + doctrine-diff section to stdout. Deterministic: no network, no
   model calls, no wall-clock fields in the report. Includes the sis
   structural layer: skill-count claims in routing/count docs are verified
   against the self-enumerated tree (`c4-skill-count-claim`, class 4).
4. **omo doctor leg (validation, D4).** Run `omo doctor` (non-interactive
   fallback: `node ~/.cache/opencode/packages/oh-my-openagent@<ver>/node_modules/oh-my-openagent/bin/oh-my-opencode.js doctor`,
   form pinned at `scripts/deploy-omo.sh:21`) and embed its output VERBATIM
   in the report. If unavailable, record a noted-missing leg — the text
   audit still completes (no hard failure).
5. **Report.** Every flag: `file:line` + class (1–5) + verbatim quote +
   suggested action (always begins `PROPOSE ONLY — operator arbitrates:`) +
   finding hash. First live reports go to the operator — arbitration is the
   standing steering mechanism.
6. **Record (explicit non-dry only).**
   `deno run --allow-read --allow-run=git --allow-env --allow-write=<skill-dir>/state scripts/manifest.ts --scope=full`
   — runs the scan and records `state/manifest.json` (recorded-at,
   surface-scope, last-audit-commit, model-state, finding-hashes per the
   vendored spec §3). Never at session start; superseded by each new audit;
   no cleanup job.

## Session-begin drift wiring (OPEN-2 ruling)

The opencode session-begin path may invoke the read-only check:

```
deno run --allow-read ~/.config/opencode/skills/scaffolding-audit/scripts/drift-check.ts
```

Zero writes, O(manifest), at most one stdout reminder line. The wiring rides
the existing session-begin slot only — no new infra, no daemon, no store.

## Vendoring (OPEN-1)

`spec/spec-shared.md` is byte-identical across both landings (sha256
`962cddbda8635e8afc821a894482af0ed277f2fc216a94f6bc609c084c6200d3` at v1.0);
divergence = hard audit failure. Class wording and rule-table extensions are
made in the spec and re-vendored to both landings in one change.

## Classification source

The deterministic rule table lives IN the vendored spec
(`<!-- sca-rule-table-v1 -->` JSON block) — both landings parse the same
table, so classification cannot diverge. Deterministic scan entry point:
`scripts/scan.ts` (required by the cross-landing divergence test; never
LLM-judged). The sis structural skill-count layer
(`c4-skill-count-claim`) is a sis-surface invariant over the
self-enumerated tree, not a local class definition — the pi surface set
contains no count-claim docs, so the layer has no pi counterpart by design.
