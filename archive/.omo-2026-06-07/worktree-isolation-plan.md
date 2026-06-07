# Worktree Isolation Experiment Plan

**Status:** Draft · **Version:** 1.0.0 · **Scope:** Experiment on `developer/sisy-dev`

## 1. Motivation

Our three-round analysis (Sisyphus → Oracle → Reviewer) converged on a recommendation:
> **Experiment with git worktree isolation**, but only after understanding the 7 shared-state
> sources that worktrees do NOT isolate.

This document is that experiment plan: concrete setup, wave assignments, sync protocol,
merge strategy, success criteria, and rollback.

## 2. Candidate Project

**Project:** `/home/vladi/developer/sisy-dev`
**Rationale:** Non-critical development project (open-design-clone). No production deploys.
Minimal team coordination (solo). Already has `.sisyphus/` with plan artifacts.

**Not considered:** Production repositories, shared repos, anything with automated deploys.

## 3. Shared State Analysis — 7 Sources Worktrees Don't Isolate

Worktrees share the `.git/` directory and the working tree's parent `HEAD`. They do
NOT isolate:

| # | State Source | Path | Risk | Mitigation |
|---|---|---|---|---|
| 1 | **Project `.sisyphus/state/`** | `sisy-dev/.sisyphus/state/` | Worktrees share working directory contents at checkout time — but `.sisyphus/` is tracked? Check if it's in `.gitignore`. | Pre-sync: copy state to worktree-local prefix before starting parallel work. Post-sync: merge state files on completion. |
| 2 | **Project `.sisyphus/notepads/`** | `sisy-dev/.sisyphus/notepads/` | Review artifacts get overwritten if both waves run Momus at the same time. | Stagger Momus gates. Use worktree-prefixed filenames. |
| 3 | **Project `.sisyphus/plans/`** | `sisy-dev/.sisyphus/plans/` | Wave 1 reads plan while Wave 2 modifies it. | Copy plan into each worktree at fork. Wave 2 updates are rebased onto Wave 1's plan after merge. |
| 4 | **Global beads database** | `~/.beads/` | Both worktrees' `bd` commands mutate the same SQLite/JSON store. | **High risk.** Beads issues would be claimed by both worktrees simultaneously. Solution: use `bd --state-dir` to redirect each worktree to its own state dir. |
| 5 | **Global boulder state** | `~/.omo/boulder.json` | Session persistence share conflicts. | **Hard block.** Boulder is single-instance by design. Worktree work must NOT run concurrent boulder sessions. Use `--boulder-disable` or run only one boulder-aware worktree at a time. |
| 6 | **Hotcache/session state** | `~/.omo/run-continuation/` | Session continuation files collide. | Separate OpenCode sessions in each worktree (which happens naturally — different `cwd`). |
| 7 | **Global OpenCode state** | `~/.config/opencode/` | LSP servers, plugin state, skill cache. | All read. Plugins (including sisyphus-gates) read global state file — this file needs worktree-awareness or per-worktree copies. |

## 4. Wave Assignment

The experiment runs two parallel waves on sisy-dev's existing `open-design-clone` PRD:

| Wave | Task | Worktree | Requires |
|---|---|---|---|
| **Wave 1** | Implement component extraction (slice 1-3) | `../sisy-dev-w1` | Plan doc, beads issues 1-3 |
| **Wave 2** | Implement CSS theme system (slice 4-5) | `../sisy-dev-w2` | Plan doc, beads issues 4-5 |

**Constraint:** Waves must be independent (no shared code changes). If they touch the same files,
serialization is required — which defeats the purpose of parallel worktrees.

**Verification:** Check `git diff --stat` between wave slices before forking. If overlap > 20%,
serialize instead.

## 5. Setup Procedure

```bash
# 1. Fork worktrees from last clean commit
cd /home/vladi/developer/sisy-dev
git checkout -b experiment/worktree-isolation
git push -u origin experiment/worktree-isolation    # only if remote tracking needed

# 2. Create worktrees
git worktree add ../sisy-dev-w1 experiment/worktree-isolation
git worktree add ../sisy-dev-w2 experiment/worktree-isolation

# 3. Seed shared state into each worktree
for wt in ../sisy-dev-w1 ../sisy-dev-w2; do
  mkdir -p "$wt/.sisyphus/state" "$wt/.sisyphus/notepads" "$wt/.sisyphus/evidence"
  cp -r .sisyphus/state/open-design-clone.json "$wt/.sisyphus/state/"
  cp -r .sisyphus/plans/ "$wt/.sisyphus/plans/"
done
```

## 6. Synchronization Protocol

### 6.1 During Parallel Execution

| Interval | Action | Tool |
|---|---|---|
| Every 5 tool calls or ~10 min | Export state snapshot from each worktree | `rsync -a --exclude='*.lock' .sisyphus/state/ ~/.sisyphus/merge/state-w1/` |
| On demand | Check shared state for conflicts | `diff <worktree1>/.sisyphus/state/ <worktree2>/.sisyphus/state/` |
| On `Gate: PASS` | Sync the review output to main worktree | `cp notepads/momus-* ../sisy-dev/.sisyphus/notepads/` |

