Architectural Review: agents/_.md vs oh-my-openagent.json
Bottom line
The two layers are complementary, not redundant — they own disjoint concerns and merge at runtime. agents/_.md are opencode-native agent definitions (identity, permissions, mode, temperature, behavioral prompt) loaded by opencode's compat layer. oh-my-openagent.json is the oh-my-openagent plugin's model-routing config (which model runs each agent, fallback chains, variant, prompt_append). Neither can be removed without losing function: delete the .md files and the user-defined agents stop existing; delete the JSON and every agent loses its model + fallback routing.

1. What agents/_.md defines (8 files in ~/.config/opencode/agents/)
   File (agent name) mode temp read edit bash Other
   oracle.md subagent 0.1_: allow _: deny_: deny websearch/webfetch allow; read-only consultant prompt
   archivist.md subagent 0.1 _: allow vault paths allow;_.env*/*.pem/secrets deny python3/bash/bd/ls/grep/find/cp -f/mv -f/touch/git status·log·diff: allow; git add·commit·push/rm: ask; sudo/dd/shutdown: deny Only write-capable vault agent
   athena.md subagent 0.1 — — — Uses legacy tools:/disallowedTools:/permissions: schema (not permission:); load*skills: [athena-research]
   auditor.md subagent 0.0*: allow deny grep/cat/wc/ls/find/python3 -c/git status·log·diff: allow; rm/sudo: deny; rest ask Read-only validator
   explorer.md subagent 0.1 — — — Legacy tools: schema (read/grep/websearch/webfetch)
   reviewer.md subagent 0.1 _: allow deny read-only bash allowlist Combined oracle+auditor+post-reviewer
   post-reviewer.md subagent 0.1_: allow deny read-only bash allowlist Post-change code-quality gate
   fullstack-dev-tester.md subagent 0.1 \_: allow \*: allow npm run/install/npx/tsc/node: allow; rest ask load_skills: [fullstack-dev]; only agent with broad edit + no JSON entry
   Key observation: none of the 8 .md files defines a model: field. Two files (athena.md, explorer.md) use the older tools:/permissions: schema rather than the newer permission: block — the plugin's migrateAgentConfig() (dist/index.js:24445) normalizes these at load time.
2. What oh-my-openagent.json agents defines (17 entries)
   Each entry maps agent name → routing only. No permissions, no temperature, no mode, no behavioral prompt.
   Agent model variant fallback chain prompt_append
   sisyphus glm-5.2 high kimi-k2.7-code → glm-5.2 → glm-5.1 sisyphus-guidance.md (+ultrawork block)
   hephaestus glm-5.1 — glm-5.1 → kimi-k2.5 → deepseek-v4-flash hephaestus-guidance.md
   oracle glm-5.2 high gpt-5.4 oracle-guidance.md
   librarian glm-4.7 — minimax-m2.7 → deepseek-v4-flash librarian-guidance.md
   explore minimax-m2.7 — glm-4.7 → deepseek-v4-flash explore-guidance.md
   multimodal-looker glm-4.6v — mimo-v2-omni → mimo-v2.5-free —
   prometheus glm-5.1 — glm-5.1 → glm-5.1 prometheus-guidance.md
   metis glm-5.1 — kimi-k2.5 → qwen3.6-plus —
   momus glm-5.2 — kimi-k2.7-code → gpt-5.4 —
   atlas glm-5-turbo — kimi-k2.6 → kimi-k2.6 —
   sisyphus-junior glm-5-turbo — qwen3.7-plus → kimi-k2.6 —
   archivist glm-5.1 — kimi-k2.5 → deepseek-v4-flash —
   athena glm-4.7 — minimax-m2.7 → deepseek-v4-flash —
   auditor glm-4.7 — kimi-k2.5 → deepseek-v4-flash —
   explorer glm-4.7 — minimax-m2.7 → deepseek-v4-flash —
   post-reviewer glm-5.2 — glm-5.2 → deepseek-v4-flash —
   reviewer glm-5.2 — glm-5.2 → deepseek-v4-flash —
   The JSON also owns: runtime_fallback (retry codes/cooldown), categories (9 domain routers), background_task concurrency, experimental flags, git_master — none of which have any counterpart in the .md layer.
3. The architectural split (which layer owns what)
   Concern Owner Source of truth
   Agent exists + is dispatchable opencode native presence of .md file (or plugin-bundled .md)
   description (trigger/routing text) opencode native .md frontmatter
   mode (primary/subagent) opencode native .md frontmatter
   temperature opencode native .md frontmatter
   Permissions (read/edit/bash/websearch/webfetch) opencode native .md permission: block
   tools/load_skills opencode native .md frontmatter
   Behavioral system prompt opencode native .md markdown body
   Model that runs the agent oh-my-openagent plugin agents.<name>.model
   Fallback chain oh-my-openagent plugin agents.<name>.fallback_models
   variant oh-my-openagent plugin agents.<name>.variant
   prompt_append (extra injected guidance) oh-my-openagent plugin agents.<name>.prompt_append → file://
   ultrawork model oh-my-openagent plugin agents.<name>.ultrawork
   Category routing, runtime fallback, concurrency oh-my-openagent plugin top-level JSON keys
   The split is clean: opencode decides what the agent is and what it may do; the plugin decides which LLM runs it and how it fails over.
4. Precedence and merge behavior at runtime
   Evidence from dist/index.js:

- opencode-native loader reads ~/.config/opencode/agents/ via loadOpencodeGlobalAgents() (dist/index.js:119515–119528), which calls getOpenCodeConfigDirs({binary:"opencode"}) + /agents. Each .md is parsed by parseMarkdownAgentFile() and keyed by filename → agent name. The tools:/permissions: legacy schema is migrated to the permission: shape by migrateAgentConfig() (dist/index.js:24445–24461).
- oh-my-openagent reads its JSON agents block as a pure routing overlay — it does not re-parse or override the .md permissions. The plugin's team-mode code even hardcodes read/write knowledge independently (e.g. dist/index.js:12922: "Agent 'oracle' is read-only (cannot write files)") rather than reading it back from the .md.
- A separate path (dist/index.js:78927) loads agents bundled inside each plugin's install dir (<installPath>/agents/) — this is how the 10 JSON-only agents (sisyphus, atlas, momus, …) get their prompt bodies. Confirmed by dist/agents/atlas/agent.d.ts, dist/agents/momus.d.ts.
  Merge order (lowest → highest precedence for the fields each touches):

1. opencode built-in agents
2. plugin-bundled .md agents (scope opencode)
3. ~/.config/opencode/agents/\*.md (scope opencode, user overrides — first definition wins per loadOpencodeGlobalAgents)
4. oh-my-openagent JSON layered on top for routing-only fields (model, fallback, variant, prompt_append) — it does not touch permission/mode/temperature.
   Because the two layers touch disjoint field sets, there is no field-level conflict to resolve. Where both name an agent (e.g. oracle), the .md supplies identity+permissions+prompt, the JSON supplies the model — they compose, they don't compete.
5. Gaps — agents in one layer but not the other
   In JSON only (10) — no .md in ~/.config/opencode/agents/, sourced from the plugin's own bundle: sisyphus, hephaestus, librarian, explore, multimodal-looker, prometheus, metis, momus, atlas, sisyphus-junior. ✅ Expected — these are plugin-provided agents.
   In .md only (1): fullstack-dev-tester.md has no entry in oh-my-openagent.json. Consequence: it has no pinned model, no fallback chain, no prompt_append. It will fall back to category/default routing. If predictable model behavior matters for this agent, this is a real gap.
   Name mismatch (likely bug): JSON defines explore; the user .md is named explorer. These are two different agent names — explore is the plugin-bundled research agent (with its own model entry), explorer is the user-defined .md. They are not aliases; both exist independently. If the user intended explorer.md to override/route explore, it does not — verify intent.
   Overlapping (7): oracle, archivist, athena, auditor, explorer, post-reviewer, reviewer exist in both — and this is the correct, intended pattern (.md = definition, JSON = routing).
6. Verdict
   Essential + complementary. The agents/ directory is the opencode-native definition layer; oh-my-openagent.json is the plugin routing layer. Removing either breaks the system:

- Delete agents/\*.md → oracle/archivist/auditor/etc. cease to exist (no permissions, no prompt, no identity). The JSON entries for them become dangling routing rules with no agent to route to.
- Delete the JSON → every agent loses its model, fallback chain, variant, and prompt_append; categories and runtime fallback vanish entirely.
  Recommended changes (optional, read-only review — do not apply without confirmation):

1. Add fullstack-dev-tester to oh-my-openagent.json — it's the only user-defined agent with no model routing (Quick effort).
2. Reconcile explore vs explorer — confirm whether the user .md should be renamed to explore to override the plugin-bundled one, or kept separate intentionally (Quick effort).
3. Migrate athena.md and explorer.md from the legacy tools:/permissions: schema to the permission: block used by the other 6 files — consistency only; the migrateAgentConfig() shim handles it today, but a future plugin version could drop the shim (Short effort).
   No structural/action: the two-layer design is correct and should be preserved.
