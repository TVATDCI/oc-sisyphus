# OpenCode Codebase — Complete Structure, Changes & Workflow

> **Last reviewed:** 2026-06-24 | **Next review:** When agent routing changes or a new skill is added
> **Drift-prone sections:** §Agent Routing, §Change Timeline, §Skill count, §Plugin file count
> **Stable sections:** §Directory Architecture, §Workflow State Machine, §Subagent Permissions

1. Directory Architecture (7 layers)
   ~/.config/opencode/
   ├── 1. ORCHESTRATION LAYER
   │ ├── opencode.json # Entry-point config
   │ └── oh-my-openagent.json # 17 agents + 9 categories + routing
   │
   ├── 2. INSTRUCTION LAYER
   │ ├── AGENTS.md # Root system prompt (compaction, routing)
   │ ├── SYSTEM-OVERVIEW.md # Architecture doc v4.1
   │ ├── rules/ # 14 rule files (4 language + 9 concern + README)
   │ ├── prompts/ # Context injection (main-vault, prometheus)
   │ ├── agents/ # 8 subagent .md definitions with permissions
   │ └── commands/ # Slash-command definitions (reflection)
   │
   ├── 3. SKILL LAYER
   │ ├── skills/ # 44 real skill directories + 1 \_shared refs (45 total)
   │ ├── └── each has SKILL.md + optional scripts/evals
   │ └── Notable eval sets: code-review, git-commit-message, skill-creator
   │
   ├── 4. PLANNING LAYER
   │ ├── ~/.sisyphus/ # Canonical state machine (consolidated from .sisyphus/): state.json, hotcache, evidence, notepads, plans, archive
   │ └── .omo/ # ARCHIVED (W0.3): retained as read-only historical reference; sole live state is ~/.sisyphus/
   │
   ├── 5. TRACKING LAYER
   │ └── tasks/ # Beads per project (aino, dropDeadDev, opencode, pienso, vladi...)
   │
   ├── 6. INFRASTRUCTURE LAYER
   │ ├── scripts/ # 15 scripts (load-rules, regression-gate, validate-skills-v2.py, verify-plugin-compat.js, check-doc-claims.sh, check-completion-honesty.sh, etc.)
    │ ├── plugins/sisyphus-gates/ # Governance gate plugin: 18 src modules + cli.js + dist/index.js + 15 test files (322 tests). HMAC-SHA256 verdict signing, trust-root path protection, MCP classification, throw enforcement, adversarial test suite
   │ ├── benchmark/ # 3 JSONL baseline runs (vs codegraph vs semble)
   │ └── .codegraph/codegraph.db # Search/index: semantic code index SQLite DB
   │
   └── 7. UI LAYER
   ├── tui.json # Terminal UI config (plugin: [])
   └── .vscode/settings.json # VS Code workspace settings