### 6.2 Beads Isolation

**Critical:** Both worktrees must NOT use the same beads store. Two options:

**Option A (Recommended): Beads state directory per worktree**
```bash
export BEADS_STATE_DIR="$PWD/.beads-worktree"
bd init  # initialize per-worktree beads store
```
Then claims/status are fully isolated. On merge, we reconcile via `bd export`/`bd import`.

**Option B (Simple but lossy): Use a beads tag prefix**
```bash
bd claim 4 --tag "w1"   # Wave 1 claims issue 4
bd claim 4 --tag "w2"   # Wave 2 also claims issue 4 (no isolation, metadata only)
```
Lossy — both can claim the same issue. Only use for short experiments.

### 6.3 Work File Conflict Detection

Run every 10 minutes during parallel execution:

```bash
for f in $(comm -12 \
  <(cd ../sisy-dev-w1 && git diff --name-only HEAD) \
  <(cd ../sisy-dev-w2 && git diff --name-only HEAD)); do
  echo "CONFLICT: $f is modified in both worktrees"
done
```

If any file is modified in both worktrees, one must be abandoned or the conflict merged manually.

## 7. Merge Workflow

### 7.1 Completion Sequence

```
Step 1: PAUSE both worktrees (no more changes)
Step 2: beads export from both worktrees → ~/.sisyphus/merge/beads-w1.json, beads-w2.json
Step 3: Sync state files from both worktrees → main worktree
Step 4: Merge files in main worktree
Step 5: Resolve conflicts
Step 6: Close beads issues in merged main worktree
Step 7: Remove worktrees
```

### 7.2 Merge Commands

```bash
cd /home/vladi/developer/sisy-dev

# Step 3: Sync state from both worktrees
cp ../sisy-dev-w1/.sisyphus/state/*.json .sisyphus/state/
cp ../sisyphus-w2/.sisyphus/state/*.json .sisyphus/state/

# Step 4: Pull changes via rebase
git checkout experiment/worktree-isolation
git fetch ../sisy-dev-w1
git rebase FETCH_HEAD  # or merge
git fetch ../sisy-dev-w2
git rebase FETCH_HEAD  # resolve conflicts here

# Step 5: Merge beads
bd import --file ~/.sisyphus/merge/beads-w1.json
bd import --file ~/.sisyphus/merge/beads-w2.json

# Step 6: Verify
bd close 1-5  # all issues if complete
```

## 8. Success Criteria

| Criterion | Measurement | Target |
|---|---|---|
| Total wall-clock time | `date` at start → `date` at end | Less than serial execution |
| Merge conflicts | `git log --merges` count | 0 or 1, trivial |
| Duplicate beads claims | `bd list --status closed` dedup | Zero duplicates |
| State consistency | `gate_history` in state files | Sequential, no gaps |
| Code correctness | Tests pass on merged branch | All existing tests pass |

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Beads store corruption | Medium | High | Use per-worktree beads dir + import/export |
| Git merge conflicts on code | Medium | Medium | Check overlap before forking; abort if >20% |
| LSP/plugin state confusion | Low | Medium | Each worktree gets its own OpenCode session |
| sisyphus-gates global state collision | High | High | Both worktrees read `state.json` — must disable gate checks or use separate state files |
| Motivation failure (forgetting to sync) | Medium | Low | Use shell hook: `PROMPT_COMMAND` to ping every 10th invocation |

## 10. Rollback Plan

If any of the following occur, abort the experiment and merge serially:

1. **Beads store corruption** — `bd list` returns empty or raises errors
2. **File conflict >10 files** — rebase becomes too expensive
3. **>2 merge conflicts** — code divergence too high for manual resolution
4. **State file overwrite** — `gate_history` shows entries from both worktrees interleaved
5. **Any test regression** — merge introduced regressions not caught by diff

### Rollback Commands

```bash
# 1. Abandon worktrees
git worktree remove ../sisy-dev-w1
git worktree remove ../sisy-dev-w2

# 2. Remove merge directory
rm -rf ~/.sisyphus/merge/

# 3. Restore main worktree to last clean commit
cd /home/vladi/developer/sisy-dev
git checkout experiment/worktree-isolation
git reset --hard HEAD  # discards uncommitted changes brought back from worktrees

# 4. Proceed serially: run each wave one at a time
```

## 11. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-25 | Run experiment on sisy-dev | Non-critical, solo project with existing plan artifacts |
| 2026-05-25 | Per-worktree beads dir (Option A) | Beads isolation is critical for valid results |
| 2026-05-25 | Skip boulder-aware worktrees | Boulder is single-instance; only one worktree can run boulder at a time |
| 2026-05-25 | Stagger Momus gates | Review artifacts would collide if run simultaneously |
| 2026-05-25 | Rebase over merge for combining worktrees | Cleaner history when integrating parallel development |
