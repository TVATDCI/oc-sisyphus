# DRAFT — DO NOT FILE without the captain's word (fleet rule: upstream filings are captain-worded)

Status: prepared by fm/backlog-impl (P1-b), 2026-10-22. Not filed anywhere.
Target repo: the opencode repository (checked out at tag v2.1.0 for source
citations; live binary v2.1.2 shows the same behavior). Filing convention
from the fleet's prior upstream issue (earendil-works/pi#10631 era): body
template-compliant, minimal repro, no fleet internals, AI-labeled.

---

## Proposed title

`agent.list / agent.get / debug agents return an empty registry while runtime agent resolution works — and unregistered agent names silently proceed on a default model`

## Body draft

### Description

On opencode 2.1.0 and 2.1.2, the agent-registry read surfaces are empty
even for configured agents, while runtime agent resolution works:

- `opencode debug agents` prints `[]`
- `opencode api agent.list` returns `{"data":[]}`
- `opencode api agent.get --param agentID=<configured-name>` returns 404
  `AgentNotFoundError` for a name that IS configured (both in the
  opencode.json `agent` map and as an `agents/<name>.md` file)

This holds on a fresh `--standalone` server started in a project that
configures 24 agents (map + markdown files), and on a long-running
background service. Even the built-in agents (build/plan family) do not
appear on a fresh server, which suggests the surface, not the config
loading, is affected.

Runtime behavior at the same time:

- a subagent spawn via the task tool resolves the configured agent, applies
  its markdown body, and (per `packages/core/src/tool/plugin/subagent.ts`,
  `override ?? agent.model ?? parent.model`) its configured model — the
  registry's runtime half works.
- BUT a session created with an agent reference and no explicit model (for
  example the non-interactive run path, `packages/cli/src/run/run.ts`:
  `session.create` receives the agent but no model) commits NO model and
  serves default model resolution, with the agent label stamped on the
  session row. The same happens for an agent name that is not registered
  at all: the run proceeds silently on a default (observed: a free-tier
  default model), which makes every unregistered-name run a silent
  misconfiguration.

### Steps to reproduce

1. In any directory with `opencode.json` containing an `agent` map entry
   (or an `agents/foo.md` file), run:

   ```
   opencode api --standalone agent.list
   ```

   Expected: the configured agent(s) (plus built-ins) are listed.
   Actual: `{"data":[]}`.

2. `opencode api --standalone agent.get --param agentID=<configured-name>`
   → 404 `AgentNotFoundError`.

3. `opencode run --standalone --agent <configured-name> "reply with one
   word"` → the run succeeds on the DEFAULT model (not the agent's
   configured model); the session row (storage `session_v2.model`) is
   empty/null while its `agent` column carries the label.

### Expected behavior

- `agent.list` / `agent.get` / `debug agents` reflect the configured and
  built-in agents (or document why the surface is intentionally lazy).
- Referencing an unregistered agent name on any entry point (session
  create, run, subagent spawn) should fail loudly instead of proceeding on
  a default model with the label stamped.

### Environment

- opencode 2.1.0 (source inspection) and 2.1.2 (live repro), Linux x64
- config: opencode.json `agent` map + `agents/*.md` files

---

## Fleet-side mitigations already in place (NOT for the upstream body)

- `plugins/sisyphus-gates/src/registry-guard.js`: blocking guard at tool
  execute.before (unregistered agent label / subagent type refused loudly)
  + one-time in-process registry-vs-configured divergence log
  (`ctx.agent.list()`, not the HTTP surface).
- `scripts/check-agent-registry.py`: startup validation leg (configured vs
  server surface, fails loudly).
- `scripts/generate-pipeline-personas.py --check-variant-parity`: the
  session-row parity leg that surfaces served-vs-pinned divergence.
- Known gap (deliberate, source-bound): pure-chat runs that never call a
  tool cannot be blocked on any V2 hook (session hooks cannot fail; only
  tool execute.before has a failure channel) — detect-only for that class.