2. What Changed — Full Timeline
   Date Event Artifact
   May 4 Security-auditor skill designed security-auditor-design-history.md
   May 8 v2.1.1 — AGENTS extraction plan extract-agents-best-practices.md created
   May 8 12 rule files adapted with provenance rules/{languages,concerns}/\*.md
   May 8 Smoke test PASS (img-upload-with-multer) smoke-test-v2.1.1.md
   May 9 v2.1.2 — Hard gates implemented session-handoff-v2.1.2-.md
   May 24 .omo/notepads copy updated Duplicated from .sisyphus
   May 29 Compaction + memory injection features hermes-pattern-study.md, AGENTS-context-test-plan.md
   May 29 AI tools 2nd-pass evaluation good-ai-list-rescan-2026.md
   May 30 Website-analyzer v1.5.0 test ✅ PASS website-analyzer-v1.5.0-test.md
   May 30 SPA hydration negative test ✅ PASS spa-hydration-negative-test.md
   May 30 Source content refs test ✅ PASS source-content-ref-test.md
   May 30 Session close + migration sync session-close-2026-05-30.md
   May 31 Plan remediation session (THIS session):
   Oracle review: 4 of 9 criteria FAIL/WRONG Found criteria 4/5/7 were already done, 2 was broken
   scripts/load-rules.sh created Automated rule detection + loading (replaced manual Step 0)
   scripts/regression-gate.sh created Workflow validation gate
   SYSTEM-OVERVIEW.md updated v2.1.1 history added, orchestration category removed
   agents/athena.md fixed git-commit-message → athena-research skill
   agents/post-reviewer.md fixed Missing subagent frontmatter
   oh-my-openagent.json fixed z-glm-5.1 → glm-5.1 typo
   rules/frameworks/ removed Empty directory cleanup
   scripts/validate-skills.sh fixed \_shared skip logic
   VCS evidence filed vcs-integration-2026-05-31.md
   Plan status updated "Complete after remediation (2026-05-31)"
   Session handoff session-handoff-2026-05-31.md
   Jun 1 Oracle sisyphus/oracle flip (THIS session):
   Sisyphus primary → minimax-m3 (was kimi-k2.6); ultrawork → qwen3.7-max
   Oracle primary → qwen3.7-max (was glm-5.1); fallbacks [glm-5.1, minimax-m3]
   tui.json plugin fix Added "oh-my-openagent/tui" to plugin array (fixed doctor warning)
   Jun 20 oh-my-openagent.json reset + doc sync: provider/model prefixes restored in §Agent Routing; MCP home path aligned to ~/Main-vault; tui.json plugin array cleared
   Jun 24 Provider switch: full zai-coding-plan reset (14 of 17 agent primaries on zai, 5 of 9 categories). Backup at oh-my-openagent.json.backup (mixed opencode-go + opencode scheme). §Agent Routing updated; includes coverage of sisyphus-gates classifier fixes (stripLeadingEnvExport + SUBCOMMAND_BD) landed same day.
   Jun 7 W0 — Safety baseline: git init, .gitignore fix, .omo/ archive, plugin pin @4.7.5, benchmark/ removal
   Jun 7 W1 — Runtime hardening: MCP scoped to 4 paths, health-check.md, README.md, validate-skills-v2.py (37 PASS), 6 new agents added
   Jun 7 W2 — Contract migration: canonical state seeded (~/.sisyphus/state.json), plugin source restored (13 modules), 180 unit tests + 20 self-tests PASS, THREAT-MODEL.md
   Jun 7 W3 — Automation: pre-push hook, GitHub Actions CI, doc drift guards (check-doc-claims.sh, check-workflow-contract.sh), full doc rewrite SYSTEM-OVERVIEW v4.0, private remote push
   Jun 7 Fix All minimax-m3-free replaced with deepseek-v4-flash-free (12 replacements); patch-package removed (not applicable to cache-based runtime)
   Jun 8 W4 — Synthesis project: fullstack-dev skill created (863 lines, 48/48 evals) + subagent; frontend-ui-ux enhanced (anti-slop, motion, copywriting); code-review v1.1.0 (architecture patterns); security-auditor v1.3.0 (CORS/rate-limit/shutdown); document-builder created (PPTX via PptxGenJS); website-analyzer v1.6.0 (UI Critique Mode)
   Jun 8 W4 — shader-dev: constrained WebGL2 fragment-shader skill (oracle architecture, 6 recipes, 6/6 evals, 3 bugs fixed)
   Jun 8 Env Canonical path consolidation: .sisyphus/ → ~/.sisyphus/; HANDOFF.md/hotcache.md deleted; CLEANUP.md created; stale iteration-1 evals pruned
   Jun 8 Git 10 atomic commits across all 7 skills; doc-claims drift fixed (subagents 7→8, directories 38→43)
    Jun 17 Absorption from remote opencode-config repo: intent gate added to sisyphus agent prompt_append; execution-receipt and reflection skills created; check-completion-honesty.sh topology gate added; COMPLETE-CODEBASE.md counts reconciled (skills 43→45, scripts 14→15)
     Jun 21 oh-my-openagent upgraded 4.7.5 → 4.12.1: opencode.json/plugin pin, package.json/package-lock.json, tui.json plugin entry, removed stale bun.lock; .codegraph/codegraph.db untracked (already gitignored); doctor clean except pre-existing mimo-v2.5-pro fallback
     Jun 24 Absorption from remote opencode-config (TNTHNGVDYNND): Phase 0-6 security hardening + HMAC signing pivot. Oracle-consulted strategy (ses_106ac03b3ffe4Jc2iKnLVqiDNF). 6 phases: (1) adversarial tests ported, (2) behavioral hardening — throw enforcement, Layer 0 trust-root paths, Layer 3.5 MCP classification, task fail-closed, command-policy chaining/substitution/wrappers, (3) HMAC-SHA256 signing core — verdict-signing.js, memory-key.js, gate-logger.js, state.js pivot to signed verdicts, (4) CLI signing tool — cli.js with sign-verdict + approve commands, (5) workflow.yaml update — stale path fix, W1.B transition fix, forgeable auto-advance removed, schema 2.0.0→3.0.0, (6) doc update. Plugin src 13→18, tests 9→15 (180→322 tests), new: trust-root-paths.js, mcp-classifier.js, verdict-signing.js, memory-key.js, gate-logger.js, cli.js. opencode.json plugin config changed to array form with verdict_key_command. HMAC key at ~/.local/share/sisyphus-gate-key (chmod 600). Hard cutover: unsigned verdicts no longer trusted
