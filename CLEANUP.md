# OpenCode Environment Cleanup Policy

**Purpose:** Prevent accumulated mess. Run this checklist after each skill iteration, session, or wave.

## After Each Skill Iteration

- [ ] Archive or delete older `iteration-N/` directories after validation passes
- [ ] Keep only: latest validated iteration + `evals.json` in skill root
- [ ] If keeping workspace dirs, add/update `README.md` explaining what's there

## After Each Session

- [ ] Update `~/.sisyphus/state.json` if project phase changed
- [ ] Update `~/.sisyphus/hotcache.md` with current decisions + open questions
- [ ] Write timestamped evidence entry to `~/.sisyphus/evidence/` if meaningful work was done
- [ ] Review `bd memories` — remove entries that are now resolved or outdated
- [ ] If `.sisyphus/` duplicates appear under `.config/opencode/`, migrate unique content and delete the stale copy

## After Each Skill Is Validated (e.g., 48/48 evals)

- [ ] Delete all raw eval outputs from workspace dirs (keep only `evals.json` + grading report)
- [ ] Archive old `SKILL.md` drafts if they exist outside the canonical path
- [ ] Verify agent file uses `load_skills` (thin wrapper) not inline skill content
- [ ] Verify no script references the old `.config/opencode/.sisyphus/` path

## Weekly

- [ ] Audit `~/.sisyphus/notepads/` for stale handoff files (>2 weeks old)
- [ ] Audit `~/.sisyphus/evidence/` for stale test artifacts
- [ ] Check `~/.config/opencode/skills/*-workspace/` for accumulated iterations
- [ ] Verify canonical `.sisyphus/` path is the only one in use

## Canonical Paths (Single Source of Truth)

| Resource | Canonical Path |
|----------|---------------|
| Project state | `~/.sisyphus/state.json` |
| Workflow definition | `~/.sisyphus/workflow.yaml` |
| Execution metadata | `~/.sisyphus/metadata/` |
| Evidence | `~/.sisyphus/evidence/` |
| Notepads | `~/.sisyphus/notepads/` |
| Plans | `~/.sisyphus/plans/` |
| Compaction handoff | `~/.sisyphus/hotcache.md` |
| Skills | `~/.config/opencode/skills/` |
| Agents | `~/.config/opencode/agents/` |
| Project-level state | `<project>/.sisyphus/` (e.g., `~/Main-vault/.sisyphus/` for vault-specific plans/boulder) — separate from global `~/.sisyphus/` |

**The stale path `~/.config/opencode/.sisyphus/` should not exist.** If it reappears, scripts are still referencing it — grep and fix.

## Retention Rules

| Artifact | Keep For | Action After |
|----------|----------|-------------|
| Eval outputs (workspace/iteration-N/) | Until next validated iteration | Archive or delete |
| Session handoff files | 2 weeks | Delete or archive |
| Evidence files | 1 month | Review, delete if stale |
| State.json snapshots | Until next state update | Overwrite (don't accumulate) |
| Skill drafts | Until validation | Delete after SKILL.md finalized |
| Agent test files | Until agent deployed | Delete after successful deployment test |

## One-Liner: Quick Health Check

```bash
# Check for duplicate .sisyphus dirs
ls -d ~/.sisyphus ~/.config/opencode/.sisyphus 2>/dev/null | wc -l
# Should output: 1 (only the home dir)

# Check for stale workspace iterations
find ~/.config/opencode/skills/*-workspace/ -maxdepth 1 -type d | sort
# Should show only current iterations, not years of history

# Check for old evidence
ls -lt ~/.sisyphus/evidence/ | tail -5
# Review the oldest files
```
