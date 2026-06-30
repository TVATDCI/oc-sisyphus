Verdict: UPDATE — pin oh-my-openagent to 4.14.0 exactly.
The config schema is forward-compatible (in fact 4.14.0 correctly accepts restore_primary_after_cooldown, which the 4.12.1 schema omits), dependencies are unchanged, the tuple plugin form for sisyphus-gates is still supported, and the MCP scope-filter logic is identical. The main caveat is that 4.13.0 shipped a large feature delta that was previously deferred; 4.14.0 hardens it but does not remove it, so the update should be staged with the test plan below.
What changed
4.13.0 (2026-06-22) — large feature/hardening release

- Features: TeamMode v2 rewrite; Ultimate Browsing shared skill; ULW-loop research work-shape branch; CodeGraph auto_init config toggle; per-member thread titles; Lazycodex update release notes.
- Fixes: Provider-exhaustion fallback for background tasks; runtime-fallback timeout rearming after blocked escalation; delegate-task parent-wake retry bounding; skill MCP servers resolved from runtime config without deadlock; TeamMode worktree idempotency on Windows.
- Breaking/removed: AST-grep MCP server removed, replaced with shared sg resolver/skill.
- Deps: No new runtime dependencies; @opencode-ai/plugin and sdk stay at 1.15.13.
  4.13.1
- Does not exist on the npm registry. npm view oh-my-openagent@4.13.1 returns E404; the version list jumps from 4.13.0 directly to 4.14.0.
  4.14.0 (2026-06-29) — compatibility/stability release
- Features: Unified telemetry architecture; Coding Agent Sessions shared skill; Atlas final-review verdict classification; web-terminal visual-evidence helper; named plugin server export (omoPlugin); frontend designpowers integration.
- Fixes: Atlas background-output gate; TeamMode leader patience; CodeGraph child-process env isolation; Windows Codex desktop install flow; Context7 placeholder auth removed; ULW-loop context-pressure tail scan; visual QA CJK line breaks.
- Behavior changes: ultraresearch skill renamed to ulw-research with a legacy ultraresearch alias; experimental Codex workflow selector removed.
- Deps: Identical to 4.12.1 (no new packages, same overrides).
  Compatibility assessment
  Load-bearing surface Status Evidence

1. Agent config (17 agents, model, variant, fallback_models, prompt_append, ultrawork) COMPATIBLE 4.14.0 schema source packages/omo-opencode/src/config/schema/agent-overrides.ts still defines all these fields; active config validates.
2. Category config (9 categories incl. custom artistry) COMPATIBLE categories schema in both versions uses open additionalProperties with model, fallback_models, description, prompt_append supported.
3. background_task (defaultConcurrency, staleTimeoutMs, providerConcurrency, modelConcurrency) COMPATIBLE Schema identical for used fields; minima unchanged (staleTimeoutMs min 60000; our value 180000).
4. runtime_fallback (retry_on_errors, cooldown_seconds, restore_primary_after_cooldown) COMPATIBLE 4.14.0 schema includes restore_primary_after_cooldown; 4.12.1 schema omitted it despite our config using it.
5. MCP loader / roots protocol COMPATIBLE scope-filter.ts in 4.14.0 (shouldLoadMcpServer) has the same scope !== "local" / containsPath(projectPath, cwd) logic as 4.12.1 dist/index.js:71494.
6. Plugin array tuple form for sisyphus-gates COMPATIBLE packages/omo-opencode/src/shared/load-opencode-plugins.ts in 4.14.0 still extracts plugin[0] from [string, opts] tuples.
7. Coexistence with sisyphus-gates COMPATIBLE / NEEDS-TESTING sisyphus-gates has no runtime dependency on OmO (only comments in plugin.js). New tools may be gated, which is expected gate behavior, not an OmO break.
8. Schema URL COMPATIBLE $schema URL unchanged; 4.14.0 schema is served from the same dev/assets/oh-my-opencode.schema.json path.
   Update plan
9. Back up configs

- cp ~/.config/opencode/opencode.json ~/.config/opencode/opencode.json.bak.4.12.1
- cp ~/.config/opencode/oh-my-openagent.json ~/.config/opencode/oh-my-openagent.json.bak.4.12.1

1. Lock out auto-drfit

- Add "auto_update": false to ~/.config/opencode/oh-my-openagent.json (OmO defaults this to true in dist/index.js:117993, and you want deliberate pins).

1. Bump the plugin pin

- In ~/.config/opencode/opencode.json, change "oh-my-openagent@4.12.1" to "oh-my-openagent@4.14.0".

1. Install / cache

- Restart OpenCode so it fetches 4.14.0 into ~/.cache/opencode/packages/oh-my-openagent@4.14.0/.
- Alternative if OpenCode does not auto-fetch: cd ~/.cache/opencode && bun add oh-my-openagent@4.14.0.

1. Verify load

- bunx oh-my-openagent doctor
- opencode --version (confirm no plugin crash).

1. Validate runtime

- Run the test plan below.
- Do not delete the 4.12.1 cache until validation passes.

1. Rollback (if needed)

- Restore the two backed-up JSON files.
- Restart OpenCode; it will fall back to 4.12.1 from cache.
  Test plan
- Doctor / config: bunx oh-my-openagent doctor reports plugin registered, config valid, models resolvable, no schema errors.
- Agent dispatch: Trigger a task(category="quick", ...) and a task(category="oracle", ...); confirm the request routes and the fallback chain still works.
- Background tasks: Fire two background Oracle tasks concurrently and confirm they respect the modelConcurrency for zai-coding-plan/glm-5.2.
- MCP roots: Run a workspace-scoped MCP read; confirm only the workspace root is advertised (today’s documented behavior).
- sisyphus-gates: Run a permitted read and a permitted bash command; verify gate verdicts still sign/verify correctly. If any new OmO tool is blocked, capture the gate log and treat as an allowlist review item (do not modify gates logic).
- Optional but recommended: cd ~/.config/opencode/plugins/sisyphus-gates && npm test to confirm the gates plugin is unaffected.
  Risks
- 4.13.0 feature delta: TeamMode v2, Ultimate Browsing, and provider-exhaustion fallback are large new paths. Config-compatible does not mean bug-free; run the agent/background-task smoke tests.
- Plugin specifier resolution: OpenCode has had bugs resolving package-name plugin entries (issue #3704). Versioned pins work today, but if oh-my-openagent@4.14.0 fails to resolve, fall back to a file:// entry pointing at ~/.cache/opencode/packages/oh-my-openagent@4.14.0/node_modules/oh-my-openagent/dist/index.js.
- sisyphus-gates allowlist: New tools introduced in 4.13.0/4.14.0 (e.g., monitor, codegraph MCP wrappers) may be blocked by Layer 3.7 until the human allowlist is reviewed.
- Auto-update drift: Without "auto_update": false, OmO may attempt to rewrite the pinned version on startup.
