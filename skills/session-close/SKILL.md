---
name: session-close
description: "Session completion workflow for both real projects and test artifacts. Use when: (1) user says 'session-close', 'done', 'archive', 'wrap up', (2) ending a work session, (3) checkpoint/save-state requests. Triggers: session-close, done, archive, wrap up, checkpoint, save state."
compatibility: opencode
---

# Session Close Protocol

## Classification (Mandatory First Step)

Detect project type before executing workflow:

- **Real project**: production code, client work, Main-vault wiki — code will be shared/pushed
- **Test artifact**: any directory under `~/developer/test-artifacts/` — ephemeral learning exercise

---

## For Real Projects

Work is NOT complete until `git push` succeeds.

### MANDATORY WORKFLOW:

1. **File issues for remaining work** - Create beads issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE**:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

### Critical Rules
- NEVER stop before pushing — that leaves work stranded locally
- NEVER say "ready to push when you are" — YOU must push
- If push fails, resolve and retry until it succeeds

---

## For Test Artifacts

Test artifacts in directories like `~/developer/test-artifacts/` do NOT need git initialization or remote push.

### Workflow:
1. Close beads issues locally (`bd close <id>`)
2. Update state file (`.sisyphus/state.json`)
3. Run cleanup checklist (see `~/.config/opencode/CLEANUP.md`) — archive old iterations, prune stale memory entries
3. Document evidence in `.sisyphus/evidence/`
4. **SKIP git push** — test artifacts are local-only
5. **SKIP `bd dolt push`** — beads issues stay local for tests
6. Hand off context with test results summary

---

## Checkpoint / Save State

When user says `checkpoint` or `save state`:

1. Run `/skill:checkpoint` if available (or equivalent save mechanism)
2. Update `hotcache.md` with current decisions + open questions
3. Write a timestamped evidence entry to `.sisyphus/evidence/`

---

## Output Format

Present when done: `"Session archived. State: [summary]. Next: [action]"`
