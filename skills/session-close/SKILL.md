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
3. **Run COMPLETE-CODEBASE.md drift check** — If this session touched skills, agents, routing, permissions, workflow docs, scripts, or canonical paths:
   - Update `Last reviewed` date in header
   - Check skill count / notable skill changes
   - Check agent routing (named agents, categories, models)
   - Check subagent permissions (count, write-capable agents)
   - Append one timeline entry for this session/wave
   - Fix any moved/renamed/canonical path references
   - If nothing relevant changed, note `"COMPLETE-CODEBASE check: no update needed"` in evidence
4. **Log session (4-layer routing — MANDATORY)**

   Route session output across 4 layers. Do NOT improvise; follow this exactly:

   | Layer | Where | What | How much |
   |---|---|---|---|
   | 1 (Brief) | `SYSTEM-NARRATIVE.md` LIVING block Session log | One-line session summary | **≤3 lines, hard cap** |
   | 2 (Detail) | `~/Main-vault/log.md` | Full bullets (files, decisions, evidence, next) | Delegate to `archivist` — path is outside main agent's write scope |
   | 3 (Evidence) | `.omo/evidence/session-close-{YYYY-MM-DD}-{slug}.md` | Raw provenance, full session record | Direct write |
   | 4 (Memory) | `bd remember` | Per-fact cross-session memory | Direct call, source-attributed |

   **Hard rule:** if a session summary doesn't fit in 3 lines, the excess MUST go to Layer 2 — never to Layer 1. The skill enforces this; agent discretion does not.

   **Layer 2 entry format** (delegate to archivist with this exact template):
   ```markdown
   ## [YYYY-MM-DD] session | {one-line summary}
   - **Files touched:** {paths}
   - **Decisions:** {key choices}
   - **Evidence:** `.omo/evidence/session-close-{date}-*.md`
   - **bd remember:** {key entry slugs}
   - **Next:** {follow-up}
   ```

   **Layer 4 bd remember slug pattern:** `session-close:{YYYY-MM-DD}:{category}:{fact}` (matches existing convention — see `bd memories` for examples).
5. **Update issue status** - Close finished work, update in-progress items
6. **PUSH TO REMOTE**:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
7. **Clean up** - Clear stashes, prune remote branches
8. **Verify** - All changes committed AND pushed
9. **Hand off** - Provide context for next session

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
4. **Run COMPLETE-CODEBASE.md drift check** — If this session touched skills, agents, routing, permissions, workflow docs, scripts, or canonical paths, update the relevant sections (see Real Projects step 3 for the sub-check list). If nothing changed, note `"COMPLETE-CODEBASE check: no update needed"` in evidence.
5. Document evidence in `.sisyphus/evidence/`
6. **SKIP git push** — test artifacts are local-only
7. **SKIP `bd dolt push`** — beads issues stay local for tests
8. Hand off context with test results summary

---

## Checkpoint / Save State

When user says `checkpoint` or `save state`:

1. Run `/skill:checkpoint` if available (or equivalent save mechanism)
2. Update `hotcache.md` with current decisions + open questions
3. Write a timestamped evidence entry to `.sisyphus/evidence/`

---

## Output Format

Present when done: `"Session archived. State: [summary]. Logged: L1 SN / L2 Main-vault-log / L3 evidence / L4 bd remember. Next: [action]"`
