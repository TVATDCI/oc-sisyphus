---
name: workflow-guard
description: "Soft guard that advises when agent actions deviate from expected workflow patterns. Use when: (1) agent makes edits outside tracked workflow, (2) user wants awareness of untracked changes, (3) enforcing .sisyphus discipline. Triggers: 'guard workflow', 'track edits', 'watch for untracked changes'."
compatibility: opencode
---

# Workflow Guard

Soft advisory system that detects when agent edits bypass tracked workflows. Does NOT block — only warns and logs.

## Why This Exists

**Problem:** Agents make direct edits without updating:
- `.sisyphus/state/*.json` (progress tracking)
- Evidence files (TDD logs, regression reports)
- Plan/task completion status

**Result:** State drift — the tracking says one thing, reality says another.

**Solution:** Detect untracked edits and advise the agent (and user) to update tracking.

## When to Trigger

**Guard these file types:**
| Pattern | Why Guarded | What to Track |
|---------|-------------|-------------|
| `src/**/*.js` | Source code changes | Update plan-updater, log evidence |
| `src/**/*.ts` | Source code changes | Update plan-updater, log evidence |
| `tests/**/*.test.*` | Test changes | Update TDD log, regression gate |
| `public/**/*` | Frontend changes | Update evidence, checkpoint |
| `*.config.*` | Config changes | Document in decisions, update state |

**Allow these without guarding:**
| Pattern | Reason |
|---------|--------|
| `.sisyphus/**/*` | These ARE the tracking files |
| `.gitignore` | Repo hygiene, not workflow |
| `README.md` | Documentation update |
| `.env*` | Environment config |
| `package.json` (version bumps) | Standard maintenance |

## Guard Behavior

**When an Edit/Write tool targets a guarded file:**

1. **Check if in workflow context**
   - Is `wave-executor` or `tdd-executor` currently running?
   - Is the edit part of an approved plan?
   - Is there an active `.sisyphus/state/*.json` file?

2. **If YES (in workflow):**
   - Log silently (no warning)
   - Continue with edit

3. **If NO (outside workflow):**
   - Inject advisory context:
     ```
     ⚠️ WORKFLOW ADVISORY: Editing {filename} outside tracked workflow.
     
     This change will not be reflected in:
     - .sisyphus/state/*.json
     - Evidence logs
     - Plan progress
     
     Consider:
     1. Using wave-executor for planned changes
     2. Running plan-updater after this edit
     3. Documenting in .sisyphus/notepads/ if this is an ad-hoc fix
     
     If this is intentional (e.g., hotfix, config tweak), proceed.
     ```

## Implementation in wave-executor

**Add to wave-executor SKILL.md:**

```markdown
## Workflow Guard Check

**After each Edit/Write during execution:**

1. Was this edit part of the current slice plan?
   - YES → Mark as completed in slice checklist
   - NO → Log as deviation (Rule 1-3 auto-fixes are OK)

2. Did the edit create a new file not in the plan?
   - YES → Log as "additional artifact" in evidence
   - NO → Continue

3. Did the edit modify files outside `src/` scope?
   - YES → Warn: "Config change detected — update plan notes"
   - NO → Continue
```

## Manual Invocation

**User can trigger guard manually:**

```
User: "guard workflow"

Agent:
1. Scan recent edits (last 10 minutes)
2. Check which were tracked in .sisyphus/
3. Report untracked changes:

## Workflow Guard Report

**Recent Edits:**
| File | Time | Tracked? | Action Needed |
|------|------|----------|---------------|
| src/auth.js | 14:32 | ✓ | None |
| src/utils.js | 14:35 | ✗ | Run plan-updater |
| .env | 14:36 | N/A | Document in notepad |

**Recommendation:** Run plan-updater to log the utils.js change.
```

## Opencode Limitations

**Unlike Claude Code hooks, Opencode does not support PreToolUse interception.**

**Workarounds:**
1. **In-skill guarding:** wave-executor checks after each Edit (manual)
2. **Post-hoc scanning:** Periodically scan for untracked changes
3. **User-triggered:** User runs "guard workflow" on demand

**This skill is advisory only.** It cannot block edits.

## Integration

**With wave-executor:**
- After each task completion: "Did you create/modify files? Update evidence."
- After wave completion: "Run plan-updater to log all changes."

**With plan-updater:**
- When logging progress: "Any untracked changes from this wave?"

**With plan-closer:**
- Before closure: "Scan for evidence gaps — any changes without logs?"

## Model Selection

**Category:** `unspecified-low`

Runtime model and fallbacks are resolved from `oh-my-openagent.json` by category. Do not hardcode model identifiers here — they drift on every model refresh.

Purely mechanical: scan files, compare with evidence logs, report gaps.

## Anti-Patterns

- ❌ Blocking edits (impossible in Opencode, would be wrong anyway)
- ❌ Warning on every edit (noise) — only warn for untracked changes
- ❌ Ignoring intentional ad-hoc fixes — these are valid
- ❌ Creating evidence for trivial changes (comments, formatting)
