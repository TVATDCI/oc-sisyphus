---
name: bd-phase-policy
description: "bd (beads) subcommand phase policy under sisyphus-gates (gate v0.4.1+): phase-agnostic vs phase-gated subcommand lists, plus the gate-safe scripts/bd_remember.py wrapper for memory writes. Load before running any bd subcommand outside an execution phase."
metadata:
  internal: true
---

# bd subcommand phase policy (gate v0.4.1+)

**Phase-agnostic** (work in all phases, including fail-closed / session-begin): all reads (`list`, `show`, `search`, `memories`, `stats`, `ready`, `blocked`, `dep`, `doctor`, `stale`, `orphans`, `lint`, `preflight`, `prime`) + append-only record writes (`remember`, `create`, `update`).

**Phase-gated** (blocked outside execution): `close` (requires evidence logged), `defer`, `supersede`, `forget` (deletion), `mol`, `human`, `setup`, `dolt` (incl. `dolt push`, session-close gate), `edit` (interactive), plus the brain-hxm (P0) destructive extensions: `delete`, `sql`, `prune`, `purge`, `gc`, `compact`, `flatten`, `batch`, `import`, `admin` (top-level cover — `admin reset`), `hooks` (top-level cover — `hooks install` persistence vector).

For memory writes via `bd remember`, use `python3 scripts/bd_remember.py` (gate-safe wrapper — passes the `|` delimiter inside Python argv, never hits the shell-safety gate).