3. Complete Workflow — 9-Phase State Machine
   ╔══════════════════════════╗
   ║ GLOBAL BLOCKING RULES ║
   ║ • Destructive cmds denied║
   ║ • Fail-closed on no state║
   ║ • Gate fail = all blocked║
   ║ • Unapproved = no commit ║
   ║ • Trust-root paths locked║
   ║ • HMAC signing required  ║
   ╚══════════════════════════╝

┌────────────┐ auto on ┌────────────┐ auto on PRD write ┌────────────┐
│ Discovery │──skill:prd──►│ PRD-Writing│──────────────────────►│ PRD-Review │
│ (no gates) │ writer or │ (no gates) │ path contains "prd" │ ⛔ GATE │
│ │ user approve│ │ │ │
└────────────┘ └────────────┘ │ momus-prd │
│ reviewer │
│ │
│ Blocks: │
│ write/edit │
│ git commit │
│ git push │
└─────┬──────┘
│ Operator signs verdict:
│ node cli.js sign-verdict prd <id> PASS
│ → HMAC-signed artifact written
│ → loadSignedVerdicts verifies
│ → prd_gate=PASS, prd_approved=true
▼
┌────────────┐ auto on ┌────────────┐ manual ┌──────────────┐
│Issue-Create│──skill:plan──►│Plan-Writing│──approve──►│ Plan-Review │
│ (no gates) │ writer or │ (no gates) │ │ ⛔ GATE │
│ │ user approve│ │ │ │
└────────────┘ └────────────┘ │ momus-plan │
│ reviewer │
│ │
│ Blocks: same │
└──────┬───────┘
│ Operator signs verdict:
│ node cli.js sign-verdict plan <id> PASS
│ → HMAC-signed artifact written
│ → plan_gate=PASS, plan_approved=true
│ Then operator approves:
│ node cli.js approve <id>
│ → approval_status=approved
▼
┌──────────────────────┐ evidence ┌──────────────┐ regression ┌────────────┐
│ Execution (wave-exec)│──self-loop──► │ Validation │──script────► │ Close │
│ ┌──────────────────┐ │ logs evidence │ (regression- │ gate.sh │ ⛔ GATE │
│ │ Wave N │ │ │ gate.sh) │ │ │
│ │ implement slice │──► checkpoint-3 │ │ │ │ Blocks: │
│ │ log evidence │ │ (between-wave)│ │ │ │ bd close │
│ └──────────────────┘ │ │ │ │ │ unless │
│ ┌──────────────────┐ │ │ │ │ │ evidence │
│ │ Wave N+1 │ │ │ │ │ │ logged │
│ │ implement slice │──► checkpoint-3 │ │ │ │ │
│ │ log evidence │ │ (between-wave)│ │ │ │ │
│ └──────────────────┘ │ │ │ │ │ │
│ bash blocked │ │ │ │ │ │
│ (non-destructive only)│ │ │ │ │ │
└──────────────────────┘ └──────────────┘ └────────────┘
Phase Details

# Phase Skill Gates Blocks Advance Trigger

