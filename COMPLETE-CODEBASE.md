# OpenCode Codebase — Complete Structure, Changes & Workflow

> **Last reviewed:** 2026-06-17 | **Next review:** When agent routing changes or a new skill is added
> **Drift-prone sections:** §Agent Routing, §Change Timeline, §Skill count
> **Stable sections:** §Directory Architecture, §Workflow State Machine, §Subagent Permissions

1. Directory Architecture (7 layers)
   ~/.config/opencode/
   ├── 1. ORCHESTRATION LAYER
   │ ├── opencode.json # Entry-point config
   │ └── oh-my-openagent.json # 17 agents + 9 categories + routing
   │
   ├── 2. INSTRUCTION LAYER
    │ ├── AGENTS.md # Root system prompt (compaction, routing)
    │ ├── SYSTEM-OVERVIEW.md # Architecture doc v4.0
    │ ├── rules/ # 14 rule files (4 language + 9 concern + README)
   │ ├── prompts/ # Context injection (main-vault, prometheus)
   │ └── agents/ # 8 subagent .md definitions with permissions
   │
   ├── 3. SKILL LAYER
   │ ├── skills/ # 45 directories (44 real + 1 _shared refs)
   │ ├── └── each has SKILL.md + optional scripts/evals
   │ └── Notable eval sets: code-review, git-commit-message, skill-creator
   │
     ├── 4. PLANNING LAYER
     │ ├── ~/.sisyphus/ # Canonical state machine (consolidated from .sisyphus/): state.json, hotcache, evidence, notepads, plans, archive
     │ └── .omo/ # ARCHIVED (W0.3): was sync mirror, now sole live state is ~/.sisyphus/
   │
   ├── 5. TRACKING LAYER
   │ └── tasks/ # Beads per project (aino, dropDeadDev, opencode, pienso, vladi...)
   │
   ├── 6. INFRASTRUCTURE LAYER
    │ ├── scripts/ # 15 scripts (load-rules, regression-gate, validate-skills-v2.py, verify-plugin-compat.js, check-doc-claims.sh, check-completion-honesty.sh, etc.)
   │ ├── plugins/sisyphus-gates/ # Compiled gate plugin (dist/index.js)
   │ ├── benchmark/ # 3 JSONL baseline runs (vs codegraph vs semble)
   │ └── .codegraph/codegraph.db # Search/index: semantic code index SQLite DB
   │
   └── 7. UI LAYER
   ├── tui.json # Terminal UI config (plugin: ["oh-my-openagent/tui"])
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
 3. Complete Workflow — 9-Phase State Machine
   ╔══════════════════════════╗
   ║ GLOBAL BLOCKING RULES ║
   ║ • Destructive cmds denied║
   ║ • Fail-closed on no state║
   ║ • Gate fail = all blocked║
   ║ • Unapproved = no commit ║
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
│ Gate Decision: PASS?
│ prd_gate=PASS
│ prd_approved=true
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
│ Gate Decision: PASS?
│ plan_gate=PASS
│ approval_status=approved
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
3 prd-review ⛔ momus-prd-reviewer momus-prd: "Gate Decision: PASS" write, edit, git commit/push Gate passes: prd_gate=PASS
4 issue-creation issue-creator none none Auto: path contains "plan"
5 plan-writing plan-writer none none Manual: plan_written
6 plan-review ⛔ momus-plan-reviewer momus-plan: "Gate Decision: PASS" write, edit, git commit/push Gate passes: plan_gate=PASS
7 execution wave-executor checkpoint-3 (between waves) bash (non-destructive only) Manual: wave approval; self-loop on evidence
8 validation regression-gate script: regression-gate.sh (exit 0) none Manual: user_confirms_validation
9 close ⛔ plan-closer evidence_check: evidence_logged==true bd close unless logged Manual: user_confirms_close
Agent Routing (17 runtime agents × 9 categories)
17 Named Agents (runtime): sisyphus (kimi-k2.7-code, ultrawork: minimax-m3), hephaestus (deepseek-v4-pro), oracle (gpt-5.4, high), librarian (minimax-m2.7), explore (deepseek-v4-flash-free), multimodal-looker (mimo-v2.5-free), prometheus (glm-5.2), metis (qwen3.7-plus), momus (glm-5.2), atlas (kimi-k2.5), sisyphus-junior (kimi-k2.7-code), archivist (glm-5.1), athena (deepseek-v4-flash-free), auditor (deepseek-v4-flash-free), explorer (deepseek-v4-flash-free), post-reviewer (glm-5.2), reviewer (glm-5.2)
9 Categories (via task(category='...')): deep→glm-5.1, ultrabrain→deepseek-v4-pro, visual-engineering→gemini-3.1-pro, quick→deepseek-v4-flash-free, unspecified-high→glm-5.1, unspecified-low→deepseek-v4-flash-free, writing→qwen3.7-max, artistry→mimo-v2.5-free, git-commit-message→deepseek-v4-flash-free
Most constrained models: glm-5.1 and glm-5.2 (concurrency: 1 each). glm-5.2 is primary for 3 categories (deep, writing, unspecified-high) + 2 agents (prometheus, momus); glm-5.1 is primary for 1 agent (archivist).

8 Subagent .md Permissions (security boundaries)
Only 2 agents have write access: archivist (restricted to ~/Main-vault/wiki/\*\*) and fullstack-dev-tester (edit: \*: allow). All others are read-only or read+network. oracle is the most restricted (read-only, no bash, no edit).