1 discovery discovery-orchestrator none none skill:prd-writer or user approval
2 prd-writing prd-writer none none Auto: path contains "prd"
3 prd-review ⛔ momus-prd-reviewer HMAC-signed verdict (cli.js sign-verdict) write, edit, git commit/push Operator signs: node cli.js sign-verdict prd <id> PASS
4 issue-creation issue-creator none none Auto: path contains "plan"
5 plan-writing plan-writer none none Manual: plan_written
6 plan-review ⛔ momus-plan-reviewer HMAC-signed verdict (cli.js sign-verdict) write, edit, git commit/push Operator signs: node cli.js sign-verdict plan <id> PASS, then: node cli.js approve <id>
7 execution wave-executor checkpoint-3 (between waves) bash (non-destructive only) Manual: wave approval; self-loop on evidence
8 validation regression-gate script: regression-gate.sh (exit 0) none Manual: user_confirms_validation
9 close ⛔ plan-closer evidence_check: evidence_logged==true bd close unless logged Manual: user_confirms_close
Agent Routing (17 runtime agents × 9 categories)
17 Named Agents (runtime): sisyphus (zai-coding-plan/glm-5.2, high; ultrawork: zai-coding-plan/glm-5.1), hephaestus (zai-coding-plan/glm-5.1), oracle (zai-coding-plan/glm-5.2, high), librarian (zai-coding-plan/glm-4.7), explore (opencode/deepseek-v4-flash-free), multimodal-looker (zai-coding-plan/glm-5v-turbo), prometheus (zai-coding-plan/glm-5.1), metis (zai-coding-plan/glm-5.1), momus (zai-coding-plan/glm-5.2), atlas (zai-coding-plan/glm-5.1), sisyphus-junior (zai-coding-plan/glm-5.1), archivist (zai-coding-plan/glm-5.1), athena (zai-coding-plan/glm-4.7), auditor (opencode/deepseek-v4-flash-free), explorer (opencode/deepseek-v4-flash-free), post-reviewer (zai-coding-plan/glm-5.2), reviewer (zai-coding-plan/glm-5.2)
9 Categories (via task(category='...')): deep→zai-coding-plan/glm-5.1, ultrabrain→zai-coding-plan/glm-5.2, visual-engineering→zai-coding-plan/glm-5v-turbo, quick→opencode/deepseek-v4-flash-free, unspecified-high→zai-coding-plan/glm-5.1, unspecified-low→opencode/deepseek-v4-flash-free, writing→zai-coding-plan/glm-4.7, artistry→opencode/mimo-v2.5-free, git-commit-message→opencode/deepseek-v4-flash-free
Provider mix: agents lean zai-coding-plan (14 of 17 primaries), opencode (3: explore, auditor, explorer). Categories: zai-coding-plan (5: deep, ultrabrain, visual-engineering, unspecified-high, writing), opencode (4: artistry, quick, unspecified-low, git-commit-message). Most constrained model: zai-coding-plan/glm-5.2 (concurrency: 1) — primary for 5 agents (sisyphus, oracle, momus, post-reviewer, reviewer) and 1 category (ultrabrain); zai-coding-plan/glm-5.1 (concurrency: 2) — primary for 6 agents (hephaestus, prometheus, metis, atlas, sisyphus-junior, archivist) + sisyphus ultrawork variant and 2 categories (deep, unspecified-high); zai-coding-plan/glm-4.7 (concurrency: 5) — primary for 2 agents (librarian, athena) and 1 category (writing); zai-coding-plan/glm-5v-turbo (concurrency: 2) — primary for 1 agent (multimodal-looker) and 1 category (visual-engineering). opencode/deepseek-v4-flash-free (free tier, concurrency: 20) is primary for 3 agents (explore, auditor, explorer) and 3 categories (quick, unspecified-low, git-commit-message); opencode/mimo-v2.5-free (free tier) — primary for 1 category (artistry). Fallback chains still route to opencode-go and opencode models on zai failures (runtime_fallback enabled); modelConcurrency trimmed to zai-only entries (5 models) since non-zai models use providerConcurrency limits. Provider switch (Jun 24): reset to full zai-coding-plan to maximize zai quota usage during opencode-go free-tier exhaustion. Backup pair at oh-my-openagent.json.backup + COMPLETE-CODEBASE.md.backup (mixed opencode-go + opencode provider scheme with full modelConcurrency). Swap workflow: cp oh-my-openagent.json.backup oh-my-openagent.json && cp COMPLETE-CODEBASE.md.backup COMPLETE-CODEBASE.md.

8 Subagent .md Permissions (security boundaries)
Only 2 agents have write access: archivist (write: ~/Main-vault/wiki/**, index.md, log.md, hotcache.md, .sisyphus/evidence/**, .sisyphus/plans/**, .sisyphus/boulder.json, .sisyphus/notepads/**, projects/**; deny: _.env_, _.pem, _.key, _credentials_, _secrets_, ~/Main-vault/raw/**) and fullstack-dev-tester (edit: \*: allow). All others are read-only or read+network. oracle is the most restricted (read-only, no bash, no edit). Plugin Layer 0 (trust-root-paths.js) additionally blocks ALL tools — including archivist and fullstack-dev-tester — from writing to ~/.sisyphus/state.json, workflow.yaml, verdict files, /proc, and plugin source. Trust-root protection is unconditional: no phase, no approval, no agent permission overrides it.
